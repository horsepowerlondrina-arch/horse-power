import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../server/db/database";
import {
  beginCapture,
  importCapture,
  finishCapture,
  suggestedPrice,
} from "../server/services/extension";
import { digest } from "../server/auth/session";
import { saveOrder } from "../server/services/workshop";
import { createShare, readShare } from "../server/services/sharing";
import { createApp } from "../server/app";
const ctx = { tenantId: "a", userId: "u", role: "owner" };
function fixture() {
  const db = createDatabase(":memory:");
  db.exec(`INSERT INTO tenants(id,name) VALUES('a','A'),('b','B'); INSERT INTO users VALUES('u','Test','test@example.com','unused'); INSERT INTO memberships VALUES('u','a','owner');
INSERT INTO orders(id,tenant_id,number,kind,status,guest_plate,entered_on,due_on,km,total) VALUES('o','a',1,'quote','quote','ABC1D23','2026-10-03','2026-10-03',0,0),('other','b',1,'quote','quote','','2026-10-03','2026-10-03',0,0);`);
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
    digest("session"),
    "u",
    "a",
    Date.now() + 3600000,
  );
  return db;
}
const service = () => ({
  capture_id: randomUUID(),
  source: "tempario",
  name: "Troca da correia dentada",
  price: 12345,
  duration_seconds: 1500,
  vehicle: { plate: "ABC1D23", make: "Fiat", model: "Uno", year: "2015" },
});
const product = () => ({
  capture_id: randomUUID(),
  source: "sky",
  name: "Correia dentada",
  code: "CT100",
  brand: "Marca A",
  cost: 10000,
  quantity: 2,
});
test("capture saves quote, catalog and vehicle-specific times atomically; retries and duplicate clicks do not duplicate", async () => {
  const db = fixture();
  try {
    const { token } = await beginCapture(db, ctx, "o", "session");
    const item = service();
    const results = await Promise.all([
      importCapture(db, token, item),
      importCapture(db, token, item),
    ]);
    assert.equal(results.filter((r) => r.duplicate).length, 1);
    await importCapture(db, token, { ...item, capture_id: randomUUID() });
    assert.equal(
      db.prepare("SELECT count(*) n FROM service_times").get()!.n,
      1,
    );
    assert.equal(db.prepare("SELECT count(*) n FROM order_items").get()!.n, 1);
    assert.equal(
      db.prepare("SELECT duration_seconds FROM service_times").get()!
        .duration_seconds,
      1500,
    );
    const part = product();
    await importCapture(db, token, part);
    assert.equal(
      db.prepare("SELECT total FROM orders WHERE id=?").get("o")!.total,
      42345,
    );
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE kind='product'").get()!.stock,
      0,
    );
    const state = await finishCapture(db, ctx, "o");
    assert.equal(state.items.length, 2);
    await saveOrder(
      db,
      ctx,
      {
        status: "quote",
        guest_plate: "ABC1D23",
        entered_on: "2026-10-03",
        due_on: "2026-10-03",
        km: 0,
        discount: 0,
        problem: "",
        notes: "",
        items: state.items,
      },
      "o",
    );
    assert.equal(
      db.prepare("SELECT cost FROM order_items WHERE kind='product'").get()!
        .cost,
      10000,
    );
    const share = await createShare(db, ctx, "o");
    const publicData = await readShare(db, share.path.split("/").pop()!);
    assert.ok(!JSON.stringify(publicData).includes("duration_seconds"));
    assert.ok(!JSON.stringify(publicData).includes("cost"));
    await assert.rejects(importCapture(db, token, product()), /expirada/);
  } finally {
    db.close();
  }
});
test("capture rejects foreign tenants, mechanics, mismatched vehicles, revoked sessions and closed quotes", async () => {
  const db = fixture();
  try {
    await assert.rejects(
      beginCapture(db, { ...ctx, role: "operator" }, "o", "session"),
    );
    await assert.rejects(beginCapture(db, ctx, "other", "session"));
    const { token } = await beginCapture(db, ctx, "o", "session");
    await assert.rejects(
      importCapture(db, token, { ...service(), vehicle: { plate: "ZZZ9Z99" } }),
      /outro veículo/,
    );
    assert.equal(db.prepare("SELECT count(*) n FROM catalog").get()!.n, 0);
    await assert.rejects(importCapture(db, "invalid", service()));
    const item = service();
    await importCapture(db, token, item);
    await assert.rejects(
      importCapture(db, token, { ...item, price: 999 }),
      /já utilizada/,
    );
    db.exec("UPDATE orders SET status='cancelled' WHERE id='o'");
    await assert.rejects(importCapture(db, token, product()), /não aceita/);
    db.exec(
      "UPDATE orders SET status='quote' WHERE id='o'; DELETE FROM sessions",
    );
    await assert.rejects(importCapture(db, token, product()), /expirada/);
  } finally {
    db.close();
  }
});
test("services reuse normalized names and aliases, preserve catalog prices and keep each vehicle time", async () => {
  const db = fixture();
  try {
    db.exec(
      "INSERT INTO catalog(id,tenant_id,kind,name,sku,cost,price) VALUES('s','a','service','Troca correia dentada','S1',0,9000)",
    );
    const a = await beginCapture(db, ctx, "o", "session");
    await importCapture(db, a.token, service());
    assert.equal(db.prepare("SELECT count(*) n FROM catalog").get()!.n, 1);
    assert.equal(
      db.prepare("SELECT price FROM catalog WHERE id='s'").get()!.price,
      9000,
    );
    db.exec(
      "INSERT INTO orders(id,tenant_id,number,kind,status,guest_plate,entered_on,due_on,km,total) VALUES('o2','a',2,'quote','quote','','2026-10-03','2026-10-03',0,0)",
    );
    const b = await beginCapture(db, ctx, "o2", "session");
    await importCapture(db, b.token, {
      ...service(),
      duration_seconds: 5400,
      vehicle: { model: "Palio", year: "2018" },
    });
    assert.equal(
      db.prepare("SELECT count(*) n FROM service_times").get()!.n,
      2,
    );
  } finally {
    db.close();
  }
});
test("extension bearer endpoint works without cookies, requires scoped token and keeps other origins blocked", async () => {
  const db = fixture();
  const app = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => app.once("listening", r));
  const base = `http://127.0.0.1:${(app.address() as any).port}`;
  try {
    const { token } = await beginCapture(db, ctx, "o", "session");
    for (const [origin, auth, expected] of [
      ["chrome-extension://" + "a".repeat(32), "Bearer " + token, 200],
      ["https://evil.example", "Bearer " + token, 403],
      ["chrome-extension://" + "a".repeat(32), "Bearer invalid", 401],
    ] as const) {
      const r = await fetch(base + "/api/extension/import", {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: auth,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(service()),
      });
      assert.equal(r.status, expected, await r.text());
    }
    const r = await fetch(base + "/api/orders/o/capture-session", {
      method: "POST",
      headers: {
        Origin: "chrome-extension://" + "a".repeat(32),
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(r.status, 403);
  } finally {
    await new Promise<void>((r) => app.close(() => r()));
    db.close();
  }
});
test("original part markup is rounded in cents", () => {
  assert.equal(suggestedPrice(1000), 1800);
  assert.equal(suggestedPrice(500), 1300);
  assert.equal(suggestedPrice(10000), 15000);
  assert.equal(suggestedPrice(15001), 21751);
});
