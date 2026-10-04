window.hpSendCapture = async (item) => {
  const response = await chrome.runtime.sendMessage({
    type: "HP_CAPTURE",
    item,
  });
  if (!response?.ok)
    throw new Error(response?.error || "Não foi possível enviar.");
  return response;
};
window.hpCaptureStatus = async () => {
  const response = await chrome.runtime.sendMessage({ type: "HP_STATUS" });
  return response?.connected
    ? `Orçamento #${response.number}`
    : "Conecte um orçamento na Horse Power";
};
window.hpOpenQuote = () => chrome.runtime.sendMessage({ type: "HP_OPEN" });
