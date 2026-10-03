import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db/database";
import {
  mergeServices,
  assertUniqueService,
  serviceNameKey,
} from "../server/services/serviceCatalog";
function fixture() {
  const db = createDatabase(":memory:");
  db.exec(
    "INSERT INTO tenants(id,name) VALUES('a','A'),('b','B'); INSERT INTO users VALUES('u','Admin','a@example.com','hash'); INSERT INTO catalog(id,tenant_id,kind,name,sku,price,cost) VALUES('s1','a','service','Troca Bobina de Ignição','S1',10000,100),('s2','a','service','Troca da Bobina de Ignição','S2',15000,200),('s3','b','service','Troca da Bobina de Ignição','S3',9000,0),('p','a','product','Bobina','P1',20000,10000); INSERT INTO orders(id,tenant_id,number,kind,status,entered_on,due_on,km,total) VALUES('o','a',1,'quote','quote','2026-09-23','2026-09-23',0,30000); INSERT INTO order_items(id,tenant_id,order_id,catalog_id,kind,name,quantity,price,cost) VALUES('i','a','o','s2','service','Nome original da OS',2,15000,200)",
  );
  return db;
}
const ctx = { tenantId: "a", userId: "u", role: "owner" };
test("merge retains historical snapshots and canonical price, archives duplicate and preserves searchable names", async () => {
  const d = fixture();
  await mergeServices(d, ctx, "s1", ["s2"], "Troca da bobina de ignição");
  const i = d.prepare("SELECT * FROM order_items").get()!;
  assert.equal(i.catalog_id, "s1");
  assert.equal(i.name, "Nome original da OS");
  assert.equal(i.price, 15000);
  assert.equal(i.quantity, 2);
  assert.equal(i.cost, 200);
  assert.equal(
    d.prepare("SELECT total FROM orders WHERE id='o'").get()!.total,
    30000,
  );
  assert.equal(
    d.prepare("SELECT price FROM catalog WHERE id='s1'").get()!.price,
    10000,
  );
  assert.equal(
    d.prepare("SELECT active FROM catalog WHERE id='s2'").get()!.active,
    0,
  );
  assert.equal(
    d.prepare("SELECT active FROM catalog WHERE id='s3'").get()!.active,
    1,
  );
  assert.ok(d.prepare("SELECT 1 FROM service_aliases WHERE alias='S2'").get());
  await assert.rejects(
    async () =>
      await assertUniqueService(d, "a", "TROCA DE BOBINA DE IGNICAO!!!"),
  );
  await assert.doesNotReject(
    async () =>
      await assertUniqueService(d, "a", "Troca de bobina de ignição", "s1"),
  );
  await assert.doesNotReject(
    async () => await assertUniqueService(d, "a", "Troca de bobina e velas"),
  );
  assert.deepEqual(d.prepare("PRAGMA foreign_key_check").all(), []);
  d.close();
});
test("merge rejects foreign tenants, products, repeat merges and operators", async () => {
  const d = fixture();
  await assert.rejects(
    async () => await mergeServices(d, ctx, "s1", ["s3"], "Teste"),
  );
  await assert.rejects(
    async () => await mergeServices(d, ctx, "s1", ["p"], "Teste"),
  );
  await assert.rejects(
    async () =>
      await mergeServices(
        d,
        { ...ctx, role: "operator" },
        "s1",
        ["s2"],
        "Teste",
      ),
  );
  await mergeServices(d, ctx, "s1", ["s2"], "Bobina");
  await assert.rejects(
    async () => await mergeServices(d, ctx, "s1", ["s2"], "Bobina"),
  );
  d.close();
});
test("service normalization preserves meaningful qualifiers and tenant isolation", async () => {
  const d = fixture();
  assert.notEqual(
    serviceNameKey("Troca de coxim dianteiro"),
    serviceNameKey("Troca de coxim traseiro"),
  );
  assert.notEqual(
    serviceNameKey("Troca bucha"),
    serviceNameKey("Troca 2 buchas"),
  );
  await assert.doesNotReject(
    async () => await assertUniqueService(d, "b", "Outro serviço"),
  );
  await assert.doesNotReject(
    async () => await assertUniqueService(d, "c", "Troca da Bobina de Ignição"),
  );
  d.close();
});
