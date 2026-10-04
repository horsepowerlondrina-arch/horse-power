import { randomBytes } from "node:crypto";
import { z } from "zod";
import { type DB, transaction } from "../db/database.js";
import { digest, type Context } from "../auth/session.js";
import { requireAdmin } from "./payments.js";
import { audit, id, scoped } from "./workshop.js";
import { serviceNameKey } from "./serviceCatalog.js";
import { workshopPrice } from "./partsPricing.js";
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
export { legacyPrice as suggestedPrice } from "./partsPricing.js";
export async function beginCapture(
  db: DB,
  ctx: Context,
  orderId: string,
  sessionToken: string,
  freightUnit = 0,
) {
  requireAdmin(ctx);
  return transaction(db, async () => {
    const order = await scoped(db, "orders", ctx.tenantId, orderId);
    if (["completed", "cancelled"].includes(order.status))
      throw new Error(
        "A captura está disponível em orçamentos e OS em andamento.",
      );
    const vehicle = order.vehicle_id
      ? await scoped(db, "vehicles", ctx.tenantId, order.vehicle_id)
      : null;
    const plate = String(vehicle?.plate || order?.guest_plate || "")
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
        "INSERT INTO capture_sessions(token_hash,tenant_id,user_id,session_hash,order_id,expires_at,freight_unit) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        digest(token),
        ctx.tenantId,
        ctx.userId,
        digest(sessionToken),
        orderId,
        Date.now() + 1800000,
        freightUnit,
      );
    return {
      token,
      destination: "order",
      label: `${order.kind === "quote" ? "Orçamento" : "OS"} #${order.number}`,
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
    const order = s.order_id
      ? await scoped(db, "orders", ctx.tenantId, s.order_id)
      : null;
    if (!order && !s.catalog_target)
      throw new Error("Destino da captura inválido.");
    const labelText = order
      ? `${order.kind === "quote" ? "Orçamento" : "OS"} #${order.number}`
      : "Catálogo";
    if (order && ["completed", "cancelled"].includes(order.status))
      throw new Error("Este atendimento não aceita mais capturas.");
    const hash = digest(JSON.stringify(v));
    const prior = await db
      .prepare(
        "SELECT * FROM external_captures WHERE tenant_id=? AND capture_id=?",
      )
      .get(ctx.tenantId, v.capture_id);
    if (prior) {
      if (
        prior.order_id !== (order?.id ?? null) ||
        prior.catalog_target !== (s.catalog_target ?? null) ||
        prior.payload_hash !== hash
      )
        throw new Error("Identificação de captura já utilizada.");
      return {
        ok: true,
        duplicate: true,
        number: order?.number,
        label: labelText,
      };
    }
    const vehicle = order?.vehicle_id
      ? await scoped(db, "vehicles", ctx.tenantId, order.vehicle_id)
      : null;
    const plateKey = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const targetPlate = plateKey(vehicle?.plate || order?.guest_plate || "");
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
    const landedCost =
      v.cost + (v.source === "sky" ? Number(s.freight_unit || 0) : 0);
    if (landedCost > 100000000)
      throw new Error("Custo com frete acima do limite.");
    const price =
      v.source === "sky"
        ? await workshopPrice(db, ctx.tenantId, landedCost)
        : v.price;
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
          landedCost,
          price,
          v.source === "sky" ? 1 : 0,
        );
      catalog = await scoped(db, "catalog", ctx.tenantId, catalogId);
    }
    if (v.source === "sky") {
      await db
        .prepare(
          "UPDATE catalog SET cost=?,price=?,cost_known=1,freight_unit=? WHERE tenant_id=? AND id=?",
        )
        .run(landedCost, price, s.freight_unit || 0, ctx.tenantId, catalog.id);
      catalog = { ...catalog, cost: landedCost, price };
    }
    await db
      .prepare(
        "INSERT INTO external_catalog_links(tenant_id,source,external_key,catalog_id) VALUES(?,?,?,?) ON CONFLICT(tenant_id,source,external_key) DO UPDATE SET catalog_id=excluded.catalog_id",
      )
      .run(ctx.tenantId, v.source, key, catalog.id);
    // A repeated click never increments quantities silently. Quantities are edited in the quote.
    let itemId: string | null = null;
    if (order) {
      const same = await db
        .prepare(
          "SELECT i.id FROM external_captures e JOIN order_items i ON i.id=e.item_id AND i.tenant_id=e.tenant_id WHERE e.tenant_id=? AND e.order_id=? AND e.source=? AND e.external_key=?",
        )
        .get(ctx.tenantId, order.id, v.source, key);
      if (same)
        return {
          ok: true,
          duplicate: true,
          number: order?.number,
          label: labelText,
        };
      const count = await db
        .prepare(
          "SELECT COUNT(*) n FROM order_items WHERE tenant_id=? AND order_id=?",
        )
        .get(ctx.tenantId, order.id);
      if (Number(count?.n) >= 200)
        throw new Error("O orçamento atingiu o limite de 200 itens.");
      itemId = id();
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
          v.source === "sky" ? landedCost : catalog.cost,
        );
    }
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
        "INSERT INTO external_captures(id,tenant_id,capture_id,order_id,item_id,catalog_id,source,external_key,payload_hash,duration_seconds,source_cost,source_price,vehicle_label,catalog_target) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id(),
        ctx.tenantId,
        v.capture_id,
        order?.id ?? null,
        itemId,
        catalog.id,
        v.source,
        key,
        hash,
        v.duration_seconds ?? null,
        v.cost,
        price,
        label,
        s.catalog_target ?? null,
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
    if (order)
      await db
        .prepare("UPDATE orders SET total=total+? WHERE tenant_id=? AND id=?")
        .run(price * v.quantity, ctx.tenantId, order.id);
    await audit(db, ctx, "extension.imported", order?.id || s.catalog_target);
    return {
      ok: true,
      duplicate: false,
      number: order?.number,
      label: labelText,
      name: catalog.name,
    };
  });
}

