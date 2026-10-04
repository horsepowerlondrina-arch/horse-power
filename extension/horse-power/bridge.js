(() => {
  const types = new Set([
    "HP_CONNECT",
    "HP_STATUS",
    "HP_SET_FREIGHT",
    "HP_DISCONNECT",
  ]);
  window.addEventListener("message", async (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.channel !== "horse-power-web" ||
      !types.has(event.data?.type)
    )
      return;
    const { requestId, type, target, orderId, freight_total } = event.data;
    if (typeof requestId !== "string") return;
    try {
      const result = await chrome.runtime.sendMessage({
        type,
        target,
        orderId,
        freight_total,
      });
      window.postMessage(
        { channel: "horse-power-extension", requestId, result },
        location.origin,
      );
    } catch {
      window.postMessage(
        {
          channel: "horse-power-extension",
          requestId,
          result: {
            ok: false,
            error: "Recarregue a página após instalar ou atualizar a extensão.",
          },
        },
        location.origin,
      );
    }
  });
})();
