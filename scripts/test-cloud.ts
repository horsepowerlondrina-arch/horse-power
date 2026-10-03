import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresDatabase } from "../server/db/postgres";
import { createApp } from "../server/app";
import { hashPassword } from "../server/auth/session";
const db = createPostgresDatabase();
const tenant = "verification-" + randomUUID(),
  user = tenant + "-admin",
  email = tenant + "@example.com";
const password = randomUUID() + randomUUID();
await db.transaction(async () => {
  await db
    .prepare("INSERT INTO tenants(id,name) VALUES(?,?)")
    .run(tenant, "Verification temporary");
  await db
    .prepare("INSERT INTO users VALUES(?,?,?,?)")
    .run(user, "Verification", email, hashPassword(password));
  await db
    .prepare("INSERT INTO memberships VALUES(?,?,?)")
    .run(user, tenant, "owner");
});
const server = createApp(db).listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as any).port}/api`;
let cookie = "";
async function call(path: string, body?: any, method = body ? "POST" : "GET") {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (response.headers.get("set-cookie"))
    cookie = response.headers.get("set-cookie")!.split(";")[0];
  assert.equal(
    response.status < 400,
    true,
    `${path}: ${response.status} ${JSON.stringify(json)}`,
  );
  return json;
}
try {
  await call("/login", { email, password });
  const session = await call("/session");
  assert.equal(session.tenant.id, tenant);
  const customer = await call("/customers-with-vehicle", {
    customer: { name: "Cliente de validação" },
    vehicle: {
      plate: "TST1A23",
      brand: "Teste",
      model: "Teste",
      year: 2020,
      km: 0,
    },
  });
  const product = await call("/catalog", {
    kind: "product",
    name: "Peça teste",
    sku: "TST",
    cost: 4000,
    price: 10000,
    stock: 3,
    minimum_stock: 0,
  });
  const input = {
    customer_id: customer.id,
    vehicle_id: customer.vehicle_id,
    status: "quote",
    entered_on: "2026-10-03",
    due_on: "2026-10-04",
    km: 0,
    discount: 0,
    items: [{ catalog_id: product.id, quantity: 1, price: 10000 }],
  };
  const order = await call("/orders", input);
  const second = await Promise.all([
    call("/orders", { ...input, status: "quote", items: [] }),
    call("/orders", { ...input, status: "quote", items: [] }),
  ]);
  assert.notEqual(second[0].id, second[1].id);
  for (const status of ["open", "working", "ready", "completed"])
    await call(`/orders/${order.id}/status`, { status });
  let workspace = await call("/workspace");
  const receivable = workspace.receivables.find(
    (r: any) => r.order_id === order.id,
  );
  assert.equal(
    workspace.orders.find((o: any) => o.id === order.id).display_status,
    "awaiting_payment",
  );
  assert.equal(workspace.catalog[0].stock, 2);
  await call(`/receivables/${receivable.id}/plan`, {
    method: "Cartão de crédito",
    installments: 2,
    card_fee_bps: 451,
    interest_bps: 100,
    first_due_on: "2026-10-04",
    pass_card_fee: false,
  });
  workspace = await call("/workspace");
  const part = workspace.installments[0];
  const double = await Promise.all(
    [1, 2].map(() =>
      fetch(base + `/installments/${part.id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: "{}",
      }),
    ),
  );
  assert.deepEqual(double.map((r) => r.status).sort(), [200, 400]);
  await call(`/installments/${workspace.installments[1].id}/settle`, {});
  workspace = await call("/workspace");
  assert.equal(workspace.receivables[0].status, "paid");
  assert.equal(workspace.cash.length, 2);
  assert.equal(
    workspace.cash.reduce((s: number, r: any) => s + r.amount, 0),
    workspace.receivables[0].net_total,
  );
  const expense = await call("/payables", {
    description: "Despesa teste",
    supplier: "Teste",
    category: "Teste",
    amount: 5000,
    due_on: "2026-10-04",
  });
  await call(`/payables/${expense.id}/pay`, {
    paid_on: "2026-10-03",
    method: "Pix",
  });
  assert.equal((await call("/expenses")).payables[0].status, "paid");
  const share = await call(`/orders/${order.id}/share`, {});
  const publicView = await fetch(
    base + "/public/" + share.path.split("/").pop(),
  ).then((r) => r.json());
  assert.equal(publicView.total, 10000);
  assert.equal(publicView.items[0].cost, undefined);
  await call(`/orders/${order.id}/revoke-share`, {});
  assert.equal(
    (await fetch(base + "/public/" + share.path.split("/").pop())).status,
    404,
  );
  await db
    .prepare("UPDATE memberships SET role='operator' WHERE user_id=?")
    .run(user);
  const mechanic = await call("/workspace");
  assert.equal(mechanic.cash.length, 0);
  assert.equal(mechanic.orders[0].total, undefined);
  assert.equal(
    (await fetch(base + "/expenses", { headers: { Cookie: cookie } })).status,
    403,
  );
  console.log(
    "Cloud E2E passed: login, session, customer+vehicle, product, quotes, order, stock, installments, duplicate receipt race, expense, public link, mechanic restrictions.",
  );
} finally {
  await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  await db.transaction(async () => {
    for (const t of [
      "public_shares",
      "cash_entries",
      "payment_installments",
      "receivables",
      "stock_movements",
      "order_items",
      "orders",
      "service_aliases",
      "service_merge_history",
      "payables",
      "expense_templates",
      "card_rates",
      "payment_settings",
      "catalog",
      "vehicles",
      "customers",
      "professionals",
      "sessions",
      "memberships",
      "audit_events",
    ])
      await db.prepare(`DELETE FROM ${t} WHERE tenant_id=?`).run(tenant);
    await db.prepare("DELETE FROM users WHERE id=?").run(user);
    await db.prepare("DELETE FROM tenants WHERE id=?").run(tenant);
  });
  await db.close();
}
