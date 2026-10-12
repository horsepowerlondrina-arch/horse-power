import { XMLParser, XMLValidator } from "fast-xml-parser";
export const XML_LIMIT = 2 * 1024 * 1024;
export type InvoiceLine = {
  code: string;
  name: string;
  gtin: string;
  unit: string;
  quantity: number;
  totalCost: number;
  freight: number;
  lines: string[];
};
export type StockInvoice = {
  key: string;
  number: string;
  supplier: string;
  supplierData: { name: string; trade_name: string; document: string; phone: string; email: string; address: string; number: string; complement: string; district: string; city: string; state: string; postal_code: string; seller: string; notes: string };
  document: string;
  recipient: string;
  issuedOn: string;
  items: InvoiceLine[];
};
function fail(message: string): never {
  throw new Error(message);
}
function one(value: any, label: string): any {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail("XML inválido: " + label + ".");
  return value;
}
function text(value: unknown, max = 300): string {
  if (value == null) return "";
  if (typeof value !== "string") fail("Campo inválido no XML.");
  const decoded = value
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
      (_, entity: string) => {
        const named: Record<string, string> = {
          amp: "&",
          lt: "<",
          gt: ">",
          quot: '"',
          apos: "'",
        };
        if (named[entity]) return named[entity];
        const n =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : Number(entity.slice(1));
        if (
          !Number.isInteger(n) ||
          n < 32 ||
          n > 0x10ffff ||
          (n >= 0xd800 && n <= 0xdfff)
        )
          fail("Entidade inválida no XML.");
        return String.fromCodePoint(n);
      },
    )
    .trim();
  if (decoded.length > max) fail("Campo do XML excede o tamanho permitido.");
  return decoded;
}
function decimal(value: unknown, places: number, required = false): number {
  if (value == null && !required) return 0;
  const s = text(value, 40);
  if (!new RegExp("^\\d+(?:\\.\\d{1," + places + "})?$").test(s))
    fail("Quantidade ou valor inválido no XML.");
  const [whole, fraction = ""] = s.split(".");
  const scaled =
    Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0"));
  if (
    !Number.isSafeInteger(scaled) ||
    scaled > 100000000 * 10 ** Math.max(0, places - 2)
  )
    fail("Valor do XML fora do limite.");
  return scaled;
}
export function validGtin(value: string): string {
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value) || /^0+$/.test(value))
    return "";
  let sum = 0;
  for (
    let i = value.length - 2, weight = 3;
    i >= 0;
    i--, weight = weight === 3 ? 1 : 3
  )
    sum += Number(value[i]) * weight;
  return (10 - (sum % 10)) % 10 === Number(value.at(-1)) ? value : "";
}
export function parseStockInvoice(xml: string): StockInvoice {
  if (typeof xml !== "string" || Buffer.byteLength(xml, "utf8") > XML_LIMIT)
    fail("Envie um XML de até 2 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    fail("XML com entidades externas não é permitido.");
  // Bound nesting before the recursive parser processes the document.
  let depth = 0;
  for (const tag of xml.matchAll(/<\/?[A-Za-z_][^>]*>/g)) {
    if (tag[0].startsWith("</")) depth--;
    else if (!tag[0].endsWith("/>")) depth++;
    if (depth > 40) fail("Estrutura do XML excede o limite.");
  }
  if (XMLValidator.validate(xml) !== true) fail("Arquivo XML inválido.");
  const parsed = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    processEntities: false,
  }).parse(xml);
  const proc = one(parsed.nfeProc, "use o XML completo da NF-e autorizada"),
    nf = one(proc.NFe, "NF-e"),
    inf = one(nf.infNFe, "dados da NF-e"),
    ide = one(inf.ide, "identificação"),
    emit = one(inf.emit, "fornecedor"),
    protocol = one(one(proc.protNFe, "protocolo").infProt, "autorização");
  const key = text(inf["@_Id"], 47).replace(/^NFe/, "");
  let sum = 0;
  for (
    let i = 42, weight = 2;
    i >= 0;
    i--, weight = weight === 9 ? 2 : weight + 1
  )
    sum += Number(key[i]) * weight;
  const check = 11 - (sum % 11);
  if (
    !/^\d{44}$/.test(key) ||
    Number(key[43]) !== (check >= 10 ? 0 : check) ||
    text(protocol.chNFe, 44) !== key
  )
    fail("Chave da NF-e inválida ou diferente do protocolo.");
  if (
    text(ide.mod) !== "55" ||
    text(ide.tpAmb) !== "1" ||
    text(protocol.tpAmb) !== "1" ||
    !["100", "150"].includes(text(protocol.cStat))
  )
    fail("Use uma NF-e autorizada em ambiente de produção.");
  const document = text(emit.CNPJ, 14);
  if (!/^\d{14}$/.test(document) || key.slice(6, 20) !== document)
    fail("CNPJ do fornecedor não corresponde à chave.");
  const number = text(ide.nNF, 9),
    issuedOn = text(ide.dhEmi || ide.dEmi, 40).slice(0, 10);
  if (
    !/^\d{1,9}$/.test(number) ||
    Number(key.slice(25, 34)) !== Number(number) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(issuedOn)
  )
    fail("Identificação ou data da NF-e inválida.");
  if (text(ide.tpNF) !== "1")
    fail(
      "Selecione uma nota de venda do fornecedor, destinada à entrada de produtos.",
    );
  const det: any[] = Array.isArray(inf.det) ? inf.det : [inf.det];
  if (!det.length || det.length > 500)
    fail("A nota deve conter de 1 a 500 itens.");
  const declaredFreight = inf.total?.ICMSTot?.vFrete;
  const freightShares = det.map((raw) =>
    decimal(one(one(raw, "item").prod, "produto").vFrete, 2),
  );
  const assignedFreight = freightShares.reduce((sum, value) => sum + value, 0);
  if (declaredFreight !== undefined) {
    const totalFreight = decimal(declaredFreight, 2);
    if (assignedFreight > totalFreight)
      fail(
        "O frete dos itens é maior que o frete total da nota. Confira o XML.",
      );
    const remaining = totalFreight - assignedFreight;
    if (remaining > 0) {
      // Retain the supplier's item allocation; allocate only the amount not allocated.
      const missing = freightShares
        .map((value, index) => ({ value, index }))
        .filter((row) => row.value === 0);
      const eligible = missing.length
        ? missing.map((row) => row.index)
        : det.map((_, index) => index);
      const weights = eligible.map((index) =>
        decimal(det[index].prod.vProd, 2, true),
      );
      const denominator = weights.reduce((sum, value) => sum + value, 0);
      const shares = eligible.map((index, i) => {
        const exact = denominator
          ? (remaining * weights[i]) / denominator
          : remaining / eligible.length;
        return {
          index,
          amount: Math.floor(exact),
          fraction: exact - Math.floor(exact),
        };
      });
      let cents = remaining - shares.reduce((sum, row) => sum + row.amount, 0);
      shares.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
      for (const share of shares) {
        freightShares[share.index] += share.amount + (cents-- > 0 ? 1 : 0);
      }
    }
  }
  const groups = new Map<string, InvoiceLine>(),
    lineNumbers = new Set<string>();
  for (const [index, raw] of det.entries()) {
    const item = one(raw, "item"),
      p = one(item.prod, "produto"),
      line = text(item["@_nItem"], 10);
    if (!/^\d+$/.test(line) || lineNumbers.has(line))
      fail("Numeração dos itens inválida.");
    lineNumbers.add(line);
    const code = text(p.cProd, 60),
      name = text(p.xProd, 300),
      unit = text(p.uCom, 20),
      gtin = validGtin(text(p.cEAN, 14));
    const quantity = decimal(p.qCom, 4, true) / 10000;
    if (!code || !name || !unit || quantity <= 0)
      fail("Produto sem código, descrição, unidade ou quantidade válida.");
    const freight = freightShares[index],
      tax = item.imposto || {};
    const icms =
      tax.ICMS &&
      (Object.values(tax.ICMS).find((v) => typeof v === "object") as any);
    const ipi = tax.IPI?.IPITrib;
    const totalCost =
      decimal(p.vProd, 2, true) -
      decimal(p.vDesc, 2) +
      freight +
      decimal(p.vSeg, 2) +
      decimal(p.vOutro, 2) +
      decimal(ipi?.vIPI, 2) +
      decimal(icms?.vICMSST, 2) +
      decimal(icms?.vFCPST, 2) +
      decimal(tax.II?.vII, 2);
    if (totalCost < 0 || totalCost > 100000000 || freight > totalCost)
      fail("Custo do produto inválido na nota.");
    const identity = JSON.stringify([code, unit, gtin, name]);
    const old = groups.get(identity);
    if (old) {
      old.quantity = Math.round((old.quantity + quantity) * 10000) / 10000;
      old.totalCost += totalCost;
      old.freight += freight;
      old.lines.push(line);
    } else
      groups.set(identity, {
        code,
        name,
        gtin,
        unit,
        quantity,
        totalCost,
        freight,
        lines: [line],
      });
  }
  // Conflicting descriptions/codes must be reviewed independently, not merged silently.
  const identities = new Set<string>();
  for (const item of groups.values()) {
    const identity = JSON.stringify([item.code, item.unit]);
    if (identities.has(identity))
      fail(
        "O mesmo código tem descrições ou códigos de barras diferentes na nota. Confira o XML com o fornecedor.",
      );
    identities.add(identity);
  }
  return {
    key,
    number,
    issuedOn,
    document,
    supplier: text(emit.xNome),
    supplierData: {
      name: text(emit.xNome, 200), trade_name: text(emit.xFant, 200), document,
      phone: text(emit.enderEmit?.fone, 40), email: "",
      address: text(emit.enderEmit?.xLgr, 200), number: text(emit.enderEmit?.nro, 30),
      complement: text(emit.enderEmit?.xCpl, 100), district: text(emit.enderEmit?.xBairro, 100),
      city: text(emit.enderEmit?.xMun, 100), state: text(emit.enderEmit?.UF, 2),
      postal_code: text(emit.enderEmit?.CEP, 12), seller: "", notes: "",
    },
    recipient: text(inf.dest?.CNPJ || inf.dest?.CPF, 14),
    items: [...groups.values()],
  };
}
