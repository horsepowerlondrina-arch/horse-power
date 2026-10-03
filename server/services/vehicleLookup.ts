import { fipePlacaToken, lookupFipePlaca } from "./fipePlaca";
import type { DB } from "../db/database";
import { z } from "zod";
export const normalizePlate = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "");
export function providerToken(tenant: string) {
  const current = fipePlacaToken(tenant);
  if (current) return current;
  try {
    const entries = JSON.parse(process.env.PLACA_FIPE_TOKENS_JSON || "{}");
    return typeof entries[tenant] === "string" ? entries[tenant] : null;
  } catch {
    return null;
  }
}
const responseSchema = z.object({
  codigo: z.number(),
  informacoes_veiculo: z
    .object({
      marca: z.string().max(150),
      modelo: z.string().max(150),
      ano: z.union([z.string(), z.number()]).optional(),
      ano_modelo: z.union([z.string(), z.number()]).optional(),
      cor: z.string().max(80).optional(),
    })
    .optional(),
});
export async function lookupVehicle(
  db: DB,
  tenant: string,
  rawPlate: string,
  fetcher: typeof fetch = fetch,
): Promise<{
  source: string;
  vehicle: Record<string, unknown> | null;
  message: string;
}> {
  const plate = normalizePlate(rawPlate);
  if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate))
    throw new Error("Informe uma placa válida.");
  const local = await db
    .prepare(
      "SELECT id,customer_id,plate,brand,model,year,color,km,chassis,active FROM vehicles WHERE tenant_id=? AND plate=?",
    )
    .get(tenant, plate);
  if (local)
    return {
      source: "local",
      vehicle: local,
      message: "Veículo encontrado no cadastro desta oficina.",
    };
  const token = providerToken(tenant);
  if (!token)
    return {
      source: "unavailable",
      vehicle: null,
      message:
        "Placa não cadastrada. A consulta externa ainda não foi ativada para esta oficina; preencha os dados manualmente.",
    };
  const currentToken = fipePlacaToken(tenant);
  if (currentToken) return lookupFipePlaca(plate, currentToken, fetcher);
  try {
    const response = await fetcher("https://api.placafipe.com.br/getplaca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ placa: plate, token }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("provider");
    const result = responseSchema.parse(await response.json());
    if (result.codigo !== 1 || !result.informacoes_veiculo)
      return {
        source: "not_found",
        vehicle: null,
        message:
          "Placa não localizada pelo provedor. Confira a placa ou preencha os dados.",
      };
    const v = result.informacoes_veiculo;
    const year = Number(v.ano_modelo || v.ano);
    return {
      source: "external",
      vehicle: {
        plate,
        brand: v.marca,
        model: v.modelo,
        year:
          Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
        color: v.cor || "",
      },
      message: "Dados consultados via Placa FIPE. Confira antes de salvar.",
    };
  } catch {
    throw Object.assign(
      new Error(
        "A consulta externa não respondeu. Tente novamente ou preencha os dados manualmente.",
      ),
      { status: 502 },
    );
  }
}
