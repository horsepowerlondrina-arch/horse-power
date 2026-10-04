import { z } from "zod";
import type { Context } from "../auth/session.js";
import { transaction, type DB } from "../db/database.js";
import { requireAdmin } from "./payments.js";
import { audit, id, scoped } from "./workshop.js";

const conditionState = z.enum(["ok", "issue", "unchecked"]);
const damageSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  type: z.enum(["Risco", "Amassado", "Trinca", "Avaria / adicional"]),
  note: z.string().trim().max(200).default(""),
});
const createSchema = z.object({
  order_id: z.string().trim().min(1).nullable().optional(),
  vehicle_id: z.string().trim().min(1).nullable().optional(),
  km: z.number().int().min(0).max(2000000).default(0),
  fuel_level: z.number().int().min(0).max(100).default(0),
  inspector: z.string().trim().min(2).max(150),
});
const updateSchema = z.object({
  km: z.number().int().min(0).max(2000000),
  fuel_level: z.number().int().min(0).max(100),
  inspector: z.string().trim().min(2).max(150),
  complaint: z.string().trim().max(4000).default(""),
  conditions: z.record(z.string(), conditionState).default({}),
  accessories_notes: z.string().trim().max(2000).default(""),
  panel_lights: z.record(z.string(), z.boolean()).default({}),
  panel_notes: z.string().trim().max(2000).default(""),
  objects_left: z.string().trim().max(2000).default(""),
  functioning_notes: z.string().trim().max(4000).default(""),
  damages: z.array(damageSchema).max(100).default([]),
  damage_notes: z.string().trim().max(3000).default(""),
  signature_data: z
    .string()
    .max(250000)
    .refine(
      (value) => !value || /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value),
      "Assinatura inválida.",
    )
    .default(""),
  signature_absent_reason: z.string().trim().max(500).default(""),
  customer_confirmed: z.boolean().default(false),
});
const photoKind = z.enum([
  "front",
  "rear",
  "left",
  "right",
  "dashboard",
  "damage",
  "other",
]);
const photoMime = z.enum(["image/jpeg", "image/png"]);

