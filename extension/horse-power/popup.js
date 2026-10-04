async function send(type) {
  const r = await chrome.runtime.sendMessage({ type });
  if (!r?.ok) throw new Error(r?.error || "Falha na extensão.");
  return r;
}
async function load() {
  const s = await send("HP_STATUS");
  const vehicle = await send("HP_VEHICLE");
  document.getElementById("plate").textContent = vehicle.connected
    ? vehicle.plate
      ? "Placa do orçamento: " + vehicle.plate
      : "Este orçamento ainda não tem uma placa válida."
    : "";
  document.getElementById("tempario").disabled = !vehicle.connected;
  document.getElementById("status").textContent =
    (s.connected
      ? "Conectado ao orçamento #" + s.number
      : "Abra um orçamento e clique em Adicionar produto ou Adicionar serviço.") +
    " · " +
    s.pending +
    " envio(s) pendente(s)";
}
for (const [id, type] of [
  ["open", "HP_OPEN"],
  ["tempario", "HP_OPEN_TEMPARIO"],
  ["retry", "HP_RETRY"],
  ["clear", "HP_CLEAR_PENDING"],
])
  document.getElementById(id).onclick = async () => {
    try {
      if (
        id === "clear" &&
        !confirm("Descartar os itens que ainda não foram enviados?")
      )
        return;
      document.getElementById("error").textContent = "";
      await send(type);
      await load();
    } catch (e) {
      document.getElementById("error").textContent = e.message;
    }
  };
load().catch((e) => (document.getElementById("error").textContent = e.message));
