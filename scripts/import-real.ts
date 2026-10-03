import { readFileSync, mkdirSync } from "node:fs";
import { createDatabase } from "../server/db/database.ts";
const db = createDatabase();
const batch = "minha-oficina-2026-09-19";
if (db.prepare("SELECT 1 FROM import_batches WHERE id=?").get(batch)) {
  console.log("Importação já aplicada; nenhuma duplicação.");
  process.exit(0);
}
const input = JSON.parse(readFileSync("tmp/import/legacy.json", "utf8"));
if (input.issues.length || input.orders.length !== 231)
  throw new Error("Reconciliação incompleta");
mkdirSync("data/backups", { recursive: true });
db.exec(`VACUUM INTO 'data/backups/pre-real-${Date.now()}.sqlite'`);
const tenant = "hp-centro";
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const insert = (table: string, row: Record<string, any>) =>
  db
    .prepare(
      `INSERT INTO ${table}(${Object.keys(row).join(",")}) VALUES(${Object.keys(
        row,
      )
        .map(() => "?")
        .join(",")})`,
    )
    .run(...Object.values(row));
db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE");
try {
  // Archive the demonstration data; retain only Horse Power memberships.
  const old = db.prepare("SELECT * FROM tenants WHERE id=?").get(tenant)!;
  insert("tenants", {
    ...old,
    id: "demo-archive",
    name: "Demonstração arquivada",
  });
  for (const table of [
    "customers",
    "vehicles",
    "professionals",
    "catalog",
    "orders",
    "order_items",
    "stock_movements",
    "receivables",
    "cash_entries",
    "audit_events",
    "payment_installments",
    "payment_settings",
  ])
    db.prepare(
      `UPDATE ${table} SET tenant_id='demo-archive' WHERE tenant_id=?`,
    ).run(tenant);
  db.prepare("DELETE FROM sessions WHERE tenant_id<>?").run(tenant);
  db.prepare("DELETE FROM memberships WHERE tenant_id<>?").run(tenant);
  db.prepare(
    "UPDATE tenants SET name=?,phone=?,address=?,document='' WHERE id=?",
  ).run(
    "Horse Power Car Service",
    "(43) 98436-1833",
    "Avenida São João, 2868 - Antares - Londrina/PR",
    tenant,
  );
  const customers = new Map<string, string>();
  let ci = 0;
  function customer(name: string, phone = "", address = "", document = "") {
    const key = norm(name);
    if (!key) throw new Error("Cliente ausente");
    if (customers.has(key)) {
      const cid = customers.get(key)!;
      db.prepare(
        "UPDATE customers SET address=CASE WHEN address='' THEN ? ELSE address END,document=CASE WHEN document='' THEN ? ELSE document END WHERE id=?",
      ).run(address, document, cid);
      return cid;
    }
    const cid = "real-c-" + ++ci;
    customers.set(key, cid);
    insert("customers", {
      id: cid,
      tenant_id: tenant,
      name,
      phone,
      address,
      document,
      notes: "Importado do Minha Oficina em 19/09/2026.",
    });
    return cid;
  }
  for (const c of input.customers) customer(c.name, c.phone);
  const vehicles = new Map<string, string>();
  let vi = 0;
  const brands = [
    "GM - Chevrolet",
    "VW - VolksWagen",
    "Mercedes-Benz",
    "Kia Motors",
    "Land Rover",
    "Citroën",
    "Renault",
    "Hyundai",
    "Toyota",
    "Honda",
    "Nissan",
    "Peugeot",
    "Fiat",
    "Ford",
    "Jeep",
    "BMW",
    "Audi",
    "Mitsubishi",
  ];
  function vehicle(
    plate: string,
    cid: string,
    description: string,
    year = 0,
    color = "",
    km = 0,
    chassis = "",
  ) {
    if (vehicles.has(plate)) {
      const vid = vehicles.get(plate)!;
      db.prepare("UPDATE vehicles SET km=MAX(km,?) WHERE id=?").run(km, vid);
      return vid;
    }
    const brand =
      brands.find((b) => description.startsWith(b)) ||
      description.split(" ")[0];
    const vid = "real-v-" + ++vi;
    vehicles.set(plate, vid);
    insert("vehicles", {
      id: vid,
      tenant_id: tenant,
      customer_id: cid,
      plate,
      brand,
      model: description.slice(brand.length).trim(),
      year,
      color,
      km,
      chassis,
    });
    return vid;
  }
  for (const v of input.vehicles)
    vehicle(
      v.plate,
      customer(v.owner, v.phone),
      v.description,
      v.year,
      v.color,
    );
  const catalog = new Map<string, string>();
  let ii = 0;
  let countItems = 0;
  for (const o of input.orders.sort(
    (a: any, b: any) =>
      a.entered_on.localeCompare(b.entered_on) || a.number - b.number,
  )) {
    const cid = customer(o.customer, o.phone, o.address, o.document);
    const vid = vehicle(o.plate, cid, o.vehicle, 0, "", o.km, o.chassis);
    const oid = "real-os-" + o.number;
    insert("orders", {
      id: oid,
      tenant_id: tenant,
      number: o.number,
      kind: "order",
      customer_id: cid,
      vehicle_id: vid,
      status: "completed",
      entered_on: o.entered_on,
      due_on: o.completed_on || o.entered_on,
      completed_on: (o.completed_on || o.entered_on) + "T15:00:00.000Z",
      km: o.km,
      problem: o.problem,
      notes: o.notes,
      total: o.total,
      discount: o.discount,
      source: "Minha Oficina · OS " + o.number,
      historical_payment: o.payment,
      product_cost_total: o.profit?.[0] ?? null,
      service_cost_total: o.profit?.[3] ?? null,
      historical_fee: o.profit?.[8] ?? null,
    });
    for (const it of o.items) {
      const key = it.kind + "|" + norm(it.name);
      let cat = catalog.get(key);
      if (!cat) {
        cat = "real-item-" + ++ii;
        catalog.set(key, cat);
        insert("catalog", {
          id: cat,
          tenant_id: tenant,
          kind: it.kind,
          name: it.name,
          sku: "MO-" + ii,
          category: "Importado do histórico",
          price: it.price,
          cost: 0,
          cost_known: 0,
          stock: 0,
          stock_verified: it.kind === "product" ? 0 : 1,
        });
      } else
        db.prepare("UPDATE catalog SET price=? WHERE id=?").run(it.price, cat);
      if (!Number.isInteger(it.quantity))
        throw new Error("Quantidade fracionada exige revisão");
      insert("order_items", {
        id: oid + "-" + ++countItems,
        tenant_id: tenant,
        order_id: oid,
        catalog_id: cat,
        kind: it.kind,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        cost: 0,
      });
    }
  }
  const rows = Object.values(
    JSON.parse(readFileSync("tmp/import/expenses.json", "utf8")),
  )[0] as any[][];
  let expenses = 0;
  for (let i = 3; i < 17; i++)
    for (const [offset, category] of [
      [0, "Fixo"],
      [3, "Variável"],
      [6, "Investimento"],
    ] as const) {
      const r = rows[i];
      if (!r[offset]) continue;
      insert("expense_templates", {
        id: `expense-${i + 1}-${offset}`,
        tenant_id: tenant,
        description: String(r[offset]).trim(),
        category,
        amount: r[offset + 1] === null ? null : Math.round(r[offset + 1] * 100),
        due_day: r[offset + 2] || 10,
        remaining_months: offset === 6 ? r[9] : null,
        source: `Gastos Oficina.xlsx · Página1 · linha ${i + 1}`,
      });
      expenses++;
    }
  const fees = [353, 451, 527, 603, 679, 755, 873, 949, 1025, 1101, 1177, 1253],
    factors = [
      10366, 10472, 10556, 10642, 10728, 10817, 10957, 11049, 11142, 11237,
      11334, 11432,
    ];
  insert("card_rates", {
    tenant_id: tenant,
    method: "Cartão de débito",
    installments: 1,
    fee_bps: 84,
    factor_bps: 10085,
  });
  fees.forEach((fee, i) =>
    insert("card_rates", {
      tenant_id: tenant,
      method: "Cartão de crédito",
      installments: i + 1,
      fee_bps: fee,
      factor_bps: factors[i],
    }),
  );
  insert("payment_settings", {
    tenant_id: tenant,
    debit_fee_bps: 84,
    credit_fee_bps: 353,
    interest_bps: 0,
  });
  const summary = {
    customers: ci,
    vehicles: vi,
    orders: input.orders.length,
    items: countItems,
    catalog: ii,
    expenses,
    total: input.orders.reduce((s: number, o: any) => s + o.total, 0),
  };
  insert("import_batches", { id: batch, summary: JSON.stringify(summary) });
  if (db.prepare("PRAGMA foreign_key_check").all().length)
    throw new Error("Vínculos inconsistentes");
  db.exec("COMMIT");
  console.log(summary);
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
} finally {
  db.exec("PRAGMA foreign_keys=ON");
}
