(() => {
  if (window.__HP_SKY_PLATE_V1) return;
  window.__HP_SKY_PLATE_V1 = true;

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

  function candidateInputs() {
    return [...document.querySelectorAll("input")].filter((input) => {
      if (
        !["text", "search", "tel"].includes(input.type) ||
        input.disabled ||
        input.readOnly ||
        !input.getClientRects().length ||
        getComputedStyle(input).visibility !== "visible" ||
        input.closest("[inert],#hp-sky-float")
      )
        return false;
      return true;
    });
  }

  function inputHints(input) {
    const labelledBy = (input.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ");
    return [
      input.id,
      input.name,
      input.placeholder,
      input.getAttribute("aria-label"),
      input.getAttribute("title"),
      labelledBy,
      ...[...(input.labels || [])].map((label) => label.textContent),
    ].join(" ");
  }

  function plateFields() {
    const inputs = candidateInputs();
    const direct = inputs.filter((input) => {
      const hints = inputHints(input);
      return (
        /placa|license.?plate|\bplate\b/i.test(hints) ||
        /\bABC[- ]?(?:1234|1D23|1A23)\b/i.test(input.placeholder || "")
      );
    });
    if (direct.length) return direct;

    // Sky occasionally renders the label outside the input. In that case,
    // accept a single visible input inside a small container explicitly
    // mentioning "placa", without ever falling back to a generic search box.
    return inputs.filter((input) => {
      let parent = input.parentElement;
      for (let depth = 0; parent && depth < 3; depth++, parent = parent.parentElement) {
        const content = String(parent.textContent || "").replace(/\s+/g, " ").trim();
        if (
          /\bplaca\b/i.test(content) &&
          parent.querySelectorAll("input").length === 1
        )
          return true;
      }
      return false;
    });
  }

  function setNativeValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fill(force = false) {
    if (!context?.connected || context.expires <= Date.now())
      return "Conecte um orçamento na Horse Power para enviar a placa.";
    if (!validPlate(context.plate))
      return "O orçamento ainda não tem uma placa válida.";

    const fields = plateFields();
    if (fields.length !== 1)
      return fields.length
        ? "Há mais de um campo de placa visível no Sky Peças. Deixe somente a consulta desejada aberta."
        : "Abra a consulta de veículo por placa no Sky Peças. O preenchimento será automático.";

    const input = fields[0];
    const key = context.connectionId + ":" + context.plate;
    const previous = handled.get(input);
    if (!force && edited.has(input))
      return "Placa em edição. Use Preencher placa para reaplicar a do orçamento.";
    if (!force && previous?.key === key) return previous.message;

    let message = "Placa preenchida. Faça a consulta no Sky Peças.";
    if (plateKey(input.value) !== context.plate) {
      applying = true;
      try {
        setNativeValue(input, context.plate);
      } finally {
        applying = false;
      }
      if (plateKey(input.value) !== context.plate)
        message = "O Sky Peças não aceitou o preenchimento automático. Digite a placa manualmente.";
    }
    edited.delete(input);
    handled.set(input, { key, message });
    return message;
  }

  function render(force = false) {
    const message = fill(force);
    const host = document.getElementById("hp-sky-float");
    if (!host) return;

    let panel = document.getElementById("hp-sky-plate");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "hp-sky-plate";
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
