import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDatabase, transaction, type DB } from "../server/db/database.js";
import { createPostgresDatabase } from "../server/db/postgres.js";
import { enableExtensionCatalog } from "../server/services/catalogReset.js";

const args = process.argv.slice(2);
const arg = (name: string) =>
  args.find((a) => a.startsWith(name + "="))?.slice(name.length + 1);
const tenantId = arg("--tenant");
const ownerEmail = arg("--owner");
if (!tenantId || !ownerEmail)
  throw new Error(
    "Informe --tenant e --owner. O padrão é simular; use --apply para executar.",
  );
const db: DB & { close(): any } = args.includes("--local")
  ? createDatabase()
  : createPostgresDatabase();
const protectedTables = [
  "customers",
  "vehicles",
  "orders",
  "order_items",
  "stock_movements",
  "receivables",
  "payment_installments",
  "cash_entries",
  "payables",
  "expense_templates",
  "service_times",
  "external_captures",
];
async function businessSnapshot() {
  const result: Record<string, { count: number; hash: string }> = {};
  for (const table of protectedTables) {
    const rows = await db
      .prepare(`SELECT * FROM ${table} WHERE tenant_id=? ORDER BY id`)
      .all(tenantId!);
    result[table] = {
      count: rows.length,
      hash: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    };
  }
  return result;
}
try {
  await transaction(db, async () => {
    const tenant = await db
      .prepare("SELECT id,name,catalog_mode FROM tenants WHERE id=?")
      .get(tenantId);
    const owner = await db
      .prepare(
        "SELECT m.user_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role='owner' AND lower(u.email)=lower(?)",
      )
      .get(tenantId, ownerEmail);
    if (!tenant || !owner)
      throw new Error(
        "Oficina e administrador não conferem. Nenhuma alteração realizada.",
      );
    const counts = await db
      .prepare(
        "SELECT kind,active,COUNT(*) n FROM catalog WHERE tenant_id=? AND archived_at IS NULL GROUP BY kind,active",
      )
      .all(tenantId);
    console.log({
      workshop: tenant.name,
      mode: tenant.catalog_mode,
      catalog: counts,
    });
    if (!args.includes("--apply") || tenant.catalog_mode === "extension") {
      console.log(
        tenant.catalog_mode === "extension"
          ? "Já configurado. Novos itens foram preservados."
          : "Simulação concluída. Nenhum dado alterado.",
      );
      return;
    }
    const before = await businessSnapshot();
    const backup: Record<string, any> = {
      tenant,
      created_at: new Date().toISOString(),
      business_snapshot: before,
    };
    for (const table of [
      "catalog",
      "service_aliases",
      "external_catalog_links",
    ])
      backup[table] = await db
        .prepare(`SELECT * FROM ${table} WHERE tenant_id=?`)
        .all(tenantId);
    const folder = resolve("data/backups");
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const file = resolve(folder, `catalog-before-extension-${Date.now()}.json`);
    writeFileSync(file, JSON.stringify(backup, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    const result = await enableExtensionCatalog(db, {
      tenantId,
      userId: owner.user_id,
      role: "owner",
    });
    assert.deepEqual(
      await businessSnapshot(),
      before,
      "O histórico deve permanecer idêntico.",
    );
    assert.equal(
      (await db
        .prepare(
          "SELECT COUNT(*) n FROM catalog WHERE tenant_id=? AND archived_at IS NULL",
        )
        .get(tenantId))!.n,
      0,
    );
    console.log({
      ...result,
      backup: file,
      history: "unchanged",
      available_catalog: 0,
    });
  });
} finally {
  await db.close();
}
