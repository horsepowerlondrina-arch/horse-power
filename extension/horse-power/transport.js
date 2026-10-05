window.hpSendCapture = async (item) => {
  const response = await chrome.runtime.sendMessage({
    type: "HP_CAPTURE",
    item,
  });
  if (!response?.ok)
    throw new Error(response?.error || "Não foi possível enviar.");
  return response;
};
window.hpCaptureInfo = async () => {
  const response = await chrome.runtime.sendMessage({ type: "HP_STATUS" });
  if (!response?.ok)
    throw new Error(response?.error || "Não foi possível ler a conexão.");
  return response;
};
window.hpCaptureStatus = async () => {
  const response = await window.hpCaptureInfo();
  return response.connected
    ? response.label || `Atendimento #${response.number}`
    : "Conecte um orçamento na Horse Power";
};
window.hpSetFreight = async (freightTotal) => {
  const response = await chrome.runtime.sendMessage({
    type: "HP_SET_FREIGHT",
    freight_total: freightTotal,
  });
  if (!response?.ok)
    throw new Error(response?.error || "Não foi possível atualizar o frete.");
  return response;
};
window.hpOpenQuote = () => chrome.runtime.sendMessage({ type: "HP_OPEN" });

window.hpMinimizePanel = (panel) => {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hp-panel-toggle";
  const render = () => {
    const minimized = panel.classList.contains("hp-minimized");
    toggle.textContent = minimized ? "Restaurar" : "Minimizar";
    toggle.setAttribute("aria-label", minimized ? "Restaurar painel Horse Power" : "Minimizar painel Horse Power");
    toggle.setAttribute("aria-expanded", String(!minimized));
  };
  toggle.onclick = () => {
    panel.classList.toggle("hp-minimized");
    render();
  };
  render();
  panel.appendChild(toggle);
};