export async function beginCatalogCapture(
  db: DB,
  ctx: Context,
  target: string,
  sessionToken: string,
  freightUnit = 0,
) {
  requireAdmin(ctx);
  z.string().uuid().parse(target);
  return transaction(db, async () => {
    await db
      .prepare(
        "DELETE FROM capture_sessions WHERE tenant_id=? AND catalog_target=?",
      )
      .run(ctx.tenantId, target);
    const token = randomBytes(32).toString("hex");
    await db
      .prepare(
        "INSERT INTO capture_sessions(token_hash,tenant_id,user_id,session_hash,order_id,catalog_target,expires_at,freight_unit) VALUES(?,?,?,?,NULL,?,?,?)",
      )
      .run(
        digest(token),
        ctx.tenantId,
        ctx.userId,
        digest(sessionToken),
        target,
        Date.now() + 1800000,
        freightUnit,
      );
    return {
      token,
      number: 0,
      orderId: target,
      destination: "catalog",
      label: "Catálogo",
      plate: "",
      expires_minutes: 30,
    };
  });
}
export async function catalogCaptureState(
  db: DB,
  ctx: Context,
  target: string,
  finish = false,
) {
  requireAdmin(ctx);
  z.string().uuid().parse(target);
  return transaction(db, async () => {
    if (finish)
      await db
        .prepare(
          "DELETE FROM capture_sessions WHERE tenant_id=? AND catalog_target=?",
        )
        .run(ctx.tenantId, target);
    const items = await db
      .prepare(
        "SELECT c.*,e.id capture_receipt,e.source capture_source,e.duration_seconds,1 quantity FROM external_captures e JOIN catalog c ON c.id=e.catalog_id AND c.tenant_id=e.tenant_id WHERE e.tenant_id=? AND e.catalog_target=? AND c.archived_at IS NULL ORDER BY e.created_at DESC",
      )
      .all(ctx.tenantId, target);
    return { items: [...new Map(items.map((i) => [i.id, i])).values()] };
  });
}
