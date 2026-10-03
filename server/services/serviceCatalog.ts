import { type DB } from "../db/database";
import type { Context } from "../auth/session";
import { requireAdmin } from "./payments";
import { audit, id, scoped } from "./workshop";
export const serviceNameKey = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["de", "do", "da", "dos", "das"].includes(w))
    .join(" ");
export function assertUniqueService(
  db: DB,
  tenant: string,
  name: string,
  record?: string,
) {
  const key = serviceNameKey(name);
  const alias = db
    .prepare(
      "SELECT c.id,c.name FROM service_aliases a JOIN catalog c ON c.id=a.catalog_id AND c.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.alias_key=? AND c.id<>?",
    )
    .get(tenant, key, record || "");
  const existing =
    alias ||
    db
      .prepare(
        "SELECT id,name FROM catalog WHERE tenant_id=? AND kind='service' AND merged_into IS NULL AND id<>?",
      )
      .all(tenant, record || "")
      .find((c) => serviceNameKey(String(c.name)) === key);
  if (existing)
    throw new Error(
      `Este serviço já está cadastrado como “${existing.name}”. Selecione o cadastro existente (ou reative-o se estiver inativo).`,
    );
}
export function mergeServices(
  db: DB,
  ctx: Context,
  canonicalId: string,
  duplicateIds: string[],
  name: string,
) {
  requireAdmin(ctx);
  return mergeTransaction(db, () => {
    const ids = [canonicalId, ...duplicateIds];
    if (new Set(ids).size !== ids.length || !duplicateIds.length)
      throw new Error("Grupo de serviços inválido.");
    const records = ids.map((record) =>
      scoped(db, "catalog", ctx.tenantId, record),
    );
    if (records.some((r) => r.kind !== "service" || !r.active || r.merged_into))
      throw new Error(
        "Só é possível consolidar serviços ativos ainda não unificados.",
      );
    const beforeItems = db
      .prepare(
        `SELECT id,catalog_id FROM order_items WHERE tenant_id=? AND catalog_id IN (${ids.map(() => "?").join(",")})`,
      )
      .all(ctx.tenantId, ...ids);
    const aliases = [
      name,
      ...records.flatMap((r) => [r.name, r.sku]),
      ...db
        .prepare(
          `SELECT alias FROM service_aliases WHERE tenant_id=? AND catalog_id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(ctx.tenantId, ...ids)
        .map((r) => String(r.alias)),
    ];
    for (const alias of aliases) {
      const key = serviceNameKey(alias);
      const prior = db
        .prepare(
          "SELECT catalog_id FROM service_aliases WHERE tenant_id=? AND alias_key=?",
        )
        .get(ctx.tenantId, key);
      if (prior && !ids.includes(String(prior.catalog_id)))
        throw new Error("Nome alternativo já pertence a outro serviço.");
      db.prepare(
        "INSERT INTO service_aliases(tenant_id,alias_key,alias,catalog_id) VALUES(?,?,?,?) ON CONFLICT(tenant_id,alias_key) DO UPDATE SET catalog_id=excluded.catalog_id",
      ).run(ctx.tenantId, key, alias, canonicalId);
    }
    db.prepare(
      "INSERT INTO service_merge_history(id,tenant_id,canonical_id,previous_records) VALUES(?,?,?,?)",
    ).run(
      id(),
      ctx.tenantId,
      canonicalId,
      JSON.stringify({ records, items: beforeItems }),
    );
    db.prepare("UPDATE catalog SET name=? WHERE tenant_id=? AND id=?").run(
      name,
      ctx.tenantId,
      canonicalId,
    );
    for (const duplicate of duplicateIds) {
      db.prepare(
        "UPDATE order_items SET catalog_id=? WHERE tenant_id=? AND catalog_id=?",
      ).run(canonicalId, ctx.tenantId, duplicate);
      db.prepare(
        "UPDATE catalog SET active=0,merged_into=? WHERE tenant_id=? AND id=?",
      ).run(canonicalId, ctx.tenantId, duplicate);
    }
    audit(db, ctx, "services.consolidated", canonicalId);
  });
}

function mergeTransaction<T>(db: DB, action: () => T): T {
  db.exec("SAVEPOINT service_merge");
  try {
    const result = action();
    db.exec("RELEASE service_merge");
    return result;
  } catch (error) {
    db.exec("ROLLBACK TO service_merge; RELEASE service_merge");
    throw error;
  }
}
