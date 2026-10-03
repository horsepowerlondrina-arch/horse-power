import { calculatePlan, addMonthsClamped } from "../server/domain/payments";
import { configurePlan, settleInstallment } from "../server/services/payments";
import { listOrders } from "../server/services/workshop";
import { lookupVehicle } from "../server/services/vehicleLookup";
import { filterOrders, revenueBreakdown } from "../src/lib/workflow";
import type { Order } from "../src/lib/types";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatabase, type DB } from "../server/db/database";
import { hashPassword } from "../server/auth/session";
import {
  saveOrder,
  transitionOrder,
  settle,
} from "../server/services/workshop";
import { totalOf } from "../server/domain/orders";
import { createApp } from "../server/app";
const ctx = { userId: "user", tenantId: "a", role: "owner" };
function fixture(path = ":memory:") {
  const db = createDatabase(path);
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
    "user",
    "Teste",
    "test@example.com",
    hashPassword("password-test"),
  );
  for (const tenant of ["a", "b"]) {
    db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run(
      tenant,
      `Oficina ${tenant}`,
    );
    db.prepare("INSERT INTO customers(id,tenant_id,name) VALUES(?,?,?)").run(
      `${tenant}-customer`,
      tenant,
      "Cliente Teste",
    );
    db.prepare(
      "INSERT INTO vehicles(id,tenant_id,customer_id,plate,brand,model,year) VALUES(?,?,?,?,?,?,?)",
    ).run(
      `${tenant}-vehicle`,
      tenant,
      `${tenant}-customer`,
      "ABC1D23",
      "Honda",
      "Civic",
      2022,
    );
    db.prepare(
      "INSERT INTO catalog(id,tenant_id,kind,name,sku,cost,price,stock,minimum_stock) VALUES(?,?,?,?,?,?,?,?,?)",
    ).run(
      `${tenant}-product`,
      tenant,
      "product",
      "Peça teste",
      "SKU-1",
      4000,
      10000,
      5,
      1,
    );
  }
  db.prepare("INSERT INTO memberships VALUES(?,?,?)").run("user", "a", "owner");
  return db;
}
const input = (extra: Record<string, any> = {}) => ({
  customer_id: "a-customer",
  vehicle_id: "a-vehicle",
  status: "open",
  entered_on: "2026-09-19",
  due_on: "2026-09-20",
  km: 10000,
  problem: "Teste",
  notes: "",
  discount: 500,
  items: [{ catalog_id: "a-product", quantity: 2, price: 10000 }],
  ...extra,
});
async function ready(db: DB, record: string) {
  await transitionOrder(db, ctx, record, "working");
  await transitionOrder(db, ctx, record, "ready");
}
test("cálculo usa centavos e rejeita desconto maior que subtotal", () => {
  assert.equal(totalOf([{ price: 1999, quantity: 3 }], 100), 5897);
  assert.throws(() => totalOf([{ price: 100, quantity: 1 }], 101));
});
test("orçamento não baixa estoque; aprovação e conclusão geram efeitos únicos", async () => {
  const db = fixture();
  try {
    const record = await saveOrder(db, ctx, input({ status: "quote" }));
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE id=?").get("a-product")!
        .stock,
      5,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM receivables").get()!.n, 0);
    await transitionOrder(db, ctx, record, "open");
    await ready(db, record);
    await transitionOrder(db, ctx, record, "completed");
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE id=?").get("a-product")!
        .stock,
      3,
    );
    const r = db.prepare("SELECT * FROM receivables").get()!;
    assert.equal(r.amount, 19500);
    await assert.rejects(
      async () => await transitionOrder(db, ctx, record, "completed"),
    );
    await assert.rejects(
      async () => await saveOrder(db, ctx, input(), record),
      /não podem/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM receivables").get()!.n, 1);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM stock_movements").get()!.n,
      1,
    );
  } finally {
    db.close();
  }
});
test("estoque insuficiente reverte todos os efeitos, inclusive itens anteriores", async () => {
  const db = fixture();
  try {
    const record = await saveOrder(
      db,
      ctx,
      input({
        items: [
          { catalog_id: "a-product", quantity: 3, price: 10000 },
          { catalog_id: "a-product", quantity: 3, price: 10000 },
        ],
      }),
    );
    await ready(db, record);
    await assert.rejects(
      async () => await transitionOrder(db, ctx, record, "completed"),
      /insuficiente/,
    );
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE id=?").get("a-product")!
        .stock,
      5,
    );
    assert.equal(
      db.prepare("SELECT status FROM orders WHERE id=?").get(record)!.status,
      "ready",
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM receivables").get()!.n, 0);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM stock_movements").get()!.n,
      0,
    );
  } finally {
    db.close();
  }
});
test("baixa integral gera caixa uma única vez e recusa segunda baixa", async () => {
  const db = fixture();
  try {
    const record = await saveOrder(db, ctx, input());
    await ready(db, record);
    await transitionOrder(db, ctx, record, "completed");
    const r = db.prepare("SELECT id FROM receivables").get()!;
    await settle(db, ctx, String(r.id), "Pix");
    await assert.rejects(
      async () => await settle(db, ctx, String(r.id), "Pix"),
      /já foi/,
    );
    assert.equal(
      db.prepare("SELECT SUM(amount) total FROM cash_entries").get()!.total,
      19500,
    );
    assert.equal(
      db.prepare("SELECT status FROM receivables").get()!.status,
      "paid",
    );
  } finally {
    db.close();
  }
});
test("vínculos de outra oficina e veículo de outro cliente são recusados", async () => {
  const db = fixture();
  try {
    await assert.rejects(
      async () =>
        await saveOrder(db, ctx, input({ customer_id: "b-customer" })),
      /não encontrado/,
    );
    await assert.rejects(
      async () =>
        await saveOrder(
          db,
          ctx,
          input({
            items: [{ catalog_id: "b-product", quantity: 1, price: 10000 }],
          }),
        ),
      /não encontrado/,
    );
    db.prepare("INSERT INTO customers(id,tenant_id,name) VALUES(?,?,?)").run(
      "other",
      "a",
      "Outro cliente",
    );
    await assert.rejects(
      async () => await saveOrder(db, ctx, input({ customer_id: "other" })),
      /não pertence/,
    );
    assert.equal(db.prepare("SELECT COUNT(*) n FROM orders").get()!.n, 0);
  } finally {
    db.close();
  }
});
test("documento finalizado e cancelado não podem ser alterados", async () => {
  const db = fixture();
  try {
    const record = await saveOrder(db, ctx, input());
    await transitionOrder(db, ctx, record, "cancelled");
    await assert.rejects(
      async () => await saveOrder(db, ctx, input(), record),
      /não podem/,
    );
    await assert.rejects(
      async () => await transitionOrder(db, ctx, record, "open"),
    );
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE id=?").get("a-product")!
        .stock,
      5,
    );
  } finally {
    db.close();
  }
});
test("snapshot de preço não muda ao alterar o catálogo", async () => {
  const db = fixture();
  try {
    const record = await saveOrder(db, ctx, input());
    db.prepare("UPDATE catalog SET price=99999 WHERE id=?").run("a-product");
    assert.equal(
      db.prepare("SELECT total FROM orders WHERE id=?").get(record)!.total,
      19500,
    );
    assert.equal(
      db.prepare("SELECT price FROM order_items WHERE order_id=?").get(record)!
        .price,
      10000,
    );
  } finally {
    db.close();
  }
});
test("dados persistem ao fechar e reabrir o banco", async () => {
  const dir = mkdtempSync(join(tmpdir(), "horse-power-test-"));
  const path = join(dir, "test.sqlite");
  try {
    const db = fixture(path);
    const record = await saveOrder(db, ctx, input());
    db.close();
    const reopened = createDatabase(path);
    try {
      assert.equal(
        reopened.prepare("SELECT total FROM orders WHERE id=?").get(record)!
          .total,
        19500,
      );
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("API autentica, protege oficinas, valida entrada e revoga sessão", async () => {
  const db = fixture();
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  let cookie = "";
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    origin?: string,
  ) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res;
  };
  try {
    assert.equal((await request("/workspace")).status, 401);
    const login = await request("/login", "POST", {
      email: "test@example.com",
      password: "password-test",
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.match(login.headers.get("set-cookie")!, /HttpOnly/);
    const workspace = await (await request("/workspace")).json();
    assert.deepEqual(
      workspace.customers.map((c: any) => c.id),
      ["a-customer"],
    );
    assert.equal(
      (await request("/tenant", "POST", { tenant_id: "b" })).status,
      403,
    );
    assert.equal(
      (await request("/customers/b-customer", "PUT", { name: "Intruso" }))
        .status,
      404,
    );
    assert.equal(
      (await request("/orders", "POST", input({ customer_id: "b-customer" })))
        .status,
      404,
    );
    assert.equal(
      (await request("/orders", "POST", input({ due_on: "2026-02-31" })))
        .status,
      400,
    );
    assert.equal(
      (
        await request(
          "/orders",
          "POST",
          input({
            items: [{ catalog_id: "a-product", quantity: -1, price: 10000 }],
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/customers",
          "POST",
          { name: "Blocked" },
          "https://untrusted.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/customers", "POST", { name: "Persistente" })).status,
      200,
    );
    assert.equal(
      (await (await request("/workspace")).json()).customers.length,
      2,
    );
    assert.equal((await request("/logout", "POST", {})).status, 200);
    assert.equal((await request("/workspace")).status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});

test("orçamento avulso preserva seu tipo ao cancelar e exige vínculos na aprovação", async () => {
  const db = fixture();
  try {
    const guest = await saveOrder(
      db,
      ctx,
      input({
        status: "quote",
        customer_id: null,
        vehicle_id: null,
        guest_name: "Consulta sem cadastro",
      }),
    );
    assert.equal(
      (await listOrders(db, "a"))[0].customer_name,
      "Consulta sem cadastro",
    );
    await assert.rejects(
      async () => await transitionOrder(db, ctx, guest, "open"),
      /Vincule/,
    );
    await transitionOrder(db, ctx, guest, "cancelled");
    const rows = (await listOrders(db, "a")) as Order[];
    assert.equal(filterOrders(rows, true, "all").length, 1);
    assert.equal(filterOrders(rows, true, "cancelled").length, 1);
    assert.equal(filterOrders(rows, false, "all").length, 0);
    const quote = await saveOrder(
      db,
      ctx,
      input({ status: "quote", customer_id: null, vehicle_id: null }),
    );
    await saveOrder(db, ctx, input({ status: "quote" }), quote);
    await transitionOrder(db, ctx, quote, "open");
    assert.equal(
      db.prepare("SELECT kind FROM orders WHERE id=?").get(quote)!.kind,
      "order",
    );
  } finally {
    db.close();
  }
});
test("parcelas conservam centavos, taxas e líquido, inclusive nos limites de arredondamento", () => {
  for (const base of [1, 7, 24, 99, 100, 101, 1999, 10001])
    for (const count of [1, 2, 3, 7, 24].filter((n) => n <= base))
      for (const fee of [0, 1, 333, 4999, 5000, 9999, 10000]) {
        const plan = calculatePlan(base, {
          method: "Cartão de crédito",
          installments: count,
          card_fee_bps: fee,
          interest_bps: count > 1 ? 399 : 0,
          first_due_on: "2026-01-31",
        });
        for (const key of ["gross", "fee", "net", "interest"] as const)
          assert.equal(
            plan.installments.reduce((s, p) => s + p[key], 0),
            plan[key],
          );
        assert.equal(
          plan.installments.reduce((s, p) => s + p.principal, 0),
          base,
        );
        for (const p of plan.installments) {
          assert.ok(p.interest >= 0);
          assert.ok(p.net >= 0);
          assert.ok(p.fee >= 0);
          assert.equal(p.net + p.fee, p.gross);
        }
      }
  assert.equal(addMonthsClamped("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonthsClamped("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonthsClamped("2026-01-31", 2), "2026-03-31");
  const plan = calculatePlan(10000, {
    method: "Cartão de crédito",
    installments: 3,
    card_fee_bps: 350,
    interest_bps: 1000,
    first_due_on: "2026-01-31",
  });
  assert.deepEqual(
    [plan.interest, plan.gross, plan.fee, plan.net],
    [1000, 11000, 385, 10615],
  );
  assert.throws(() =>
    calculatePlan(10000, {
      method: "Pix",
      installments: 2,
      card_fee_bps: 0,
      interest_bps: 0,
      first_due_on: "2026-01-31",
    }),
  );
});
test("OS fica a receber até a última parcela e o caixa registra somente o líquido confirmado", async () => {
  const db = fixture();
  try {
    const record = await saveOrder(db, ctx, input());
    await ready(db, record);
    await transitionOrder(db, ctx, record, "completed");
    const r = db.prepare("SELECT id FROM receivables").get()!;
    const plan = await configurePlan(db, ctx, String(r.id), {
      method: "Cartão de crédito",
      installments: 3,
      card_fee_bps: 350,
      interest_bps: 1000,
      first_due_on: "2026-01-31",
    });
    const parts = db
      .prepare("SELECT * FROM payment_installments ORDER BY sequence")
      .all();
    assert.equal(
      filterOrders((await listOrders(db, "a")) as Order[], false, "active")
        .length,
      1,
    );
    await assert.rejects(
      async () =>
        await settleInstallment(
          db,
          { ...ctx, tenantId: "b" },
          String(parts[0].id),
        ),
      /não encontrado/,
    );
    await settleInstallment(db, ctx, String(parts[0].id));
    assert.equal(
      db.prepare("SELECT SUM(amount) n FROM cash_entries").get()!.n,
      parts[0].net,
    );
    await assert.rejects(
      async () => await settleInstallment(db, ctx, String(parts[0].id)),
      /já foi/,
    );
    await assert.rejects(
      async () =>
        await configurePlan(db, ctx, String(r.id), {
          method: "Pix",
          installments: 1,
          card_fee_bps: 0,
          interest_bps: 0,
          first_due_on: "2026-02-01",
        }),
      /não pode mudar/,
    );
    assert.equal(
      (await listOrders(db, "a"))[0].display_status,
      "awaiting_payment",
    );
    assert.equal(
      db.prepare("SELECT due_on FROM receivables").get()!.due_on,
      "2026-02-28",
    );
    await settleInstallment(db, ctx, String(parts[1].id));
    await settleInstallment(db, ctx, String(parts[2].id));
    assert.equal(
      filterOrders((await listOrders(db, "a")) as Order[], false, "active")
        .length,
      0,
    );
    assert.equal(
      filterOrders((await listOrders(db, "a")) as Order[], false, "completed")
        .length,
      1,
    );
    const cash = db
      .prepare(
        "SELECT SUM(amount) net,SUM(gross_amount) gross,SUM(fee_amount) fee,COUNT(*) n FROM cash_entries",
      )
      .get()!;
    assert.deepEqual(
      [cash.net, cash.gross, cash.fee, cash.n],
      [plan.net, plan.gross, plan.fee, 3],
    );
  } finally {
    db.close();
  }
});
test("faturamento separa peças e serviços com desconto proporcional e custo histórico", async () => {
  const db = fixture();
  try {
    db.prepare(
      "INSERT INTO catalog(id,tenant_id,kind,name,sku,cost,price) VALUES('service','a','service','Serviço','SVC',0,10000)",
    ).run();
    const record = await saveOrder(
      db,
      ctx,
      input({
        discount: 3000,
        items: [
          { catalog_id: "a-product", quantity: 2, price: 10000 },
          { catalog_id: "service", quantity: 1, price: 10000 },
        ],
      }),
    );
    const original = (await listOrders(db, "a"))[0];
    db.prepare("UPDATE catalog SET cost=9999 WHERE id='a-product'").run();
    await saveOrder(db, ctx, { ...original, items: original.items }, record);
    const second = (await listOrders(db, "a"))[0];
    await saveOrder(db, ctx, { ...second, items: second.items }, record);
    await ready(db, record);
    await transitionOrder(db, ctx, record, "completed");
    assert.deepEqual(
      revenueBreakdown(
        (await listOrders(db, "a")) as Order[],
        "2000-01-01",
        "2100-01-01",
      ),
      { products: 18000, services: 9000, productProfit: 10000 },
    );
  } finally {
    db.close();
  }
});
test("consulta por placa isola cadastros e trata resposta externa sem expor credencial", async () => {
  const db = fixture();
  const prior = process.env.PLACA_FIPE_TOKENS_JSON;
  try {
    delete process.env.PLACA_FIPE_TOKENS_JSON;
    const local = await lookupVehicle(db, "a", "abc-1d23");
    assert.equal(local.vehicle?.id, "a-vehicle");
    assert.equal(
      (await lookupVehicle(db, "b", "ABC1D23")).vehicle?.id,
      "b-vehicle",
    );
    assert.equal(
      (await lookupVehicle(db, "a", "ZZZ9Z99")).source,
      "unavailable",
    );
    process.env.PLACA_FIPE_TOKENS_JSON = JSON.stringify({
      a: "test-secret-token",
    });
    let called = 0;
    const fake = (async (url, options) => {
      called++;
      assert.equal(url, "https://api.placafipe.com.br/getplaca");
      assert.equal(
        JSON.parse(String(options?.body)).token,
        "test-secret-token",
      );
      return Response.json({
        codigo: 1,
        informacoes_veiculo: {
          marca: "Honda",
          modelo: "Civic",
          ano_modelo: "2024",
          cor: "Preto",
          proprietario: "Não deve sair",
        },
      });
    }) as typeof fetch;
    const found = await lookupVehicle(db, "a", "ZZZ9Z99", fake);
    assert.equal(found.source, "external");
    assert.equal(found.vehicle?.year, 2024);
    assert.ok(!JSON.stringify(found).includes("secret"));
    assert.ok(!JSON.stringify(found).includes("proprietario"));
    assert.equal(
      (await lookupVehicle(db, "b", "ZZZ9Z99", fake)).source,
      "unavailable",
    );
    assert.equal(called, 1);
    await assert.rejects(
      () =>
        lookupVehicle(db, "a", "ZZZ9Z99", (async () => {
          throw new Error("test-secret-token");
        }) as typeof fetch),
      (e) => e instanceof Error && !e.message.includes("secret"),
    );
  } finally {
    if (prior === undefined) delete process.env.PLACA_FIPE_TOKENS_JSON;
    else process.env.PLACA_FIPE_TOKENS_JSON = prior;
    db.close();
  }
});
test("API cadastra cliente e veículo atomicamente e limita o mecânico à operação", async () => {
  const db = fixture();
  const record = await saveOrder(db, ctx, input());
  await saveOrder(db, ctx, input({ status: "quote" }));
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  let cookie = "";
  const request = async (path: string, method = "GET", body?: unknown) =>
    fetch(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/api${path}`,
      {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
  try {
    const login = await request("/login", "POST", {
      email: "test@example.com",
      password: "password-test",
    });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    const combo = {
      customer: { name: "Cliente conjunto" },
      vehicle: {
        plate: "ZZZ1A23",
        brand: "Honda",
        model: "Fit",
        year: 2020,
        km: 0,
      },
    };
    const created = await request("/customers-with-vehicle", "POST", combo);
    assert.equal(created.status, 201);
    const result = await created.json();
    assert.equal(
      db
        .prepare("SELECT customer_id FROM vehicles WHERE id=?")
        .get(result.vehicle_id)!.customer_id,
      result.id,
    );
    assert.equal(
      (await request("/customers-with-vehicle", "POST", combo)).status,
      400,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM customers WHERE name='Cliente conjunto'",
        )
        .get()!.n,
      1,
    );
    db.prepare(
      "UPDATE memberships SET role='operator' WHERE user_id='user'",
    ).run();
    const workspace = await (await request("/workspace")).json();
    assert.equal(workspace.orders.length, 1);
    assert.equal(workspace.catalog.length, 0);
    assert.equal(workspace.receivables.length, 0);
    for (const key of [
      "cost",
      "price",
      "total",
      "discount",
      "payment_status",
      "receivable_id",
    ])
      assert.ok(!JSON.stringify(workspace).includes(`"${key}"`), key);
    for (const [path, method, body] of [
      ["/customers", "POST", { name: "Bloqueado" }],
      ["/orders", "POST", input()],
      ["/payment-settings", "PUT", {}],
      ["/vehicles/lookup", "POST", { plate: "ABC1D23" }],
      [`/orders/${record}`, "PUT", input()],
      [`/orders/${record}/status`, "POST", { status: "cancelled" }],
      [`/orders/${record}/status`, "POST", { status: "completed" }],
      ["/installments/fake/settle", "POST", {}],
    ] as const)
      assert.equal((await request(path, method, body)).status, 403, path);
    assert.equal(
      (await request(`/orders/${record}/status`, "POST", { status: "working" }))
        .status,
      200,
    );
    assert.equal(
      (
        await request(`/orders/${record}/notes`, "PATCH", {
          notes: "Conferir torque antes da entrega.",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request(`/orders/${record}/status`, "POST", { status: "ready" }))
        .status,
      200,
    );
    assert.equal(
      db.prepare("SELECT notes FROM orders WHERE id=?").get(record)!.notes,
      "Conferir torque antes da entrega.",
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  }
});

test("produção permite login e saída nos domínios configurados e bloqueia outras origens", async () => {
  const previous = { NODE_ENV: process.env.NODE_ENV, APP_ORIGIN: process.env.APP_ORIGIN, APP_ORIGINS: process.env.APP_ORIGINS };
  process.env.NODE_ENV = "production";
  process.env.APP_ORIGIN = "https://horse-power.vercel.app";
  process.env.APP_ORIGINS = "https://horse-power.vercel.app,https://oficinahorsepower.com.br";
  const db = fixture();
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  try {
    for (const origin of process.env.APP_ORIGINS.split(",")) {
      const login = await fetch(`${base}/login`, {
        method: "POST", headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com", password: "password-test" }),
      });
      assert.equal(login.status, 200);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const logout = await fetch(`${base}/logout`, { method: "POST", headers: { Origin: origin, Cookie: cookie } });
      assert.equal(logout.status, 200);
      assert.equal((await fetch(`${base}/session`, { headers: { Cookie: cookie } })).status, 401);
    }
    for (const origin of ["https://evil.example", "https://oficinahorsepower.com.br.evil.example", "http://oficinahorsepower.com.br", "null"]) {
      for (const path of ["login", "logout"]) {
        assert.equal((await fetch(`${base}/${path}`, { method: "POST", headers: { Origin: origin } })).status, 403);
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
