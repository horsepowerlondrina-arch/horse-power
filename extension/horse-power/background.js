const appOrigins = new Set([
  "https://horse-power.vercel.app",
  "https://oficinahorsepower.com.br",
]);
const sources = {
  "https://cliente.skypecas.com.br": "sky",
  "https://sistema.tempar.io": "tempario",
};
const ready = Promise.all([
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
  chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }),
]);
let serial = Promise.resolve();
function originOf(sender) {
  try {
    return new URL(sender.url).origin;
  } catch {
    return "";
  }
}
async function deliver(entry) {
  const { target } = await chrome.storage.session.get("target");
  if (
    !target ||
    target.orderId !== entry.orderId ||
    (target.destination || "order") !== (entry.destination || "order") ||
    target.origin !== entry.origin
  )
    throw new Error(
      "Conecte novamente o destino original. O item não foi enviado.",
    );
  const response = await fetch(target.origin + "/api/extension/import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + target.token,
    },
    body: JSON.stringify(entry.item),
    credentials: "omit",
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Não foi possível enviar.");
  return body;
}
async function handle(msg, sender) {
  await ready;
  const origin = originOf(sender);
  const isApp = appOrigins.has(origin) && sender.frameId === 0;
  const isPopup = sender.url === chrome.runtime.getURL("popup.html");
  if (msg.type === "HP_CONNECT" && isApp) {
    if (
      !/^[a-f0-9]{64}$/.test(msg.target?.token) ||
      !Number.isInteger(msg.target?.number) ||
      typeof msg.target?.orderId !== "string"
    )
      throw new Error("Conexão inválida.");
    const { target: old } = await chrome.storage.session.get("target");
    if (
      old &&
      (old.orderId !== msg.target.orderId ||
        old.origin !== origin ||
        (old.destination || "order") !== (msg.target.destination || "order"))
    )
      throw new Error(
        "Encerre a conexão do outro destino antes de trocar o destino.",
      );
    const target = {
      destination: msg.target.destination === "catalog" ? "catalog" : "order",
      label:
        msg.target.destination === "catalog"
          ? "Catálogo"
          : String(
              msg.target.label || `Atendimento #${msg.target.number}`,
            ).slice(0, 100),
      token: msg.target.token,
      number: msg.target.number,
      orderId: msg.target.orderId,
      plate: /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(msg.target.plate)
        ? msg.target.plate
        : "",
      origin,
      tabId: sender.tab.id,
      connectionId: crypto.randomUUID(),
      expires: Date.now() + 1800000,
    };
    await chrome.storage.session.set({ target });
    await chrome.action.setBadgeText({
      text: target.destination === "catalog" ? "CAT" : String(target.number),
    });
    await chrome.action.setBadgeBackgroundColor({ color: "#c8202c" });
    return { ok: true, number: target.number };
  }
  if (msg.type === "HP_STATUS" && (isApp || isPopup || sources[origin])) {
    const { target } = await chrome.storage.session.get("target");
    const { pending = [] } = await chrome.storage.local.get("pending");
    return {
      ok: true,
      connected: !!target && target.expires > Date.now(),
      number: target?.number,
      pending: pending.length,
      plateAutofill: true,
      catalogCapture: true,
      label: target?.label,
    };
  }
  if (
    msg.type === "HP_VEHICLE" &&
    (isPopup || (sources[origin] === "tempario" && sender.frameId === 0))
  ) {
    const { target } = await chrome.storage.session.get("target");
    if (!target || target.expires <= Date.now())
      return { ok: true, connected: false };
    return {
      ok: true,
      connected: true,
      number: target.number,
      plate: target.plate || "",
      connectionId: target.connectionId,
      expires: target.expires,
    };
  }
  if (msg.type === "HP_OPEN_TEMPARIO" && isPopup) {
    const { target } = await chrome.storage.session.get("target");
    if (!target || target.expires <= Date.now())
      throw new Error(
        "Conecte a extensão no orçamento antes de abrir o Tempario.",
      );
    await chrome.tabs.create({ url: "https://sistema.tempar.io/" });
    return { ok: true };
  }
  if (msg.type === "HP_DISCONNECT" && (isApp || isPopup)) {
    const { target } = await chrome.storage.session.get("target");
    if (
      isApp &&
      target &&
      (target.orderId !== msg.orderId || target.origin !== origin)
    )
      return { ok: true };
    if (isPopup && target)
      throw new Error(
        "Encerre a captura na tela de origem para guardar os itens recebidos.",
      );
    await chrome.storage.session.remove("target");
    await chrome.action.setBadgeText({ text: "" });
    return { ok: true };
  }
  if (msg.type === "HP_CAPTURE" && sources[origin]) {
    const { target } = await chrome.storage.session.get("target");
    if (!target || target.expires < Date.now())
      throw new Error(
        "Abra o catálogo, orçamento ou OS na Horse Power e conecte a extensão primeiro.",
      );
    const item = { ...msg.item, source: sources[origin] };
    const entry = {
      id: item.capture_id,
      orderId: target.orderId,
      destination: target.destination || "order",
      origin: target.origin,
      item,
      number: target.number,
    };
    const { pending = [] } = await chrome.storage.local.get("pending");
    if (pending.length >= 100)
      throw new Error("Confira os envios pendentes na extensão.");
    pending.push(entry);
    await chrome.storage.local.set({ pending });
    try {
      const result = await deliver(entry);
      await chrome.storage.local.set({
        pending: pending.filter((x) => x.id !== entry.id),
      });
      return result;
    } catch (e) {
      throw new Error(e.message + " O item ficou pendente na extensão.");
    }
  }
  if (msg.type === "HP_RETRY" && isPopup) {
    const { pending = [] } = await chrome.storage.local.get("pending");
    for (const entry of [...pending]) {
      await deliver(entry);
      pending.splice(
        pending.findIndex((x) => x.id === entry.id),
        1,
      );
      await chrome.storage.local.set({ pending });
    }
    return { ok: true };
  }
  if (msg.type === "HP_CLEAR_PENDING" && isPopup) {
    await chrome.storage.local.set({ pending: [] });
    return { ok: true };
  }
  if (msg.type === "HP_OPEN" && (isPopup || sources[origin])) {
    const { target } = await chrome.storage.session.get("target");
    if (target) {
      try {
        await chrome.tabs.update(target.tabId, { active: true });
      } catch {
        await chrome.tabs.create({
          url:
            target.origin +
            (target.destination === "catalog"
              ? "/catalogo"
              : "/ordens/" + encodeURIComponent(target.orderId) + "/editar"),
        });
      }
    } else
      await chrome.tabs.create({
        url: "https://horse-power.vercel.app/orcamentos",
      });
    return { ok: true };
  }
  throw new Error("Operação não autorizada.");
}
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  const task = serial.then(() => handle(msg, sender));
  serial = task.catch(() => {});
  task.then(respond, (e) => respond({ ok: false, error: e.message }));
  return true;
});
