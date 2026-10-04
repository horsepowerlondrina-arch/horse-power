(() => {
  if (window.__HP_TEMPARIO_PLATE) return;
  window.__HP_TEMPARIO_PLATE = true;

  const plateKey = (value) =>
    String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  const validPlate = (value) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(value);
  let context = null;
  let requesting = false;
  let applying = false;
  let scheduled;
  const handled = new WeakMap();
  const edited = new WeakSet();

  function plateFields() {
    return [...document.querySelectorAll("input")].filter((input) => {
      if (
        !["text", "search", "tel"].includes(input.type) ||
        input.disabled ||
        input.readOnly ||
        !input.getClientRects().length ||
        getComputedStyle(input).visibility !== "visible" ||
        input.closest("[inert],#hp-tempario-float")
      )
        return false;
      const labelledBy = (input.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent || "")
        .join(" ");
      const hints = [
        input.id,
        input.name,
        input.placeholder,
        input.getAttribute("aria-label"),
        labelledBy,
        ...[...(input.labels || [])].map((label) => label.textContent),
      ].join(" ");
      // Identify the actual plate field, never a generic search or login input.
      return (
        /placa|license.?plate|\bplate\b/i.test(hints) ||
        /\bABC[- ]?(?:1234|1D23|1A23)\b/i.test(input.placeholder || "")
      );
    });
  }

  function fill(force = false) {
    if (!context?.connected || context.expires <= Date.now())
      return "Conecte um orçamento na Horse Power para enviar a placa.";
    if (!validPlate(context.plate))
      return "O orçamento ainda não tem uma placa válida.";
    const fields = plateFields();
    if (fields.length !== 1)
      return fields.length
        ? "Abra apenas um campo de consulta de placa."
        : "Abra a consulta por placa no Tempario. O preenchimento será automático.";
    const input = fields[0];
    const key = context.connectionId + ":" + context.plate;
    const previous = handled.get(input);
    if (!force && edited.has(input))
      return "Placa em edição. Use Preencher placa para usar a do orçamento.";
    if (!force && previous?.key === key) return previous.message;

    let message = "Placa preenchida. Clique em consultar no Tempario.";
    if (plateKey(input.value) !== context.plate) {
      // Native setter + bubbling events also update React-controlled fields.
      applying = true;
      try {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(input, context.plate);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } finally {
        applying = false;
      }
      if (plateKey(input.value) !== context.plate)
        message =
          "O Tempario não aceitou o preenchimento. Digite a placa acima.";
    }
    edited.delete(input);
    handled.set(input, { key, message });
    return message;
  }

  function render(force = false) {
    const message = fill(force);
    const host = document.getElementById("hp-tempario-float");
    if (!host) return;
    let panel = document.getElementById("hp-tempario-plate");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "hp-tempario-plate";
      const label = document.createElement("strong");
      const status = document.createElement("span");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Preencher placa";
      button.onclick = async () => {
        await refresh(true);
      };
      panel.append(label, status, button);
      host.appendChild(panel);
    }
    const active = context?.connected && context.expires > Date.now();
    const label =
      active && context.plate
        ? "Placa do orçamento: " + context.plate
        : "Placa do veículo";
    if (panel.children[0].textContent !== label)
      panel.children[0].textContent = label;
    if (panel.children[1].textContent !== message)
      panel.children[1].textContent = message;
    const disabled = !active || !validPlate(context.plate);
    if (panel.children[2].disabled !== disabled)
      panel.children[2].disabled = disabled;
  }

  async function refresh(force = false) {
    if (requesting) return;
    requesting = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "HP_VEHICLE" });
      context = response?.ok ? response : null;
    } catch {
      context = null;
    } finally {
      requesting = false;
      render(force);
    }
  }
  function schedule() {
    clearTimeout(scheduled);
    scheduled = setTimeout(() => render(), 150);
  }
  document.addEventListener(
    "input",
    (event) => {
      if (!applying && event.target instanceof HTMLInputElement) {
        edited.add(event.target);
        schedule();
      }
    },
    true,
  );
  document.addEventListener("focusout", schedule);
  // Re-check after sign-in, client-side navigation or a lazily mounted form.
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      "disabled",
      "readonly",
      "hidden",
      "aria-label",
      "placeholder",
      "style",
      "class",
    ],
  });
  window.addEventListener("focus", () => void refresh());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
  void refresh();
  setInterval(() => void refresh(), 2500);
})();
