import { randomBytes } from "node:crypto";
import { z } from "zod";
import { type DB, transaction } from "../db/database.js";
import { digest, type Context } from "../auth/session.js";
import { requireAdmin } from "./payments.js";
import { audit, id, scoped } from "./workshop.js";
import { serviceNameKey } from "./serviceCatalog.js";
const txt = z.string().trim().max(300).default("");
export const captureSchema = z
  .object({
    capture_id: z.string().uuid(),
    source: z.enum(["sky", "tempario"]),
    name: z.string().trim().min(3).max(300),
    code: txt,
    brand: txt,
    quantity: z.number().int().min(1).max(1000).default(1),
    cost: z.number().int().min(0).max(100000000).default(0),
    price: z.number().int().min(0).max(100000000).default(0),
    duration_seconds: z.number().int().min(1).max(3600000).optional(),
    vehicle: z
      .object({ plate: txt, make: txt, model: txt, year: txt, engine: txt })
      .default({}),
  })
  .superRefine((v, ctx) => {
    if (v.source === "sky" && (!v.code || !v.cost))
      ctx.addIssue({
        code: "custom",
        message: "Confira o código e o custo da peça.",
      });
    if (
      v.source === "tempario" &&
      (!v.duration_seconds || !v.price || v.quantity !== 1)
    )
      ctx.addIssue({
        code: "custom",
        message: "Confira o tempo e o valor do serviço.",
      });
  });