function parseJson<T>(value: unknown, fallback: T): T {
  try {
    return value ? (JSON.parse(String(value)) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function row(db: DB, ctx: Context, checklistId: string) {
  const value = await db
    .prepare(
      `SELECT k.*,o.number order_number
       FROM checklists k
       LEFT JOIN orders o ON o.id=k.order_id AND o.tenant_id=k.tenant_id
       WHERE k.tenant_id=? AND k.id=?`,
    )
    .get(ctx.tenantId, checklistId);
  if (!value)
    throw Object.assign(new Error("Checklist não encontrado."), { status: 404 });
  return value;
}

async function draft(db: DB, ctx: Context, checklistId: string) {
  const value = await row(db, ctx, checklistId);
  if (value.status !== "draft")
    throw new Error("Checklist finalizado fica disponível somente para consulta.");
  return value;
}

export async function listChecklists(db: DB, ctx: Context) {
  requireAdmin(ctx);
  return db
    .prepare(
      `SELECT k.id,k.order_id,k.customer_id,k.vehicle_id,k.customer_name,k.plate,k.vehicle_label,
              k.km,k.fuel_level,k.inspector,k.status,k.created_at,k.updated_at,k.completed_at,
              o.number order_number,
              (SELECT COUNT(*) FROM checklist_photos p
               WHERE p.tenant_id=k.tenant_id AND p.checklist_id=k.id) photo_count
       FROM checklists k
       LEFT JOIN orders o ON o.id=k.order_id AND o.tenant_id=k.tenant_id
       WHERE k.tenant_id=?
       ORDER BY k.created_at DESC`,
    )
    .all(ctx.tenantId);
}

export async function getChecklist(db: DB, ctx: Context, checklistId: string) {
  requireAdmin(ctx);
  const value = await row(db, ctx, checklistId);
  return {
    ...value,
    conditions: parseJson<Record<string, string>>(value.conditions_json, {}),
    panel_lights: parseJson<Record<string, boolean>>(value.panel_json, {}),
    damages: parseJson<any[]>(value.damages_json, []),
    customer_confirmed: !!value.customer_confirmed,
    photos: await db
      .prepare(
        "SELECT id,kind,mime,created_at FROM checklist_photos WHERE tenant_id=? AND checklist_id=? ORDER BY created_at,id",
      )
      .all(ctx.tenantId, checklistId),
  };
}

export async function createChecklist(
  db: DB,
  ctx: Context,
  input: unknown,
) {
  requireAdmin(ctx);
  const v = createSchema.parse(input);
  return transaction(db, async () => {
    let order: Record<string, any> | null = null;
    let vehicleId = v.vehicle_id || "";
    if (v.order_id) {
      order = await scoped(db, "orders", ctx.tenantId, v.order_id);
      if (order.kind !== "order")
        throw new Error("O checklist de entrada deve ser vinculado a uma OS.");
      if (!order.vehicle_id || !order.customer_id)
        throw new Error("A OS precisa ter cliente e veículo vinculados.");
      vehicleId = String(order.vehicle_id);
      if (v.vehicle_id && v.vehicle_id !== vehicleId)
        throw new Error("O veículo escolhido não corresponde à OS.");
    }

    if (!vehicleId) throw new Error("Selecione um veículo.");
    const vehicle = await scoped(db, "vehicles", ctx.tenantId, vehicleId);
    const customer = await scoped(
      db,
      "customers",
      ctx.tenantId,
      String(vehicle.customer_id),
    );
    if (order && String(order.customer_id) !== String(customer.id))
      throw new Error("O cliente da OS não corresponde ao veículo.");

    const checklistId = id();
    const vehicleLabel = [
      vehicle.brand,
      vehicle.model,
      vehicle.color,
      vehicle.year,
    ]
      .filter(Boolean)
      .join(" ");
    await db
      .prepare(
        `INSERT INTO checklists(
          id,tenant_id,order_id,customer_id,vehicle_id,customer_name,phone,plate,vehicle_label,
          km,fuel_level,inspector,complaint
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        checklistId,
        ctx.tenantId,
        order?.id || null,
        customer.id,
        vehicle.id,
        customer.name,
        customer.phone || "",
        vehicle.plate,
        vehicleLabel,
        v.km || Number(order?.km || vehicle.km || 0),
        v.fuel_level,
        v.inspector,
        order?.problem || "",
      );
    await audit(db, ctx, "checklist.created", checklistId);
    return { id: checklistId };
  });
}

export async function updateChecklist(
  db: DB,
  ctx: Context,
  checklistId: string,
  input: unknown,
) {
  requireAdmin(ctx);
  const v = updateSchema.parse(input);
  return transaction(db, async () => {
    await draft(db, ctx, checklistId);
    await db
      .prepare(
        `UPDATE checklists SET
          km=?,fuel_level=?,inspector=?,complaint=?,conditions_json=?,accessories_notes=?,
          panel_json=?,panel_notes=?,objects_left=?,functioning_notes=?,damages_json=?,
          damage_notes=?,signature_data=?,signature_absent_reason=?,customer_confirmed=?,updated_at=?
         WHERE tenant_id=? AND id=?`,
      )
      .run(
        v.km,
        v.fuel_level,
        v.inspector,
        v.complaint,
        JSON.stringify(v.conditions),
        v.accessories_notes,
        JSON.stringify(v.panel_lights),
        v.panel_notes,
        v.objects_left,
        v.functioning_notes,
        JSON.stringify(v.damages),
        v.damage_notes,
        v.signature_data,
        v.signature_absent_reason,
        v.customer_confirmed ? 1 : 0,
        new Date().toISOString(),
        ctx.tenantId,
        checklistId,
      );
    await audit(db, ctx, "checklist.updated", checklistId);
    return getChecklist(db, ctx, checklistId);
  });
}

export async function finalizeChecklist(
  db: DB,
  ctx: Context,
  checklistId: string,
) {
  requireAdmin(ctx);
  return transaction(db, async () => {
    const value = await draft(db, ctx, checklistId);
    if (!String(value.inspector || "").trim())
      throw new Error("Informe quem realizou o checklist.");
    if (
      !String(value.signature_data || "") &&
      !String(value.signature_absent_reason || "").trim()
    )
      throw new Error(
        "Registre a assinatura do cliente ou informe o motivo da ausência.",
      );
    const now = new Date().toISOString();
    await db
      .prepare(
        "UPDATE checklists SET status='completed',completed_at=?,updated_at=? WHERE tenant_id=? AND id=?",
      )
      .run(now, now, ctx.tenantId, checklistId);
    await audit(db, ctx, "checklist.completed", checklistId);
    return getChecklist(db, ctx, checklistId);
  });
}

export async function addChecklistPhoto(
  db: DB,
  ctx: Context,
  checklistId: string,
  kindInput: unknown,
  mimeInput: unknown,
  data: Buffer,
) {
  requireAdmin(ctx);
  const kind = photoKind.parse(kindInput);
  const mime = photoMime.parse(mimeInput);
  if (!Buffer.isBuffer(data) || data.length < 100)
    throw new Error("Foto inválida.");
  if (data.length > 1600000)
    throw new Error("A foto ficou muito grande. Tente novamente.");

  return transaction(db, async () => {
    await draft(db, ctx, checklistId);
    const count = Number(
      (
        await db
          .prepare(
            "SELECT COUNT(*) n FROM checklist_photos WHERE tenant_id=? AND checklist_id=?",
          )
          .get(ctx.tenantId, checklistId)
      )?.n || 0,
    );
    if (count >= 40)
      throw new Error("O checklist atingiu o limite de 40 fotos.");

    const photoId = id();
    await db
      .prepare(
        "INSERT INTO checklist_photos(id,tenant_id,checklist_id,kind,mime,image_data) VALUES(?,?,?,?,?,?)",
      )
      .run(
        photoId,
        ctx.tenantId,
        checklistId,
        kind,
        mime,
        data.toString("base64"),
      );
    await db
      .prepare(
        "UPDATE checklists SET updated_at=? WHERE tenant_id=? AND id=?",
      )
      .run(new Date().toISOString(), ctx.tenantId, checklistId);
    await audit(db, ctx, "checklist.photo_added", checklistId);
    return { id: photoId };
  });
}

export async function removeChecklistPhoto(
  db: DB,
  ctx: Context,
  checklistId: string,
  photoId: string,
) {
  requireAdmin(ctx);
  return transaction(db, async () => {
    await draft(db, ctx, checklistId);
    const photo = await db
      .prepare(
        "SELECT id FROM checklist_photos WHERE tenant_id=? AND checklist_id=? AND id=?",
      )
      .get(ctx.tenantId, checklistId, photoId);
    if (!photo) throw new Error("Foto não encontrada neste checklist.");

    await db
      .prepare(
        "DELETE FROM checklist_photos WHERE tenant_id=? AND checklist_id=? AND id=?",
      )
      .run(ctx.tenantId, checklistId, photoId);
    await db
      .prepare(
        "UPDATE checklists SET updated_at=? WHERE tenant_id=? AND id=?",
      )
      .run(new Date().toISOString(), ctx.tenantId, checklistId);
    await audit(db, ctx, "checklist.photo_removed", checklistId);
    return { ok: true };
  });
}

export async function getChecklistPhoto(
  db: DB,
  ctx: Context,
  photoId: string,
) {
  requireAdmin(ctx);
  const photo = await db
    .prepare(
      "SELECT id,mime,image_data FROM checklist_photos WHERE tenant_id=? AND id=?",
    )
    .get(ctx.tenantId, photoId);
  if (!photo)
    throw Object.assign(new Error("Foto não encontrada."), { status: 404 });
  return photo;
}
