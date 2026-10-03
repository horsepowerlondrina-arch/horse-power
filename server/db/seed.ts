import type { DB } from "./database";
import { hashPassword } from "../auth/session";
import { saveOrder, transitionOrder, settle } from "../services/workshop";
export function seed(db: DB) {
  if (db.prepare("SELECT 1 FROM import_batches LIMIT 1").get()) return;
  if (db.prepare("SELECT id FROM users LIMIT 1").get()) {
    ensureMechanic(db);
    return;
  }
  const userId = "demo-owner";
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
    userId,
    "Gustavo",
    "demo@horsepower.local",
    hashPassword("HorsePower@2026"),
  );
  const date = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, "0"),
      String(d.getDate()).padStart(2, "0"),
    ].join("-");
  };
  for (const [tenant, name] of [
    ["hp-centro", "Horse Power Centro"],
    ["hp-norte", "Oficina Norte"],
  ]) {
    db.prepare(
      "INSERT INTO tenants(id,name,phone,address) VALUES(?,?,?,?)",
    ).run(tenant, name, "(11) 3000-2026", "São Paulo, SP");
    db.prepare("INSERT INTO memberships VALUES(?,?,?)").run(
      userId,
      tenant,
      "owner",
    );
    const ctx = { userId, tenantId: tenant, role: "owner" };
    const customers =
      tenant === "hp-centro"
        ? [
            "Mariana Costa",
            "Rafael Almeida",
            "Beatriz Santos",
            "Lucas Ferreira",
            "Camila Oliveira",
            "Pedro Martins",
          ]
        : ["André Ribeiro"];
    customers.forEach((name, i) =>
      db
        .prepare(
          "INSERT INTO customers(id,tenant_id,name,phone,email) VALUES(?,?,?,?,?)",
        )
        .run(
          `${tenant}-c${i}`,
          tenant,
          name,
          `(11) 99000-00${String(i + 10)}`,
          `${name
            .split(" ")[0]
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()}@example.com`,
        ),
    );
    const cars = [
      ["Volkswagen", "T-Cross", "ABC1D23", 2022, "Branco", 45200],
      ["Honda", "Civic", "DEF4G56", 2020, "Cinza", 68300],
      ["Chevrolet", "Onix", "GHI7J89", 2023, "Preto", 28100],
      ["Toyota", "Corolla", "JKL0M12", 2021, "Prata", 56400],
      ["Jeep", "Compass", "NOP3Q45", 2022, "Preto", 39700],
      ["Fiat", "Argo", "RST6U78", 2020, "Vermelho", 72900],
    ];
    customers.forEach((_, i) => {
      const [brand, model, plate, year, color, km] = cars[i];
      db.prepare(
        "INSERT INTO vehicles(id,tenant_id,customer_id,brand,model,plate,year,color,km) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        `${tenant}-v${i}`,
        tenant,
        `${tenant}-c${i}`,
        brand,
        model,
        plate,
        year,
        color,
        km,
      );
    });
    ["Carlos Mendes", "João Pereira", "Diego Lima"].forEach((name, i) =>
      db
        .prepare("INSERT INTO professionals(id,tenant_id,name) VALUES(?,?,?)")
        .run(`${tenant}-p${i}`, tenant, name),
    );
    const catalog = [
      [
        "product",
        "Óleo sintético 5W30",
        "OL-5W30",
        "Lubrificantes",
        3200,
        5900,
        32,
        8,
      ],
      ["product", "Filtro de óleo", "FLT-001", "Filtros", 1800, 3500, 18, 5],
      [
        "product",
        "Pastilha de freio dianteira",
        "FR-012",
        "Freios",
        14500,
        24000,
        3,
        4,
      ],
      ["product", "Filtro de ar", "FLT-002", "Filtros", 3200, 6500, 12, 4],
      [
        "product",
        "Fluido de freio DOT 4",
        "FL-DOT4",
        "Freios",
        2200,
        4500,
        2,
        3,
      ],
      [
        "service",
        "Troca de óleo e filtros",
        "SV-001",
        "Manutenção",
        4500,
        12000,
        0,
        0,
      ],
      [
        "service",
        "Revisão preventiva",
        "SV-002",
        "Revisão",
        18000,
        42000,
        0,
        0,
      ],
      [
        "service",
        "Alinhamento e balanceamento",
        "SV-003",
        "Suspensão",
        6000,
        18000,
        0,
        0,
      ],
      [
        "service",
        "Manutenção dos freios",
        "SV-004",
        "Freios",
        10000,
        28000,
        0,
        0,
      ],
      [
        "service",
        "Diagnóstico eletrônico",
        "SV-005",
        "Diagnóstico",
        6000,
        16000,
        0,
        0,
      ],
    ];
    catalog.forEach((row, i) => {
      db.prepare(
        "INSERT INTO catalog(id,tenant_id,kind,name,sku,category,cost,price,stock,minimum_stock) VALUES(?,?,?,?,?,?,?,?,?,?)",
      ).run(`${tenant}-i${i}`, tenant, ...row);
      if (Number(row[6]) > 0)
        db.prepare(
          "INSERT INTO stock_movements(id,tenant_id,catalog_id,quantity,reason,user_id) VALUES(?,?,?,?,?,?)",
        ).run(
          `${tenant}-initial-${i}`,
          tenant,
          `${tenant}-i${i}`,
          Number(row[6]),
          "Saldo inicial de demonstração",
          userId,
        );
    });
    if (tenant !== "hp-centro") continue;
    const states = [
      "working",
      "open",
      "ready",
      "working",
      "quote",
      "completed",
      "completed",
      "completed",
      "completed",
    ];
    states.forEach((status, i) => {
      const customer = i % customers.length;
      const idx = i % 3 === 0 ? 6 : i % 3 === 1 ? 8 : 5;
      const days = i > 4 ? -(i - 4) * 2 : 0;
      const orderId = saveOrder(db, ctx, {
        customer_id: `${tenant}-c${customer}`,
        vehicle_id: `${tenant}-v${customer}`,
        status: status === "quote" ? "quote" : "open",
        entered_on: date(days - 1),
        due_on: date(days),
        km: cars[customer][5],
        problem: [
          "Revisão periódica e verificação geral.",
          "Ruído ao frear em baixa velocidade.",
          "Troca de óleo e verificação dos filtros.",
        ][i % 3],
        notes: "",
        discount: 0,
        items: [
          {
            catalog_id: `${tenant}-i${idx}`,
            quantity: 1,
            price: catalog[idx][5],
            professional_id: `${tenant}-p${i % 3}`,
          },
          { catalog_id: `${tenant}-i0`, quantity: 4, price: 5900 },
          { catalog_id: `${tenant}-i1`, quantity: 1, price: 3500 },
        ],
      });
      if (["working", "ready", "completed"].includes(status))
        transitionOrder(db, ctx, orderId, "working");
      if (["ready", "completed"].includes(status))
        transitionOrder(db, ctx, orderId, "ready");
      if (status === "completed") {
        transitionOrder(db, ctx, orderId, "completed");
        if (i > 5) {
          const r = db
            .prepare("SELECT id FROM receivables WHERE order_id=?")
            .get(orderId)!;
          settle(db, ctx, String(r.id), "Pix");
          db.prepare(
            "UPDATE cash_entries SET created_at=? WHERE receivable_id=?",
          ).run(`${date(days)} 10:30:00`, r.id);
          db.prepare("UPDATE receivables SET paid_at=? WHERE id=?").run(
            `${date(days)}T13:30:00Z`,
            r.id,
          );
        }
      }
    });
  }
  ensureMechanic(db);
}

function ensureMechanic(db: DB) {
  if (!db.prepare("SELECT id FROM tenants WHERE id='hp-centro'").get()) return;
  db.prepare("INSERT OR IGNORE INTO users VALUES(?,?,?,?)").run(
    "demo-mechanic",
    "Carlos Mendes",
    "mecanico@horsepower.local",
    hashPassword("Mecanico@2026"),
  );
  db.prepare("INSERT OR IGNORE INTO memberships VALUES(?,?,?)").run(
    "demo-mechanic",
    "hp-centro",
    "operator",
  );
}
