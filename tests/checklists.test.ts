import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db/database";
import {
  addChecklistPhoto,
  createChecklist,
  finalizeChecklist,
  getChecklist,
  getChecklistPhoto,
  listChecklists,
  removeChecklistPhoto,
  updateChecklist,
} from "../server/services/checklists";

const ctx = { userId: "u", tenantId: "t", role: "owner" };

function fixture() {
  const db = createDatabase(":memory:");
  db.prepare("INSERT INTO tenants(id,name) VALUES(?,?)").run("t", "Horse Power");
  db.prepare("INSERT INTO users(id,name,email,password_hash) VALUES(?,?,?,?)").run(
    "u",
    "Responsável",
    "u@example.com",
    "unused",
  );
  db.prepare("INSERT INTO memberships(user_id,tenant_id,role) VALUES(?,?,?)").run(
    "u",
    "t",
    "owner",
  );
  db.prepare(
    "INSERT INTO customers(id,tenant_id,name,phone) VALUES(?,?,?,?)",
  ).run("c", "t", "Cliente Teste", "43999999999");
  db.prepare(
    "INSERT INTO vehicles(id,tenant_id,customer_id,plate,brand,model,year,color,km) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run("v", "t", "c", "ABC1D23", "Honda", "Civic", 2022, "Prata", 12345);
  db.prepare(
    "INSERT INTO orders(id,tenant_id,number,kind,status,customer_id,vehicle_id,entered_on,due_on,km,problem) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    "o",
    "t",
    123,
    "order",
    "open",
    "c",
    "v",
    "2026-10-04",
    "2026-10-04",
    12500,
    "Ruído dianteiro",
  );
  return db;
}

test("checklist vincula OS/veículo, salva fotos e finaliza com assinatura", async () => {
  const db = fixture();
  try {
    const created = await createChecklist(db, ctx, {
      order_id: "o",
      km: 12500,
      fuel_level: 50,
      inspector: "Responsável",
    });
    let checklist = await getChecklist(db, ctx, created.id);
    assert.equal(checklist.plate, "ABC1D23");
    assert.equal(checklist.order_number, 123);
    assert.equal(checklist.complaint, "Ruído dianteiro");

    checklist = await updateChecklist(db, ctx, created.id, {
      km: 12600,
      fuel_level: 25,
      inspector: "Responsável",
      complaint: "Ruído dianteiro",
      conditions: { "Para-brisa e vidros": "ok" },
      accessories_notes: "",
      panel_lights: { ABS: true },
      panel_notes: "",
      objects_left: "Documento",
      functioning_notes: "Motor funcionando normalmente",
      damages: [{ x: 50, y: 20, type: "Risco", note: "Capô" }],
      damage_notes: "",
      signature_data: "data:image/png;base64,QUJDRA==",
      signature_absent_reason: "",
      customer_confirmed: true,
    });
    assert.equal(checklist.km, 12600);
    assert.equal(checklist.panel_lights.ABS, true);

    const photo = await addChecklistPhoto(
      db,
      ctx,
      created.id,
      "front",
      "image/jpeg",
      Buffer.alloc(200, 1),
    );
    const raw = await getChecklistPhoto(db, ctx, photo.id);
    assert.equal(raw.mime, "image/jpeg");
    assert.equal(Buffer.from(raw.image_data, "base64").length, 200);

    const completed = await finalizeChecklist(db, ctx, created.id);
    assert.equal(completed.status, "completed");
    assert.equal((await listChecklists(db, ctx)).length, 1);
  } finally {
    db.close();
  }
});

test("foto pode ser removida enquanto checklist está em rascunho", async () => {
  const db = fixture();
  try {
    const created = await createChecklist(db, ctx, {
      vehicle_id: "v",
      km: 12345,
      fuel_level: 75,
      inspector: "Responsável",
    });
    const photo = await addChecklistPhoto(
      db,
      ctx,
      created.id,
      "rear",
      "image/jpeg",
      Buffer.alloc(200, 2),
    );
    await removeChecklistPhoto(db, ctx, created.id, photo.id);
    assert.equal((await getChecklist(db, ctx, created.id)).photos.length, 0);
  } finally {
    db.close();
  }
});
