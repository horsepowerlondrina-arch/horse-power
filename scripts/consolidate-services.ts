import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createDatabase, transaction } from "../server/db/database.ts";
import { mergeServices } from "../server/services/serviceCatalog.ts";
const db = createDatabase();
const batch = "service-consolidation-2026-09-23";
if (db.prepare("SELECT 1 FROM import_batches WHERE id=?").get(batch)) {
  console.log("Consolidação já aplicada.");
  process.exit(0);
}
const tenant = "hp-centro";
const groups = [
  ["real-item-16", "real-item-238", "Troca da bobina de ignição"],
  [
    "real-item-193",
    "real-item-375",
    "Remoção e recolocação da mangueira da direção hidráulica",
  ],
  ["real-item-325", "real-item-829", "Troca da correia de acessórios"],
  ["real-item-61", "real-item-551", "Troca da junta da tampa de válvulas"],
  ["real-item-368", "real-item-728", "Troca do sensor de pressão de óleo"],
  [
    "real-item-292",
    "real-item-734",
    "Troca dos terminais de direção (ambos os lados)",
  ],
  ["real-item-203", "real-item-406", "Troca do reparo do trambulador"],
];
const snapshot = () => ({
  orders: db
    .prepare("SELECT * FROM orders WHERE tenant_id=? ORDER BY id")
    .all(tenant),
  items: db
    .prepare(
      "SELECT id,tenant_id,order_id,professional_id,kind,name,quantity,price,cost FROM order_items WHERE tenant_id=? ORDER BY id",
    )
    .all(tenant),
  receivables: db
    .prepare("SELECT * FROM receivables WHERE tenant_id=? ORDER BY id")
    .all(tenant),
  cash: db
    .prepare("SELECT * FROM cash_entries WHERE tenant_id=? ORDER BY id")
    .all(tenant),
});
mkdirSync("data/backups", { recursive: true });
const backup = `data/backups/pre-service-consolidation-${Date.now()}.sqlite`;
db.exec(`VACUUM INTO '${backup}'`);
const before = snapshot();
const report: any[] = [];
try {
  await transaction(db, async () => {
    for (const [canonical, duplicate, name] of groups) {
      const old = db
        .prepare("SELECT id,name,price FROM catalog WHERE id IN (?,?)")
        .all(canonical, duplicate);
      await mergeServices(
        db,
        { tenantId: tenant, userId: "demo-owner", role: "owner" },
        canonical,
        [duplicate],
        name,
      );
      report.push({ canonical, name, previous: old });
    }
    assert.deepEqual(
      snapshot(),
      before,
      "O histórico operacional ou financeiro foi alterado",
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    db.prepare("INSERT INTO import_batches(id,summary) VALUES(?,?)").run(
      batch,
      JSON.stringify({
        groups: report.length,
        duplicates: report.length,
        backup,
      }),
    );
  });
  mkdirSync("docs", { recursive: true });
  writeFileSync(
    "docs/06-servicos-unificados.md",
    "# Serviços unificados\n\nSete grupos revisados manualmente. Nomes, quantidades, preços e valores de todas as OS permanecem exatamente iguais. Apenas os vínculos do catálogo apontam ao cadastro principal. O preço atual de cada cadastro principal foi mantido. Os cadastros redundantes foram arquivados e os nomes/códigos antigos continuam pesquisáveis.\n\n" +
      report
        .map(
          (r) =>
            `- **${r.name}**: ${r.previous.map((p: any) => p.name + " (" + p.id + ")").join(" + ")}`,
        )
        .join("\n") +
      "\n\nDiferenças de lado, quantidade, veículo, componentes do kit, desmontagem incluída e serviços adicionais foram mantidas separadas. Ex.: bucha versus duas buchas; retífica versus retífica completa; bomba d’água + kit de distribuição versus bomba + correia; pivô genérico versus pivô de bandeja. Não houve consolidação por similaridade automática.\n\nO cadastro agora recusa serviços repetidos por diferenças de acento, maiúsculas, pontuação e preposições, ou pelo uso de um nome alternativo já consolidado. Produtos não foram alterados. Histórico reversível em service_merge_history e backup anterior em data/backups.\n",
  );
  console.log({
    groups: report.length,
    active: db
      .prepare(
        "SELECT COUNT(*) n FROM catalog WHERE tenant_id=? AND kind='service' AND active=1",
      )
      .get(tenant),
    history: "unchanged",
    backup,
  });
} finally {
  db.close();
}
