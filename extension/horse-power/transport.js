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
    ? response.label || `OS #${response.number}`
    : "Conecte uma OS na Horse Power";
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
  panel.classList.add("hp-minimized");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "hp-panel-toggle";
  const render = () => {
    const minimized = panel.classList.contains("hp-minimized");
    toggle.innerHTML = minimized
      ? '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    toggle.title = minimized ? "Restaurar painel Horse Power" : "Minimizar painel Horse Power";
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
