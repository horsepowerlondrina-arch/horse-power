import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrate } from "./migrate";
export function createDatabase(
  path = process.env.DATABASE_PATH || resolve("data/horse-power.sqlite"),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  migrate(db);
  return db;
}
export type DB = ReturnType<typeof createDatabase>;
export function transaction<T>(db: DB, callback: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
