(() => {
  if (window.__HP_SKY_V1) return;
  window.__HP_SKY_V1 = true;

  const norm = (s) =>
    String(s || "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const upper = (s) =>
    norm(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
  const moneyToNumber = (s) => {
    if (!s) return 0;
    let t = String(s)
      .replace(/[^\d,.-]/g, "")
      .trim();
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    return Number(t) || 0;
  };

  function text(el) {
    return norm(el?.innerText || el?.textContent || "");
  }

  function getProductContainers() {
    const nodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let n;
    while ((n = walker.nextNode())) {
      if (/C[oó]d\.?\s*F[aá]b\s*:/i.test(n.nodeValue || ""))
        nodes.push(n.parentElement);
    }
    const containers = [];
    for (const start of nodes) {
      let cur = start,
        chosen = null;
      for (let i = 0; cur && i < 9; i++, cur = cur.parentElement) {
        const t = text(cur);
        const codeCount = (t.match(/C[oó]d\.?\s*F[aá]b\s*:/gi) || []).length;
        const hasPrice = /R\$\s*\d/i.test(t);
        const hasStock = /Estoque\s*:/i.test(t);
        const hasCart = /Adicionar\s+no\s+Carrinho/i.test(t);
        if (codeCount === 1 && hasPrice && (hasStock || hasCart)) {
          chosen = cur;
          // keep climbing only if parent still contains exactly one product, to get whole row
          const pt = text(cur.parentElement);
          const pCount = (pt.match(/C[oó]d\.?\s*F[aá]b\s*:/gi) || []).length;
          if (pCount !== 1) break;
        }
        if (codeCount > 1) break;
      }
      if (chosen && !containers.includes(chosen)) containers.push(chosen);
    }
    return containers;
  }

  function extractProduct(container) {
    const raw = (container.innerText || container.textContent || "").replace(
      /\u00a0/g,
      " ",
    );
    const lines = raw.split(/\n+/).map(norm).filter(Boolean);

    const cm = raw.match(/C[oó]d\.?\s*F[aá]b\s*:\s*([A-Z0-9._\/-]+)/i);
    const code = cm ? cm[1].trim() : "";

    const nnm = raw.match(/N\/N\s*:\s*([A-Z0-9._\/-]+)/i);
    const nn = nnm ? nnm[1].trim() : "";

    const stockm = raw.match(/Estoque\s*:\s*([\d.]+)/i);
    const stock = stockm ? stockm[1] : "";

    let description = "",
      brand = "";
    const codeIdx = lines.findIndex((x) => /C[oó]d\.?\s*F[aá]b\s*:/i.test(x));
    if (codeIdx >= 0) {
      for (let i = codeIdx + 1; i < Math.min(lines.length, codeIdx + 7); i++) {
        const l = lines[i];
        if (
          /^(N\/N|C[oó]d\.?\s*Aux|R\$|Estoque|Aplicação|Similar|Informações|\+?\s*Adicionar)/i.test(
            l,
          )
        )
          continue;
        if (!description) {
          description = l;
          continue;
        }
        if (!brand && l !== description && l.length < 50 && !/\d{3,}/.test(l)) {
          brand = l;
          break;
        }
      }
    }

    // Main price displayed by Sky: prefer values followed by the item's
    // commercial unit (/UN, /JG, /PC, /KIT, /PAR, etc.). This separates the
    // item price from secondary values such as the tax breakdown.
    let price = 0;
    const unitMatches = [
      ...raw.matchAll(/R\$\s*([\d.]+,\d{2})\s*\/\s*[A-Z]{1,10}\.?/gi),
    ].map((m) => moneyToNumber(m[1]));
    if (unitMatches.length) price = unitMatches[0];
    if (!price) {
      const all = [...raw.matchAll(/R\$\s*([\d.]+,\d{2})/gi)]
        .map((m) => moneyToNumber(m[1]))
        .filter((x) => x > 0);
      if (all.length === 1) price = all[0];
    }

    return {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
      supplier: "Sky Peças",
      code,
      nn,
      description,
      brand,
      unitCost: price,
      qty: 1,
      stock,
      vehicle: {},
      sourceUrl: location.href,
      addedAt: new Date().toISOString(),
    };
  }

  async function addItem(item) {
    const r = await window.hpSendCapture({
      capture_id: item.id,
      source: "sky",
      name: item.description,
      code: item.code,
      brand: item.brand,
      quantity: item.qty,
      cost: Math.round(item.unitCost * 100),
      price: 0,
      vehicle: {},
    });
    toast(
      r.duplicate
        ? "Peça já enviada. Ajuste a quantidade na Horse Power."
        : `Peça salva: ${r.label || `Atendimento #${r.number}`}`,
    );
  }

  function findCartAction(container) {
    const els = [
      ...container.querySelectorAll(
        "button,a,input[type=button],input[type=submit]",
      ),
    ];
    return (
      els.find((e) =>
        /Adicionar\s+no\s+Carrinho/i.test(text(e) || e.value || ""),
      ) || null
    );
  }

  function injectButtons() {
    const containers = getProductContainers();
    for (const c of containers) {
      if (c.dataset.hpSkyInjected === "1") continue;
      const p = extractProduct(c);
      if (!p.code || !p.unitCost) continue;

      const b = document.createElement("button");
      b.type = "button";
      b.className = "hp-sky-btn";
      b.textContent = "HP • Enviar";
      b.title = `Enviar ${p.code} para o orçamento conectado na Horse Power`;
      b.addEventListener("click", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const live = extractProduct(c);
        try {
          await addItem(live);
        } catch (e) {
          toast(e.message);
          return;
        }
        b.textContent = "✓ Enviado";
        b.classList.add("hp-added");
        setTimeout(() => {
          b.textContent = "HP • Enviar";
          b.classList.remove("hp-added");
        }, 6000);
      });

      const cart = findCartAction(c);
      if (cart) cart.insertAdjacentElement("afterend", b);
      else c.appendChild(b);
      c.dataset.hpSkyInjected = "1";
    }
  }

  function ensureUI() {
    if (!document.getElementById("hp-sky-toast")) {
      const t = document.createElement("div");
      t.id = "hp-sky-toast";
      document.body.appendChild(t);
    }
    if (!document.getElementById("hp-sky-float")) {
      const d = document.createElement("div");
      d.id = "hp-sky-float";
      d.innerHTML =
        '<strong>Horse Power</strong><span id="hp-sky-count">0 peça(s)</span><button type="button">Abrir Horse Power</button>';
      d.querySelector("button").onclick = () => window.hpOpenQuote();

      const freight = document.createElement("label");
      freight.id = "hp-sky-freight";
      const title = document.createElement("span");
      title.textContent = "Frete total da compra (R$)";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.01";
      input.value = "17.50";
      input.addEventListener("change", async () => {
        const cents = Math.max(
          0,
          Math.round(Number(input.value || 0) * 100),
        );
        try {
          const result = await window.hpSetFreight(cents);
          input.value = (result.freight_total / 100).toFixed(2);
          toast(
            `Frete atualizado: R$ ${(result.freight_total / 100)
              .toFixed(2)
              .replace(".", ",")}`,
          );
          await updateFloat();
        } catch (e) {
          toast(e.message);
        }
      });
      freight.append(title, input);
      d.appendChild(freight);
      window.hpMinimizePanel(d);
      document.body.appendChild(d);
    }
    updateFloat();
  }
  async function updateFloat() {
    const e = document.getElementById("hp-sky-count");
    const input = document.querySelector("#hp-sky-freight input");
    try {
      const info = await window.hpCaptureInfo();
      if (e)
        e.textContent = info.connected
          ? info.label || `Atendimento #${info.number}`
          : "Conecte um orçamento na Horse Power";
      if (input) {
        input.disabled = !info.connected;
        if (document.activeElement !== input)
          input.value = ((info.freightTotal ?? 1750) / 100).toFixed(2);
      }
    } catch {
      if (e) e.textContent = "Conecte um orçamento na Horse Power";
      if (input) input.disabled = true;
    }
  }
  let toastTimer;
  function toast(msg) {
    const e = document.getElementById("hp-sky-toast");
    if (!e) return;
    e.textContent = msg;
    e.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => e.classList.remove("show"), 1800);
  }

  ensureUI();
  injectButtons();
  const obs = new MutationObserver(() => {
    clearTimeout(window.__hpSkyTimer);
    window.__hpSkyTimer = setTimeout(injectButtons, 180);
  });
  obs.observe(document.documentElement, { subtree: true, childList: true });
  setInterval(updateFloat, 5000);
})();
