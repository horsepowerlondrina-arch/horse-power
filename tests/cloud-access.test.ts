import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db/database";
import { createApp } from "../server/app";
import { digest, hashPassword } from "../server/auth/session";
import { postgresSql } from "../server/db/postgres";
test("Postgres placeholders preserve question marks in quoted data and translate supported SQLite syntax", () => {
  assert.equal(
    postgresSql("SELECT '?' AS literal FROM customers WHERE id=? AND name=?"),
    "SELECT '?' AS literal FROM horse_power.customers WHERE id=$1 AND name=$2",
  );
  assert.equal(
    postgresSql("INSERT OR IGNORE INTO payables(id) VALUES(?)"),
    "INSERT INTO horse_power.payables(id) VALUES($1) ON CONFLICT DO NOTHING",
  );
});
test("admin activation is single-use, validates password and revokes existing sessions", async () => {
  const db = createDatabase(":memory:");
  db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("t", "Test");
  db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
    "u",
    "Admin",
    "admin@example.com",
    hashPassword("old-password"),
  );
  db.prepare("INSERT INTO memberships VALUES(?,?,?)").run("u", "t", "owner");
  const token = "a".repeat(64);
  db.prepare(
    "INSERT INTO admin_setup(token_hash,user_id,expires_at) VALUES(?,?,?)",
  ).run(digest(token), "u", Date.now() + 60000);
  db.prepare("INSERT INTO sessions VALUES(?,?,?,?)").run(
    "old",
    "u",
    "t",
    Date.now() + 60000,
  );
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const post = (path: string, body: any) =>
    fetch(base + "/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post("/setup", { token, password: "short" })).status,
      400,
    );
    assert.equal(
      (await post("/setup", { token, password: "new-password-strong" })).status,
      200,
    );
    assert.equal(db.prepare("SELECT count(*) n FROM sessions").get()!.n, 0);
    assert.equal(
      (await post("/setup", { token, password: "new-password-other" })).status,
      400,
    );
    assert.equal(
      (
        await post("/login", {
          email: "admin@example.com",
          password: "old-password",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await post("/login", {
          email: "admin@example.com",
          password: "new-password-strong",
        })
      ).status,
      200,
    );
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    db.close();
  }
});
