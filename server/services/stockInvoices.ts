import { createHash } from "node:crypto";
import { z } from "zod";
import { transaction, type DB } from "../db/database.js";
import type { Context } from "../auth/session.js";
import {
  parseStockInvoice,
  type StockInvoice,
} from "../domain/stockInvoice.js";
import { requireAdmin } from "./payments.js";
import { id, scoped, audit } from "./workshop.js";
import { workshopPrice, getPartsPricing } from "./partsPricing.js";
import { salePrice } from "../../shared/pricing.js";
import { validProductCategory } from "./productCategories.js";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const choiceSchema = z.object({
  line: z.string().min(1).max(1000),
  catalog_id: z.string().max(100).default(""),
  quantity: z.number().int().min(1).max(1000000),
  name: z.string().trim().min(1).max(300).optional(),
  category: z.string().trim().max(100).default(""),
  cost: z.number().int().min(0).max(100000000).optional(),
  price: z.number().int().min(0).max(100000000).optional(),
});
export const stockInvoiceChoices = z.array(choiceSchema).min(1).max(500);
async function checkedInvoice(
  db: DB,
  ctx: Context,
  xml: string,
): Promise<StockInvoice> {
  requireAdmin(ctx);
  const invoice = parseStockInvoice(xml);
  const tenant = await db
    .prepare("SELECT document FROM tenants WHERE id=?")
    .get(ctx.tenantId);
  const document = String(tenant?.document || "").replace(/\D/g, "");
  if (document.length === 14 && invoice.recipient !== document)
    throw new Error("Esta nota não foi emitida para o CNPJ da oficina.");
  return invoice;
}
export async function previewStockInvoice(db: DB, ctx: Context, xml: string) {
  const invoice = await checkedInvoice(db, ctx, xml);
  const old = await db
    .prepare(
      "SELECT summary FROM stock_invoices WHERE tenant_id=? AND invoice_key=?",
    )
    .get(ctx.tenantId, invoice.key);
  const catalog = await db
    .prepare(
      "SELECT * FROM catalog WHERE tenant_id=? AND kind='product' AND active=1 AND archived_at IS NULL AND merged_into IS NULL",
    )
    .all(ctx.tenantId);
  const links = await db
    .prepare("SELECT * FROM stock_invoice_products WHERE tenant_id=?")
    .all(ctx.tenantId);
  const available = new Set(catalog.map((p) => p.id));
  const pricing = await getPartsPricing(db, ctx.tenantId);
  const items = invoice.items.map((item) => {
    const exact = links.find(
      (l) =>
        l.supplier_document === invoice.document &&
        l.supplier_code === item.code &&
        l.unit === item.unit &&
        available.has(l.catalog_id) &&
        (!item.gtin || !l.gtin || item.gtin === l.gtin),
    );
    const barcodes = item.gtin
      ? [
          ...new Set(
            links
              .filter(
                (l) => l.gtin === item.gtin && available.has(l.catalog_id),
              )
              .map((l) => l.catalog_id),
          ),
        ]
      : [];
    const matched =
      exact?.catalog_id || (barcodes.length === 1 ? barcodes[0] : "");
    const candidates = catalog
      .filter(
        (p) =>
          String(p.sku).toLowerCase() === item.code.toLowerCase() ||
          String(p.manufacturer_code).toLowerCase() ===
            item.code.toLowerCase() ||
          String(p.name).toLowerCase() === item.name.toLowerCase(),
      )
      .map((p) => p.id);
    const amount = item.quantity * (exact?.quantity_factor || 1);
    const quantity =
      Math.abs(amount - Math.round(amount)) < 0.000001 && amount <= 1000000
        ? Math.round(amount)
        : 0;
    const cost = quantity ? Math.round(item.totalCost / quantity) : 0;
    return {
      ...item,
      line: item.lines.join(","),
      catalog_id: matched,
      candidates,
      quantity_in_stock: quantity,
      cost,
      price: salePrice(cost, pricing),
      match: exact
        ? "supplier"
        : matched
          ? "barcode"
          : candidates.length || barcodes.length > 1
            ? "review"
            : "new",
    };
  });
  return {
    ...invoice,
    items,
    already_imported: !!old,
    summary: old ? JSON.parse(old.summary) : null,
  };
}
export async function importStockInvoice(
  db: DB,
  ctx: Context,
  xml: string,
  input: unknown,
) {
  const invoice = await checkedInvoice(db, ctx, xml),
    choices = stockInvoiceChoices.parse(input);
  if (
    choices.length !== invoice.items.length ||
    new Set(choices.map((c) => c.line)).size !== choices.length ||
    choices.some(
      (c) => !invoice.items.some((i) => i.lines.join(",") === c.line),
    )
  )
    throw new Error("Confira todos os itens da nota antes de confirmar.");
  return transaction(db, async () => {
    const old = await db
      .prepare(
        "SELECT summary,xml_hash FROM stock_invoices WHERE tenant_id=? AND invoice_key=?",
      )
      .get(ctx.tenantId, invoice.key);
    if (old) {
      if (old.xml_hash !== hash(xml))
        throw new Error(
          "A chave desta nota já foi importada. Consulte as movimentações.",
        );
      return { ...JSON.parse(old.summary), duplicate: true };
    }
    let created = 0,
      updated = 0,
      quantityTotal = 0;
    const movements: {
      catalog_id: string;
      quantity: number;
      movement_id: string;
    }[] = [];
    const existingCosts = new Map<
      string,
      { total: number; freight: number; quantity: number }
    >();
    const pricing = await getPartsPricing(db, ctx.tenantId);
    for (const item of invoice.items) {
      const choice = choices.find((c) => c.line === item.lines.join(","))!;
      let catalogId = choice.catalog_id;
      const invoiceCost = Math.round(item.totalCost / choice.quantity);
      const cost = catalogId ? invoiceCost : (choice.cost ?? invoiceCost);
      const freight = Math.round(item.freight / choice.quantity);
      if (!Number.isSafeInteger(cost) || cost > 100000000)
        throw new Error("Custo unitário fora do limite.");
      if (catalogId) {
        const product = await scoped(db, "catalog", ctx.tenantId, catalogId);
        if (
          product.kind !== "product" ||
          !product.active ||
          product.archived_at ||
          product.merged_into
        )
          throw new Error("Escolha um produto ativo para receber o estoque.");
        if (product.stock + choice.quantity > 100000000)
          throw new Error("Saldo do produto fora do limite.");
        await db
          .prepare(
            "UPDATE catalog SET stock=stock+?,stock_verified=1 WHERE tenant_id=? AND id=?",
          )
          .run(choice.quantity, ctx.tenantId, catalogId);
        const accumulated = existingCosts.get(catalogId) || {
          total: 0,
          freight: 0,
          quantity: 0,
        };
        accumulated.total += item.totalCost;
        accumulated.freight += item.freight;
        accumulated.quantity += choice.quantity;
        existingCosts.set(catalogId, accumulated);
        updated++;
      } else {
        catalogId = id();
        const category = await validProductCategory(db, ctx, choice.category);
        await db
          .prepare(
            "INSERT INTO catalog(id,tenant_id,kind,name,sku,category,cost,price,stock,stock_verified,cost_known,freight_unit,category_confirmed) VALUES(?,?,'product',?,?,?,?,?,?,1,1,?,?)",
          )
          .run(
            catalogId,
            ctx.tenantId,
            choice.name || item.name,
            "HP-" + catalogId,
            category,
            cost,
            choice.price ?? (await workshopPrice(db, ctx.tenantId, cost)),
            choice.quantity,
            Math.min(freight, cost),
            category ? 1 : 0,
          );
        created++;
      }
      const link = await db
        .prepare(
          "SELECT id FROM stock_invoice_products WHERE tenant_id=? AND supplier_document=? AND supplier_code=? AND unit=?",
        )
        .get(ctx.tenantId, invoice.document, item.code, item.unit);
      if (link)
        await db
          .prepare(
            "UPDATE stock_invoice_products SET catalog_id=?,gtin=?,quantity_factor=? WHERE tenant_id=? AND id=?",
          )
          .run(
            catalogId,
            item.gtin,
            choice.quantity / item.quantity,
            ctx.tenantId,
            link.id,
          );
      else
        await db
          .prepare(
            "INSERT INTO stock_invoice_products(id,tenant_id,supplier_document,supplier_code,unit,gtin,catalog_id,quantity_factor) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            id(),
            ctx.tenantId,
            invoice.document,
            item.code,
            item.unit,
            item.gtin,
            catalogId,
            choice.quantity / item.quantity,
          );
      const movement = id();
      await db
        .prepare(
          "INSERT INTO stock_movements(id,tenant_id,catalog_id,quantity,reason,user_id,unit_cost,freight_unit,unit_price) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          movement,
          ctx.tenantId,
          catalogId,
          choice.quantity,
          (
            "NF-e " +
            invoice.number +
            " · " +
            invoice.supplier +
            " · " +
            item.code
          ).slice(0, 200),
          ctx.userId,
          invoiceCost,
          freight,
          salePrice(invoiceCost, pricing),
        );
      quantityTotal += choice.quantity;
      movements.push({
        catalog_id: catalogId,
        quantity: choice.quantity,
        movement_id: movement,
      });
    }
    // Use the purchase cost of this invoice, not the old stock average.
    // Different supplier codes mapped to one product share a quantity-weighted invoice cost.
    for (const [catalogId, values] of existingCosts) {
      const cost = Math.round(values.total / values.quantity);
      await db
        .prepare(
          "UPDATE catalog SET cost=?,price=?,freight_unit=?,cost_known=1 WHERE tenant_id=? AND id=?",
        )
        .run(
          cost,
          salePrice(cost, pricing),
          Math.round(values.freight / values.quantity),
          ctx.tenantId,
          catalogId,
        );
    }
    const record = id(),
      summary = {
        id: record,
        created,
        updated,
        quantity: quantityTotal,
        movements,
        number: invoice.number,
        supplier: invoice.supplier,
      };
    await db
      .prepare(
        "INSERT INTO stock_invoices(id,tenant_id,invoice_key,supplier_document,supplier_name,invoice_number,issued_on,xml_hash,summary,user_id) VALUES(?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        record,
        ctx.tenantId,
        invoice.key,
        invoice.document,
        invoice.supplier,
        invoice.number,
        invoice.issuedOn,
        hash(xml),
        JSON.stringify(summary),
        ctx.userId,
      );
    await audit(db, ctx, "stock_invoice.imported", record);
    return { ...summary, duplicate: false };
  });
}