export function suggestedPrice(cost: number) {
  if (cost <= 2000) return Math.max(Math.round(cost * 1.8), cost + 800);
  if (cost <= 5000) return Math.max(Math.round(cost * 1.6), cost + 1000);
  if (cost <= 10000) return Math.max(Math.round(cost * 1.5), cost + 2000);
  return Math.round(
    cost *
      (cost <= 25000
        ? 1.45
        : cost <= 50000
          ? 1.4
          : cost <= 100000
            ? 1.35
            : 1.3),
  );
}
export async function beginCapture(
  db: DB,
  ctx: Context,
  orderId: string,
  sessionToken: string,
) {
  requireAdmin(ctx);
  return transaction(db, async () => {
    const order = await scoped(db, "orders", ctx.tenantId, orderId);
    if (order.kind !== "quote" || order.status !== "quote")
      throw new Error("A captura está disponível em orçamentos em elaboração.");
    const vehicle = order.vehicle_id
      ? await scoped(db, "vehicles", ctx.tenantId, order.vehicle_id)
      : null;
    const plate = String(vehicle?.plate || order.guest_plate || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const token = randomBytes(32).toString("hex");
    await db
      .prepare(
        "DELETE FROM capture_sessions WHERE tenant_id=? AND order_id=? OR expires_at<?",
      )
      .run(ctx.tenantId, orderId, Date.now());
    await db
      .prepare(
        "INSERT INTO capture_sessions(token_hash,tenant_id,user_id,session_hash,order_id,expires_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        digest(token),
        ctx.tenantId,
        ctx.userId,
        digest(sessionToken),
        orderId,
        Date.now() + 1800000,
      );
    return {
      token,
      number: order.number,
      plate: /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate) ? plate : "",
      expires_minutes: 30,
    };
  });
}
export async function captureState(db: DB, ctx: Context, orderId: string) {
  requireAdmin(ctx);
  const order = await scoped(db, "orders", ctx.tenantId, orderId);
  const items = await db
    .prepare(
      "SELECT i.*,e.duration_seconds,e.source capture_source,e.vehicle_label FROM order_items i LEFT JOIN external_captures e ON e.item_id=i.id AND e.tenant_id=i.tenant_id WHERE i.tenant_id=? AND i.order_id=?",
    )
    .all(ctx.tenantId, orderId);
  return { items, total: order.total };
}
export async function finishCapture(db: DB, ctx: Context, orderId: string) {
  requireAdmin(ctx);
  return transaction(db, async () => {
    await scoped(db, "orders", ctx.tenantId, orderId);
    await db
      .prepare("DELETE FROM capture_sessions WHERE tenant_id=? AND order_id=?")
      .run(ctx.tenantId, orderId);
    return captureState(db, ctx, orderId);
  });
}
export async function importCapture(db: DB, token: string, input: unknown) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw Object.assign(
      new Error("Conecte a extensão novamente no orçamento."),
      { status: 401 },
    );
  const v = captureSchema.parse(input);
  return transaction(db, async () => {
    const s = await db
      .prepare(
        `SELECT c.* FROM capture_sessions c JOIN sessions s ON s.token_hash=c.session_hash AND s.user_id=c.user_id AND s.tenant_id=c.tenant_id
      JOIN memberships m ON m.user_id=c.user_id AND m.tenant_id=c.tenant_id
      WHERE c.token_hash=? AND c.expires_at>? AND s.expires_at>? AND m.role='owner'`,
      )
      .get(digest(token), Date.now(), Date.now());
    if (!s)
      throw Object.assign(
        new Error("Conexão expirada. Abra o orçamento e conecte novamente."),
        { status: 401 },
      );
    const ctx = {
      tenantId: String(s.tenant_id),
      userId: String(s.user_id),
      role: "owner",
    };
    const order = await scoped(db, "orders", ctx.tenantId, s.order_id);
    if (order.kind !== "quote" || order.status !== "quote")
      throw new Error("Este orçamento não aceita mais capturas.");
    const hash = digest(JSON.stringify(v));
    const prior = await db
      .prepare(
        "SELECT * FROM external_captures WHERE tenant_id=? AND capture_id=?",
      )
      .get(ctx.tenantId, v.capture_id);
    if (prior) {
      if (prior.order_id !== order.id || prior.payload_hash !== hash)
        throw new Error("Identificação de captura já utilizada.");
      return { ok: true, duplicate: true, number: order.number };
    }
    const vehicle = order.vehicle_id
      ? await scoped(db, "vehicles", ctx.tenantId, order.vehicle_id)
      : null;
    const plateKey = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const targetPlate = plateKey(vehicle?.plate || order.guest_plate || "");
    if (
      v.vehicle.plate &&
      targetPlate &&
      plateKey(v.vehicle.plate) !== targetPlate
    )
      throw new Error(
        "A placa capturada pertence a outro veículo. Confira o orçamento de destino.",
      );
    const key =
      v.source === "sky"
        ? `${v.code.toUpperCase()}|${v.brand.toUpperCase()}`
        : serviceNameKey(v.name);
    if (!key) throw new Error("Identificação do item inválida.");
    const linked = await db
      .prepare(
        "SELECT catalog_id FROM external_catalog_links WHERE tenant_id=? AND source=? AND external_key=?",
      )
      .get(ctx.tenantId, v.source, key);
    let catalog = linked
      ? await scoped(db, "catalog", ctx.tenantId, linked.catalog_id)
      : undefined;
    if (catalog?.merged_into)
      catalog = await scoped(db, "catalog", ctx.tenantId, catalog.merged_into);
    if (catalog?.archived_at) catalog = undefined;
    if (!catalog && v.source === "tempario") {
      const alias = await db
        .prepare(
          "SELECT a.catalog_id FROM service_aliases a JOIN catalog c ON c.id=a.catalog_id AND c.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.alias_key=? AND c.archived_at IS NULL",
        )
        .get(ctx.tenantId, key);
      catalog = alias
        ? await scoped(db, "catalog", ctx.tenantId, alias.catalog_id)
        : (
            await db
              .prepare(
                "SELECT * FROM catalog WHERE tenant_id=? AND kind='service' AND merged_into IS NULL AND archived_at IS NULL",
              )
              .all(ctx.tenantId)
          ).find((c) => serviceNameKey(c.name) === key);
    }
    if (catalog && !catalog.active)
      throw new Error(
        "Este item está inativo no catálogo. Reative-o antes de importar.",
      );
    const price = v.source === "sky" ? suggestedPrice(v.cost) : v.price;
    if (!catalog) {
      const catalogId = id();
      await db
        .prepare(
          "INSERT INTO catalog(id,tenant_id,kind,name,sku,category,cost,price,stock,minimum_stock,cost_known,stock_verified) VALUES(?,?,?,?,?,?,?,?,0,0,?,0)",
        )
        .run(
          catalogId,
          ctx.tenantId,
          v.source === "sky" ? "product" : "service",
          v.name,
          `EXT-${catalogId.slice(0, 12)}`,
          v.source === "sky" ? "Sky Peças" : "Tempario",
          v.cost,
          price,
          v.source === "sky" ? 1 : 0,
        );
      catalog = await scoped(db, "catalog", ctx.tenantId, catalogId);
    }
    await db
      .prepare(
        "INSERT INTO external_catalog_links(tenant_id,source,external_key,catalog_id) VALUES(?,?,?,?) ON CONFLICT(tenant_id,source,external_key) DO UPDATE SET catalog_id=excluded.catalog_id",
      )
      .run(ctx.tenantId, v.source, key, catalog.id);
    // A repeated click never increments quantities silently. Quantities are edited in the quote.
    const same = await db
      .prepare(
        "SELECT i.id FROM external_captures e JOIN order_items i ON i.id=e.item_id AND i.tenant_id=e.tenant_id WHERE e.tenant_id=? AND e.order_id=? AND e.source=? AND e.external_key=?",
      )
      .get(ctx.tenantId, order.id, v.source, key);
    if (same) return { ok: true, duplicate: true, number: order.number };
    const count = await db
      .prepare(
        "SELECT COUNT(*) n FROM order_items WHERE tenant_id=? AND order_id=?",
      )
      .get(ctx.tenantId, order.id);
    if (Number(count?.n) >= 200)
      throw new Error("O orçamento atingiu o limite de 200 itens.");
    const itemId = id();
    await db
      .prepare(
        "INSERT INTO order_items(id,tenant_id,order_id,catalog_id,professional_id,kind,name,quantity,price,cost) VALUES(?,?,?,?,NULL,?,?,?,?,?)",
      )
      .run(
        itemId,
        ctx.tenantId,
        order.id,
        catalog.id,
        catalog.kind,
        catalog.name,
        v.quantity,
        price,
        v.source === "sky" ? v.cost : catalog.cost,
      );
    const label = [
      v.vehicle.make,
      v.vehicle.model,
      v.vehicle.year,
      v.vehicle.engine,
    ]
      .filter(Boolean)
      .join(" · ");
    await db
      .prepare(
        "INSERT INTO external_captures(id,tenant_id,capture_id,order_id,item_id,catalog_id,source,external_key,payload_hash,duration_seconds,source_cost,source_price,vehicle_label) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id(),
        ctx.tenantId,
        v.capture_id,
        order.id,
        itemId,
        catalog.id,
        v.source,
        key,
        hash,
        v.duration_seconds ?? null,
        v.cost,
        price,
        label,
      );
    if (v.source === "tempario")
      await db
        .prepare(
          "INSERT INTO service_times(id,tenant_id,catalog_id,capture_id,source,service_name,make,model,vehicle_year,engine,duration_seconds,source_price) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id(),
          ctx.tenantId,
          catalog.id,
          v.capture_id,
          "Tempario",
          v.name,
          v.vehicle.make,
          v.vehicle.model,
          v.vehicle.year,
          v.vehicle.engine,
          v.duration_seconds,
          v.price,
        );
    await db
      .prepare("UPDATE orders SET total=total+? WHERE tenant_id=? AND id=?")
      .run(price * v.quantity, ctx.tenantId, order.id);
    await audit(db, ctx, "extension.imported", order.id);
    return {
      ok: true,
      duplicate: false,
      number: order.number,
      name: catalog.name,
    };
  });
}
