import test from "node:test";
import assert from "node:assert/strict";
import { invoiceIdentity } from "../server/domain/invoiceIdentity";
import { createDatabase } from "../server/db/database";
import {
  previewStockInvoice,
  importStockInvoice,
} from "../server/services/stockInvoices";
const ctx = { tenantId: "a", userId: "u", role: "owner" };
function invoice(
  description: string,
  document = "84586205002487",
  number = 1,
  code = "60731-0",
) {
  const raw =
    "412610" +
    document +
    "55" +
    "001" +
    String(number).padStart(9, "0") +
    "1" +
    "12345678";
  let sum = 0;
  for (let i = 42, w = 2; i >= 0; i--, w = w === 9 ? 2 : w + 1)
    sum += Number(raw[i]) * w;
  const check = 11 - (sum % 11),
    key = raw + (check >= 10 ? 0 : check);
  return `<nfeProc><NFe><infNFe Id="NFe${key}"><ide><mod>55</mod><nNF>${number}</nNF><tpAmb>1</tpAmb><tpNF>1</tpNF><dhEmi>2026-10-11</dhEmi></ide><emit><CNPJ>${document}</CNPJ><xNome>Fornecedor</xNome></emit><det nItem="1"><prod><cProd>${code}</cProd><cEAN>SEM GTIN</cEAN><xProd>${description}</xProd><uCom>UN</uCom><qCom>1.0000</qCom><vProd>50.00</vProd></prod></det></infNFe></NFe><protNFe><infProt><chNFe>${key}</chNFe><tpAmb>1</tpAmb><cStat>100</cStat></infProt></protNFe></nfeProc>`;
}
function fixture() {
  const db = createDatabase(":memory:");
  db.exec(
    "INSERT INTO tenants(id,name) VALUES('a','A'); INSERT INTO users VALUES('u','U','u@example.test','disabled'); INSERT INTO memberships VALUES('u','a','owner'); INSERT INTO catalog(id,tenant_id,kind,name,sku,cost,price,brand,manufacturer_code) VALUES('p','a','product','Kit correia','SKY-1',1000,2000,'Gates','KS-303'),('other','a','product','Kit correia','SKY-2',1000,2000,'Outra','KS303')",
  );
  return db;
}
test("Scherer separates observed brands, manufacturer references, descriptions, applications and supplier codes", () => {
  const a = invoiceIdentity(
    "84586205002487",
    "GATES KS303 - KIT CORREIA DENTADA E TENSOR FIAT PALIO 1.8 8V 2012 STILO 1.8 - 60731",
    "60731-0",
  );
  assert.deepEqual(a, {
    name: "KIT CORREIA DENTADA E TENSOR",
    brand: "GATES",
    manufacturer_code: "KS303",
    application: "FIAT PALIO 1.8 8V 2012 STILO 1.8",
  });
  const cases = [
    [
      "ELRING 365340 - JOGO JUNTA SUPERIOR MOTOR GM ONIX 1.0 8V 2012 PRI",
      "136469-0",
      "ELRING",
      "365340",
      "JOGO JUNTA SUPERIOR MOTOR",
    ],
    [
      "METAL LEVE VE0141576 STD = VE0141576 - VALVULA ESCAPE MOTOR GM 1.0L 8V ONIX 2012 - 67751",
      "67751-0",
      "METAL LEVE",
      "VE0141576",
      "VALVULA ESCAPE MOTOR",
    ],
    [
      "TARANTO B242200 JG - JOGO PARAFUSO CABECOTE FIAT DOBLO 1.8 8V 2004 PALIO 1.8 8V 20 - 54945",
      "54945-0",
      "TARANTO",
      "B242200",
      "JOGO PARAFUSO CABECOTE",
    ],
    [
      "ELRING 702269 - RETENTOR COMANDO VALVULA GM AGILE 1.4 8V 2006 SAT",
      "137337-0",
      "ELRING",
      "702269",
      "RETENTOR COMANDO VALVULA",
    ],
    [
      "ELRING 403730 - RETENTOR HASTE VALVULA ADMISAO ESCAPE AUDI A1 1.4",
      "135146-0",
      "ELRING",
      "403730",
      "RETENTOR HASTE VALVULA ADMISAO ESCAPE",
    ],
    [
      "SCHADEK 20189 = 90000822 = 90000523 - BOMBA DAGUA GM AGILE 1.4 20102014",
      "103491-0",
      "SCHADEK",
      "20189",
      "BOMBA DAGUA",
    ],
    [
      "TECFIL PSL619 - FILTRO OLEO LUBRIFICANTE FIAT DOBLO 1.8 8V 20032010",
      "16725-0",
      "TECFIL",
      "PSL619",
      "FILTRO OLEO LUBRIFICANTE",
    ],
    [
      "MAHLE TI 335 92D - VALVULA TERMOSTATICA COM CARCACA GM AGILE 1.4 8V 20092015 - 142836",
      "142836-0",
      "MAHLE",
      "TI 335 92D",
      "VALVULA TERMOSTATICA COM CARCACA",
    ],
    [
      "RIOSUL 520530401 - COMANDO VALVULA GM ONIX 1.0 8V FLEX 2013 - 137908",
      "137908-0",
      "RIOSUL",
      "520530401",
      "COMANDO VALVULA",
    ],
    [
      "INA 4220136100 BALANCIM - BALANCIM ROLETADO FIAT DOBLO IDEA PALIO PUNTO SIENA STILO STRADA 62630",
      "62630-0",
      "INA",
      "4220136100",
      "BALANCIM ROLETADO",
    ],
    [
      "INA 4200100100A1 TUCHO - TUCHO VALVULA MOTOR FIAT DOBLO 1.8 8V 2006 - 104762",
      "104762-0",
      "INA",
      "4200100100A1",
      "TUCHO VALVULA MOTOR",
    ],
  ];
  for (const [raw, supplier, brand, code, name] of cases) {
    const p = invoiceIdentity("84586205002487", raw, supplier);
    assert.equal(p.brand, brand);
    assert.equal(p.manufacturer_code, code);
    assert.equal(p.name, name);
  }
});
test("Fortlub splits leading reference and trailing brand without treating hyphenated brand as a separator", () => {
  const cases = [
    ["A27-ABRACADEIRA - METALMATRIX", "A27", "ABRACADEIRA", "METALMATRIX"],
    ["A38-ABRACADEIRA - METALMATRIX", "A38", "ABRACADEIRA", "METALMATRIX"],
    ["A44-ABRACADEIRA - METALMATRIX", "A44", "ABRACADEIRA", "METALMATRIX"],
    ["A57-ABRACADEIRA - METALMATRIX", "A57", "ABRACADEIRA", "METALMATRIX"],
    [
      "CAR80CONTATO12-LIMPA CONTATO ELETRICO SPRAY 300ML - SNAP-ON",
      "CAR80CONTATO12",
      "LIMPA CONTATO ELETRICO SPRAY 300ML",
      "SNAP-ON",
    ],
    [
      "CAR8098-SILICONE NEUTRO BLACK BISNAGA 85-GR - SNAP-ON",
      "CAR8098",
      "SILICONE NEUTRO BLACK BISNAGA 85-GR",
      "SNAP-ON",
    ],
    [
      "7979-LOCTITE SF 7979 POWER CLEAN AUTO80 PRO - LOCTITE",
      "7979",
      "LOCTITE SF 7979 POWER CLEAN AUTO80 PRO",
      "LOCTITE",
    ],
  ];
  for (const [raw, code, name, brand] of cases)
    assert.deepEqual(invoiceIdentity("55847057000970", raw, "FORNECEDOR"), {
      name,
      brand,
      manufacturer_code: code,
      application: "",
    });
});
test("RTL and unknown formats never fabricate a manufacturer brand or reference from the supplier code", () => {
  assert.deepEqual(
    invoiceIdentity("04078311000124", "GUIA VALVULA GM", "11542040"),
    {
      name: "GUIA VALVULA",
      brand: "",
      manufacturer_code: "",
      application: "GM",
    },
  );
  assert.deepEqual(
    invoiceIdentity("00000000000000", "Marca 123 - Descrição", "123"),
    {
      name: "Marca 123 - Descrição",
      brand: "",
      manufacturer_code: "",
      application: "",
    },
  );
  assert.equal(
    invoiceIdentity("84586205002487", "NOVA MARCA ABC - PECA", "100-0").brand,
    "",
  );
});
test("brand and manufacturer reference reuse an existing Sky product, keep different brands distinct, and require review if ambiguous", async () => {
  const db = fixture();
  try {
    const file = invoice(
      "GATES KS303 - KIT CORREIA DENTADA E TENSOR FIAT PALIO - 60731",
    );
    const preview = await previewStockInvoice(db, ctx, file);
    assert.equal(preview.items[0].catalog_id, "p");
    assert.equal(preview.items[0].match, "reference");
    await importStockInvoice(db, ctx, file, [
      { line: "1", catalog_id: "p", quantity: 1 },
    ]);
    assert.equal(db.prepare("SELECT count(*) n FROM catalog").get()!.n, 2);
    assert.equal(
      db.prepare("SELECT stock FROM catalog WHERE id='other'").get()!.stock,
      0,
    );
    db.exec(
      "INSERT INTO catalog(id,tenant_id,kind,name,sku,cost,price,brand,manufacturer_code) VALUES('ambiguous','a','product','Kit','DUP',1000,2000,'GATES','KS303')",
    );
    const ambiguous = await previewStockInvoice(
      db,
      ctx,
      invoice("GATES KS303 - KIT CORREIA", "84586205002487", 2, "NEW"),
    );
    assert.equal(ambiguous.items[0].catalog_id, "");
    assert.equal(ambiguous.items[0].match, "review");
  } finally {
    db.close();
  }
});
test("new products persist separated fields, allow corrections and retain supplier code only in its mapping", async () => {
  const db = fixture();
  try {
    await importStockInvoice(
      db,
      ctx,
      invoice("A27-ABRACADEIRA - METALMATRIX", "55847057000970", 1, "132056P"),
      [{ line: "1", quantity: 1 }],
    );
    const p = db
      .prepare("SELECT * FROM catalog WHERE manufacturer_code='A27'")
      .get()!;
    assert.equal(p.name, "ABRACADEIRA");
    assert.equal(p.brand, "METALMATRIX");
    assert.notEqual(p.manufacturer_code, "132056P");
    await importStockInvoice(
      db,
      ctx,
      invoice("GUIA VALVULA GM", "04078311000124", 2, "11542040"),
      [
        {
          line: "1",
          quantity: 1,
          brand: "Marca confirmada",
          manufacturer_code: "REF-1",
          name: "Guia de válvula",
          application: "GM",
        },
      ],
    );
    const r = db
      .prepare("SELECT * FROM catalog WHERE manufacturer_code='REF-1'")
      .get()!;
    assert.equal(r.name, "Guia de válvula");
    assert.equal(r.application, "GM");
  } finally {
    db.close();
  }
});

test("Embrepar preserves manufacturer reference leading zeroes and separates the supplier SKU", () => {
  assert.deepEqual(
    invoiceIdentity(
      "12049403001933",
      "010101022-SUPER SAE 20W50 API SL MINERAL 1-LITRO - MENZOIL",
      "526185K",
    ),
    {
      name: "SUPER SAE 20W50 API SL MINERAL 1-LITRO",
      brand: "MENZOIL",
      manufacturer_code: "010101022",
      application: "",
    },
  );
});
