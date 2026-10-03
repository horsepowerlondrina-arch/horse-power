import { z } from "zod";
export function fipePlacaToken(tenant: string): string | null {
  try {
    const entries = JSON.parse(process.env.FIPEPLACA_TOKENS_JSON || "{}");
    return typeof entries?.[tenant] === "string" && entries[tenant].trim()
      ? entries[tenant].trim()
      : null;
  } catch {
    return null;
  }
}
const vehicleSchema = z.object({
  marca: z.string().max(150).nullable(),
  modelo: z.string().max(150).nullable(),
  anoFabricacao: z.number().int().nullable(),
  anoModelo: z.number().int().nullable(),
  cor: z.string().max(80).nullable(),
});
export async function lookupFipePlaca(
  plate: string,
  token: string,
  fetcher: typeof fetch,
) {
  let response: Response;
  try {
    response = await fetcher(
      `https://api.fipeplaca.com.br/gateway/v1/placa/${plate}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
  } catch {
    throw Object.assign(
      new Error(
        "A consulta FipePlaca não respondeu. Tente novamente ou preencha os dados manualmente.",
      ),
      { status: 502 },
    );
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = body?.erro?.codigo;
    if (response.status === 404 && code === "PLACA_NAO_ENCONTRADA")
      return {
        source: "not_found",
        vehicle: null,
        message:
          "Placa não localizada. Confira a placa ou preencha os dados manualmente.",
      };
    const messages: Record<string, string> = {
      SEM_SALDO:
        "Saldo FipePlaca insuficiente. Recarregue a conta do provedor ou preencha os dados manualmente.",
      CHAVE_INVALIDA:
        "A chave FipePlaca precisa ser conferida pelo administrador.",
      ERRO_401:
        "O provedor bloqueou a conexão do servidor. Entre em contato com o suporte FipePlaca.",
      ERRO_403:
        "O provedor bloqueou a conexão do servidor. Entre em contato com o suporte FipePlaca.",
      FILA_CHEIA:
        "O provedor está ocupado. Aguarde um momento antes de tentar novamente.",
    };
    throw Object.assign(
      new Error(
        messages[code] ||
          "Consulta FipePlaca indisponível. Tente novamente ou preencha os dados manualmente.",
      ),
      { status: 502 },
    );
  }
  const result = vehicleSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!result.success)
    throw Object.assign(
      new Error(
        "O provedor retornou dados em formato inesperado. Preencha os dados manualmente.",
      ),
      { status: 502 },
    );
  const v = result.data,
    year = v.anoModelo ?? v.anoFabricacao;
  return {
    source: "external",
    vehicle: {
      plate,
      ...(v.marca ? { brand: v.marca } : {}),
      ...(v.modelo ? { model: v.modelo } : {}),
      ...(year !== null && year >= 1900 && year <= 2100 ? { year } : {}),
      ...(v.cor ? { color: v.cor } : {}),
    },
    message:
      "Dados consultados via FipePlaca. Confira e complete os campos ausentes antes de salvar.",
  };
}
