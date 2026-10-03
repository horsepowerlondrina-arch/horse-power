export async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Não foi possível concluir.");
  return result;
}
export const send = (path: string, data: unknown, method = "POST") =>
  api(path, { method, body: JSON.stringify(data) });
