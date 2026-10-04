import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPostgresDatabase } from "../server/db/postgres.js";
import { digest } from "../server/auth/session.js";
import {
  beginCapture,
  importCapture,
  finishCapture,
} from "../server/services/extension.js";
import { createApp } from "../server/app.js";
const db = createPostgresDatabase();
const tenant = "ext-test-" + randomUUID(),
  user = randomUUID(),
  order = randomUUID(),
  sessionToken = randomUUID();
const ctx = { tenantId: tenant, userId: user, role: "owner" };
try {
  await db
    .prepare("INSERT INTO tenants(id,name) VALUES(?,?)")
    .run(tenant, "Teste temporário da extensão");
  await db
    .prepare("INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)")
    .run(user, "Teste", user + "@invalid.local", "disabled");
  await db
    .prepare(
      "INSERT INTO memberships(user_id,tenant_id,role) VALUES(?,?,'owner')",
    )
    .run(user, tenant);
  await db
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at) VALUES(?,?,?,?)",
    )
    .run(digest(sessionToken), user, tenant, Date.now() + 300000);
  await db
    .prepare(
      "INSERT INTO orders(id,tenant_id,number,kind,status,entered_on,due_on,km,total) VALUES(?,?,1,'quote','quote','2026-10-03','2026-10-03',0,0)",
    )
    .run(order, tenant);
  const target = await beginCapture(db, ctx, order, sessionToken);
  assert.equal(target.plate, "");
  const service = {
    capture_id: randomUUID(),
    source: "tempario",
    name: "Serviço teste integração",
    duration_seconds: 1500,
    price: 12345,
    vehicle: { model: "Modelo de teste", year: "2020" },
  };
  const results = await Promise.all([
    importCapture(db, target.token, service),
    importCapture(db, target.token, service),
  ]);
  assert.equal(results.filter((r) => r.duplicate).length, 1);
  await importCapture(db, target.token, {
    capture_id: randomUUID(),
    source: "sky",
    name: "Peça teste integração",
    code: "TEST",
    brand: "TEST",
    cost: 10000,
    quantity: 2,
  });
  const rows = await db
    .prepare("SELECT duration_seconds FROM service_times WHERE tenant_id=?")
    .all(tenant);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].duration_seconds, 1500);
  const state = await finishCapture(db, ctx, order);
  assert.equal(state.items.length, 2);
  assert.equal(state.total, 42345);
  // Verify published authenticated endpoints using only an isolated test tenant.
  if (process.env.VERIFY_ORIGIN) {
    await db
      .prepare("UPDATE orders SET guest_plate=? WHERE id=? AND tenant_id=?")
      .run("abc-1d23", order, tenant);
    const base = process.env.VERIFY_ORIGIN,
      headers = {
        Cookie: `hp_session=${sessionToken}`,
        "Content-Type": "application/json",
        Origin: base,
      };
    const start = await fetch(
      base + "/api/orders/" + order + "/capture-session",
      { method: "POST", headers, body: "{}" },
    );
    assert.equal(start.status, 200, await start.clone().text());
    const { token, plate } = await start.json();
    assert.equal(plate, "ABC1D23");
    const r = await fetch(base + "/api/extension/import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "chrome-extension://" + "a".repeat(32),
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        ...service,
        capture_id: randomUUID(),
        name: "Segundo serviço teste integração",
      }),
    });
    assert.equal(r.status, 200, await r.text());
    const times = await fetch(base + "/api/service-times", { headers });
    assert.equal(times.status, 200);
    assert.equal((await times.json()).length, 2);
    const end = await fetch(base + "/api/orders/" + order + "/end-capture", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(end.status, 200);
  }
  console.log(
    "Extensão verificada no PostgreSQL: gravação, tempos, preços, duplicações e encerramento.",
  );
} finally {
  for (const table of [
    "capture_sessions",
    "service_times",
    "external_captures",
    "external_catalog_links",
    "audit_events",
    "order_items",
    "orders",
    "catalog",
    "sessions",
    "memberships",
  ])
    await db.prepare(`DELETE FROM ${table} WHERE tenant_id=?`).run(tenant);
  await db.prepare("DELETE FROM users WHERE id=?").run(user);
  await db.prepare("DELETE FROM tenants WHERE id=?").run(tenant);
  await db.close();
}
