import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "../server/db/database";
import { parseStockInvoice, validGtin } from "../server/domain/stockInvoice";
import {
  previewStockInvoice,
  importStockInvoice,
} from "../server/services/stockInvoices";
import { postgresSql } from "../server/db/postgres";
import { createApp } from "../server/app";
import { digest } from "../server/auth/session";
const ctx = { tenantId: "a", userId: "u", role: "owner" };
function fixture() {
  const db = createDatabase(":memory:");
  db.exec(
    "INSERT INTO tenants(id,name) VALUES('a','A'),('b','B'); INSERT INTO users VALUES('u','Admin','a@example.test','disabled'); INSERT INTO memberships VALUES('u','a','owner'); INSERT INTO catalog(id,tenant_id,kind,name,sku,cost,price,stock) VALUES('p','a','product','Filtro de óleo','SKU',900,2000,5),('q','a','product','Filtro de óleo','OTHER',1000,2200,0),('foreign','b','product','Filtro de óleo','OTHER',500,2000,0)",
  );
  return db;
}
function xml(
  number = 1,
  quantity = "2.0000",
  code = "SUP-1",
  gtin = "SEM GTIN",
) {
  const key43 =
    "412610" +
    "12345678000195" +
    "55" +
    "001" +
    String(number).padStart(9, "0") +
    "1" +
    "12345678";
  let sum = 0;
  for (let i = 42, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1)
    sum += Number(key43[i]) * w;
  const v = 11 - (sum % 11),
    key = key43 + (v >= 10 ? 0 : v);
  return `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${key}" versao="4.00"><ide><mod>55</mod><tpAmb>1</tpAmb><tpNF>1</tpNF><nNF>${number}</nNF><dhEmi>2026-10-11T10:00:00-03:00</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor &amp; Cia</xNome></emit><dest><CNPJ>98765432000100</CNPJ></dest><det nItem="1"><prod><cProd>${code}</cProd><cEAN>${gtin}</cEAN><xProd>Filtro de óleo</xProd><uCom>UN</uCom><qCom>${quantity}</qCom><vProd>40.00</vProd><vDesc>2.00</vDesc><vFrete>4.00</vFrete><vSeg>1.00</vSeg><vOutro>1.00</vOutro></prod><imposto><ICMS><ICMS10><vICMS>5.00</vICMS><vICMSST>2.00</vICMSST><vFCPST>1.00</vFCPST></ICMS10></ICMS><IPI><IPITrib><vIPI>3.00</vIPI></IPITrib></IPI></imposto></det></infNFe></NFe><protNFe><infProt><tpAmb>1</tpAmb><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe></nfeProc>`;
}
const choice = { line: "1", catalog_id: "p", quantity: 2 };
test("authorized XML preserves text, leading-zero codes, quantities and landed costs without double ICMS", () => {
  const result = parseStockInvoice(xml(1, "2.0000", "00001"));
  assert.equal(result.document, "12345678000195");
  assert.equal(result.supplier, "Fornecedor & Cia");
  assert.equal(result.items[0].code, "00001");
  assert.equal(result.items[0].totalCost, 5000);
  assert.equal(result.items[0].freight, 400);
  assert.equal(result.items[0].quantity, 2);
  assert.equal(validGtin("7891234567895"), "7891234567895");
  assert.equal(validGtin("7891234567890"), "");
});
test("invalid, unapproved, test, oversized and entity XML are rejected", () => {
  assert.throws(() => parseStockInvoice("<not-nfe/>"));
  assert.throws(
    () => parseStockInvoice(xml().replace("<cStat>100", "<cStat>101")),
    /autorizada/,
  );
  assert.throws(
    () => parseStockInvoice(xml().replaceAll("<tpAmb>1", "<tpAmb>2")),
    /produção/,
  );
  assert.throws(
    () => parseStockInvoice(xml().replace('Id="NFe4', 'Id="NFe5')),
    /Chave/,
  );
  assert.throws(
    () =>
      parseStockInvoice(
        "<!DOCTYPE x [<!ENTITY x SYSTEM 'file:///etc/passwd'>]>" + xml(),
      ),
    /entidades/,
  );
  assert.throws(
    () => parseStockInvoice(" ".repeat(2 * 1024 * 1024 + 1)),
    /2 MB/,
  );
  assert.throws(
    () => parseStockInvoice(xml().replace("2.0000", "-2.00")),
    /Quantidade/,
  );
});
test("same names require review; preview is read only and existing product gets quantity only", async () => {
  const db = fixture();
  try {
    const p = await previewStockInvoice(db, ctx, xml());
    assert.equal(p.items[0].catalog_id, "");
    assert.equal(p.items[0].match, "review");
    assert.equal(p.items[0].candidates.length, 2);
    assert.equal(
      db.prepare("SELECT count(*) n FROM stock_movements").get()!.n,
      0,
    );
    const before = db.prepare("SELECT * FROM catalog WHERE id='p'").get()!;
    const result = await importStockInvoice(db, ctx, xml(), [
      { ...choice, cost: 9999, price: 99999, name: "Overwritten" },
    ]);
    const after = db.prepare("SELECT * FROM catalog WHERE id='p'").get()!;
    assert.equal(result.updated, 1);
    assert.equal(after.stock, 7);
    assert.deepEqual(
      { ...after, stock: before.stock, stock_verified: before.stock_verified },
      { ...before },
    );
    const next = await previewStockInvoice(db, ctx, xml(2));
    assert.equal(next.items[0].catalog_id, "p");
    assert.equal(next.items[0].match, "supplier");
  } finally {
    db.close();
  }
});
test("new products get suggested pricing and stock; duplicate and concurrent retry do not increment", async () => {
  const db = fixture();
  try {
    const file = xml(1, "2.0000", "NEW").replace(
      "<xProd>Filtro de óleo",
      "<xProd>Peça inédita",
    );
    const p = await previewStockInvoice(db, ctx, file);
    assert.equal(p.items[0].match, "new");
    assert.equal(p.items[0].cost, 2500);
    assert.equal(p.items[0].price, 4000);
    const results = await Promise.all([
      importStockInvoice(db, ctx, file, [{ line: "1", quantity: 2 }]),
      importStockInvoice(db, ctx, file, [{ line: "1", quantity: 2 }]),
    ]);
    assert.equal(results.filter((r) => r.duplicate).length, 1);
    const created = db
      .prepare("SELECT * FROM catalog WHERE name='Peça inédita'")
      .get()!;
    assert.equal(created.stock, 2);
    assert.equal(created.cost, 2500);
    assert.equal(created.price, 4000);
    assert.equal(created.freight_unit, 200);
    assert.equal(created.manufacturer_code, "");
    assert.equal(
      db.prepare("SELECT count(*) n FROM stock_movements").get()!.n,
      1,
    );
    assert.equal(
      (await previewStockInvoice(db, ctx, file)).already_imported,
      true,
    );
  } finally {
    db.close();
  }
});
test("pack conversion is learned, fractional units require confirmation and GTIN crosses suppliers", async () => {
  const db = fixture();
  try {
    const file = xml(1, "1.0000", "BOX", "7891234567895");
    await importStockInvoice(db, ctx, file, [{ ...choice, quantity: 12 }]);
    const next = await previewStockInvoice(
      db,
      ctx,
      xml(2, "2.0000", "BOX", "7891234567895"),
    );
    assert.equal(next.items[0].quantity_in_stock, 24);
    const gtin = await previewStockInvoice(
      db,
      ctx,
      xml(3, "2.0000", "DIFFERENT", "7891234567895"),
    );
    assert.equal(gtin.items[0].catalog_id, "p");
    assert.equal(gtin.items[0].match, "barcode");
    const fractional = await previewStockInvoice(
      db,
      ctx,
      xml(4, "0.5000", "HALF"),
    );
    assert.equal(fractional.items[0].quantity_in_stock, 0);
    await assert.rejects(
      importStockInvoice(db, ctx, xml(4), [{ ...choice, quantity: 0.5 }]),
    );
  } finally {
    db.close();
  }
});
test("foreign products, operators and wrong recipients are blocked; failed import rolls back", async () => {
  const db = fixture();
  try {
    await assert.rejects(
      importStockInvoice(db, ctx, xml(), [
        { ...choice, catalog_id: "foreign" },
      ]),
      /oficina/,
    );
    await assert.rejects(
      previewStockInvoice(db, { ...ctx, role: "operator" }, xml()),
    );
    await assert.rejects(
      importStockInvoice(db, ctx, xml(), [
        { line: "1", quantity: 2, category: "Inexistente" },
      ]),
      /categoria/,
    );
    assert.equal(
      db.prepare("SELECT count(*) n FROM stock_invoices").get()!.n,
      0,
    );
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE id='p'").get()!.stock,
      5,
    );
    db.prepare(
      "UPDATE tenants SET document='11.111.111/0001-11' WHERE id='a'",
    ).run();
    await assert.rejects(
      previewStockInvoice(db, ctx, xml()),
      /CNPJ da oficina/,
    );
  } finally {
    db.close();
  }
});
test("repeated invoice lines are grouped; conflicting supplier codes rejected", () => {
  const file = xml();
  const first = file.match(/<det .*?<\/det>/)![0];
  const repeated = file.replace(
    "</infNFe>",
    first.replace('nItem="1"', 'nItem="2"') + "</infNFe>",
  );
  const items = parseStockInvoice(repeated).items;
  assert.equal(items.length, 1);
  assert.equal(items[0].quantity, 4);
  assert.equal(items[0].totalCost, 10000);
  assert.deepEqual(items[0].lines, ["1", "2"]);
  assert.throws(
    () =>
      parseStockInvoice(
        repeated.replace(
          /nItem="2">([\s\S]*?)Filtro de óleo/,
          'nItem="2">$1Outra peça',
        ),
      ),
    /mesmo código/,
  );
});
test("Postgres qualifies invoice tables and preview endpoint accepts authorized XML", async () => {
  assert.match(
    postgresSql("SELECT * FROM stock_invoices WHERE tenant_id=?"),
    /horse_power.stock_invoices.*\$1/,
  );
  assert.match(
    postgresSql("INSERT INTO stock_invoice_products(id) VALUES(?)"),
    /horse_power.stock_invoice_products/,
  );
  const db = fixture(),
    server = createApp(db).listen(0);
  try {
    db.prepare(
      "INSERT INTO sessions(token_hash,user_id,tenant_id,expires_at) VALUES(?,?,?,?)",
    ).run(digest("token"), "u", "a", Date.now() + 60000);
    const address = server.address() as { port: number },
      base = "http://127.0.0.1:" + address.port;
    const unauthorized = await fetch(base + "/api/stock-invoices/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xml: xml() }),
    });
    assert.equal(unauthorized.status, 401);
    const result = await fetch(base + "/api/stock-invoices/preview", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "hp_session=token",
      },
      body: JSON.stringify({
        xml: xml().replace(
          "</nfeProc>",
          "<!--" + "x".repeat(300000) + "--></nfeProc>",
        ),
      }),
    });
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal((await result.json()).items.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
