import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
export function migrate(db: DatabaseSync) {
  for (const [version, file] of [
    [2, "002-workflows.sql"],
    [3, "003-real-workshop.sql"],
    [4, "004-expense-month.sql"],
    [5, "005-service-consolidation.sql"],
    [6, "006-cloud-access.sql"],
    [7, "007-extension.sql"],
    [8, "008-extension-catalog.sql"],
    [9, "009-catalog-stock-pricing.sql"],
  ] as const) {
    if (db.prepare("SELECT 1 FROM migrations WHERE version=?").get(version))
      continue;
    db.exec("PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;");
    try {
      db.exec(
        readFileSync(new URL(`./migrations/${file}`, import.meta.url), "utf8"),
      );
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Migração interrompida: vínculos inconsistentes.");
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    } finally {
      db.exec("PRAGMA foreign_keys=ON;");
    }
  }
}
