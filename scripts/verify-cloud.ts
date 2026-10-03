import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPostgresDatabase } from "../server/db/postgres";
const db = createPostgresDatabase();
try {
  const expected = JSON.parse(
    readFileSync("data/cloud/expected-rows.json", "utf8"),
  );
  for (const [table, rows] of Object.entries(expected) as [string, any[]][]) {
    if (!/^[a-z_]+$/.test(table)) throw new Error("Invalid table");
    const actual = await db.prepare(`SELECT * FROM ${table}`).all();
    const normalize = (values: any[]) =>
      values
        .map((v) =>
          JSON.stringify(
            Object.fromEntries(
              Object.entries(v).sort(([a], [b]) => a.localeCompare(b)),
            ),
          ),
        )
        .sort();
    assert.deepEqual(
      normalize(actual),
      normalize(rows),
      `Mismatch in ${table}`,
    );
    console.log(`${table}: ${actual.length} registros conferidos`);
  }
  console.log(
    "Todos os registros e valores importados correspondem ao backup.",
  );
} finally {
  await db.close();
}
