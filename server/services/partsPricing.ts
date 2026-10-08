import { z } from "zod";
import { salePrice } from "../../shared/pricing.js";
import type { DB } from "../db/database.js";
export const defaultRules = [
  { up_to: 2000, markup_bps: 8000, minimum_profit: 800 },
  { up_to: 5000, markup_bps: 6000, minimum_profit: 1000 },
  { up_to: 10000, markup_bps: 5000, minimum_profit: 2000 },
  { up_to: 25000, markup_bps: 4500, minimum_profit: 0 },
  { up_to: 50000, markup_bps: 4000, minimum_profit: 0 },
  { up_to: 100000, markup_bps: 3500, minimum_profit: 0 },
  { up_to: null, markup_bps: 3000, minimum_profit: 0 },
];
const rulesSchema = z
  .array(
    z.object({
      up_to: z.number().int().min(1).max(100000000).nullable(),
      markup_bps: z.number().int().min(0).max(100000),
      minimum_profit: z.number().int().min(0).max(100000000),
    }),
  )
  .min(1)
  .max(20)
  .refine(
    (r) =>
      r.every((v, i) =>
        i === r.length - 1
          ? v.up_to === null
          : v.up_to !== null && v.up_to > (i ? r[i - 1].up_to! : 0),
      ),
    "As faixas devem ser crescentes e a última sem limite.",
  );
export const partsPricingSchema = z
  .object({
    mode: z.enum(["legacy", "markup", "margin"]).default("legacy"),
    rate_bps: z.number().int().min(0).max(100000).default(4000),
    rules: rulesSchema.default(defaultRules),
    service_markup_bps: z.number().int().min(0).max(100000).optional(),
  })
  .refine(
    (v) => v.mode !== "margin" || v.rate_bps < 10000,
    "A margem sobre a venda deve ser menor que 100%.",
  );
export function legacyPrice(cost: number, rules = defaultRules) {
  const rule = rules.find((r) => r.up_to === null || cost <= r.up_to)!;
  return Math.max(
    Math.round((cost * (10000 + rule.markup_bps)) / 10000),
    cost + rule.minimum_profit,
  );
}
export function priceFromCost(
  cost: number,
  mode: string,
  rate: number,
  rules = defaultRules,
) {
  return salePrice(cost, {
    mode: mode as "legacy" | "markup" | "margin",
    rate_bps: rate,
    rules,
  });
}
export async function getPartsPricing(db: DB, tenant: string) {
  const r = await db
    .prepare(
      "SELECT parts_pricing_mode mode,parts_pricing_bps rate_bps,parts_pricing_rules FROM tenants WHERE id=?",
    )
    .get(tenant);
  // Existing installations store a plain array; newer policies also store service markup.
  const stored = r?.parts_pricing_rules
    ? JSON.parse(r.parts_pricing_rules)
    : defaultRules;
  return partsPricingSchema.parse({
    ...r,
    rules: Array.isArray(stored) ? stored : stored.rules,
    service_markup_bps: Array.isArray(stored)
      ? 3000
      : (stored.service_markup_bps ?? 3000),
  });
}
export async function workshopPrice(db: DB, tenant: string, cost: number) {
  const s = await getPartsPricing(db, tenant);
  return priceFromCost(cost, s.mode, s.rate_bps, s.rules);
}
