import { randomBytes } from "node:crypto";
import { type DB, transaction } from "../db/database.js";
import { digest, type Context } from "../auth/session.js";
import { requireAdmin } from "./payments.js";
import { scoped, audit } from "./workshop.js";
export async function createShare(db: DB, ctx: Context, record: string) {
  requireAdmin(ctx);
  return await transaction(db, async () => {
    await scoped(db, "orders", ctx.tenantId, record);
    const current = await db
      .prepare(
        `SELECT token_value FROM public_shares
         WHERE tenant_id=? AND order_id=? AND revoked=0 AND expires_at>?
           AND token_value IS NOT NULL AND token_value<>''
         ORDER BY expires_at DESC LIMIT 1`,
      )
      .get(ctx.tenantId, record, Date.now());
    if (current?.token_value) {
      await audit(db, ctx, "order.share_reused", record);
      return {
        path: `/p/${current.token_value}`,
        expires_days: null,
        reused: true,
      };
    }

    const token = randomBytes(32).toString("hex");
    await db
      .prepare(
        "UPDATE public_shares SET revoked=1 WHERE tenant_id=? AND order_id=? AND revoked=0",
      )
      .run(ctx.tenantId, record);
    await db
      .prepare(
        "INSERT INTO public_shares(token_hash,tenant_id,order_id,expires_at,token_value) VALUES(?,?,?,?,?)",
      )
      .run(
        digest(token),
        ctx.tenantId,
        record,
        Number.MAX_SAFE_INTEGER,
        token,
      );
    await audit(db, ctx, "order.shared", record);
    return { path: `/p/${token}`, expires_days: null, reused: false };
  });
}
export async function readShare(db: DB, token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const s = await db
    .prepare(
      "SELECT tenant_id,order_id FROM public_shares WHERE token_hash=? AND revoked=0 AND expires_at>?",
    )
    .get(digest(token), Date.now());
  if (!s) return null;
  const o = await scoped(db, "orders", String(s.tenant_id), String(s.order_id));
  const c = o.customer_id
    ? await scoped(db, "customers", String(s.tenant_id), o.customer_id)
    : null;
  const v = o.vehicle_id
    ? await scoped(db, "vehicles", String(s.tenant_id), o.vehicle_id)
    : null;
  const shop = await db
    .prepare("SELECT name,phone,address FROM tenants WHERE id=?")
    .get(s.tenant_id);
  return {
    shop,
    number: o.number,
    kind: o.kind,
    status: o.status,
    customer: (c?.name || o.guest_name || "Cliente").split(" ")[0],
    vehicle: v ? `${v.brand} ${v.model}` : o.guest_vehicle,
    plate: v?.plate || o.guest_plate,
    entered_on: o.entered_on,
    total: o.total,
    discount: o.discount,
    items: await db
      .prepare(
        "SELECT kind,name,quantity,price FROM order_items WHERE tenant_id=? AND order_id=?",
      )
      .all(s.tenant_id, s.order_id),
  };
}
