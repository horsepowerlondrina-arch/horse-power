(() => {
  if (window.__HP_TEMPARIO_V3) return;
  window.__HP_TEMPARIO_V3 = true;
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
  const txt = (e) => norm(e?.innerText || e?.textContent || "");
  // Não inclui o próprio botão na descrição nem na identificação da linha.
  function rowText(e) {
    const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
    const parts = [];
    while (walker.nextNode()) {
      if (
        !walker.currentNode.parentElement?.closest(
          "button,[role=button],.hp-tempario-btn",
        )
      )
        parts.push(walker.currentNode.textContent);
    }
    return norm(parts.join(" "));
  }
  const timePattern = String.raw`\b(?:\d+(?:[.,]\d+)?\s*h(?:\s*\d+(?:[.,]\d+)?\s*m(?:in(?:utos?)?)?)?|\d+(?:[.,]\d+)?\s*m(?:in(?:utos?)?)?)\b`;
  const timesIn = (s) =>
    String(s || "").match(new RegExp(timePattern, "gi")) || [];
  const withoutTimes = (s) =>
    String(s || "").replace(new RegExp(timePattern, "gi"), " ");
  function money(s) {
    const m = String(s || "").match(/R\$\s*([\d.]+,\d{2})/i);
    return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) || 0 : 0;
  }
  function hrs(s) {
    const str = timesIn(s)[0] || "";
    const number = (x) => Number(String(x || "0").replace(",", ".")) || 0;
    const m = str.match(
      /^(\d+(?:[.,]\d+)?)\s*h(?:\s*(\d+(?:[.,]\d+)?)\s*m(?:in(?:utos?)?)?)?$/i,
    );
    if (m) return number(m[1]) + number(m[2]) / 60;
    const minutes = str.match(/^(\d+(?:[.,]\d+)?)\s*m(?:in(?:utos?)?)?$/i);
    return minutes ? number(minutes[1]) / 60 : 0;
  }
  function vehicle() {
    const b = txt(document.body);
    let plate = "",
      model = "",
      year = "",
      make = "";
    let m;
    m = b.match(/Placa\s*:\s*([A-Z0-9-]+)/i);
    if (m) plate = m[1];
    m = b.match(
      /Modelo\s*:\s*(.+?)(?=\s+Ano\s*:|\s+Porte\s*:|\s+Valor FIPE\s*:)/i,
    );
    if (m) model = norm(m[1]);
    m = b.match(/Ano\s*:\s*([0-9]{4}\s*-\s*[0-9]{4}|[0-9]{4})/i);
    if (m) year = norm(m[1]);
    for (const e of document.querySelectorAll("select,[role=combobox],input")) {
      const v = norm(
        e.selectedOptions?.[0]?.textContent || e.value || e.innerText || "",
      );
      if (
        /Volkswagen|Chevrolet|Fiat|Ford|Renault|Toyota|Honda|Hyundai|Nissan|Jeep|Peugeot|Citro/i.test(
          v,
        )
      ) {
        make = v;
        break;
      }
    }
    return { plate, make, model, year };
  }
  function candidates() {
    const out = [],
      seen = new Set();

    // Limite vertical: só considera a lista principal de Serviços,
    // não o quadro verde "Orçamento" que aparece abaixo.
    let budgetTop = Infinity;
    const budgetHeading = [
      ...document.querySelectorAll("h1,h2,h3,h4,h5,div,span,p"),
    ].find(
      (e) =>
        upper(txt(e)) === "ORCAMENTO" && e.getBoundingClientRect().height > 0,
    );
    if (budgetHeading)
      budgetTop = budgetHeading.getBoundingClientRect().top + window.scrollY;

    // Começa pelos elementos-folha que contêm exatamente um valor monetário.
    const leaves = [
      ...document.querySelectorAll("span,div,td,p,strong,[role=cell]"),
    ].filter((el) => {
      const t = txt(el);
      if (!/^R\$\s*[\d.]+,\d{2}$/i.test(t)) return false;
      return ![...el.querySelectorAll("span,div,td,p,strong,[role=cell]")].some(
        (child) => /^R\$\s*[\d.]+,\d{2}$/i.test(txt(child)),
      );
    });

    for (const moneyEl of leaves) {
      const absTop = moneyEl.getBoundingClientRect().top + window.scrollY;
      if (absTop >= budgetTop) continue;

      let cur = moneyEl.parentElement;
      let row = null;

      for (let depth = 0; cur && depth < 10; depth++, cur = cur.parentElement) {
        if (cur.closest("#hp-tempario-float,#hp-tempario-toast")) continue;
        const t = rowText(cur);
        if (t.length < 10 || t.length > 900) continue;
        if (/SERVI[CÇ]O\s+TEMPO REAL\s+VALOR/i.test(t)) continue;

        const monies = t.match(/R\$\s*[\d.]+,\d{2}/gi) || [];
        const times = timesIn(t);

        // A linha real precisa conter exatamente um valor e um tempo.
        if (monies.length !== 1 || times.length !== 1) continue;

        // Precisa conter descrição textual além de tempo e valor.
        const cleaned = withoutTimes(t.replace(/R\$\s*[\d.]+,\d{2}/gi, " "))
          .replace(/×|✕|❌/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (cleaned.length < 6) continue;

        // Prefere o primeiro ancestor que também tenha a ação/excluir,
        // ou uma largura suficiente para representar a linha completa.
        const hasAction = [...cur.querySelectorAll("button,a")].some(
          (b) =>
            /×|excluir|remover/i.test(txt(b)) ||
            /delete|remove|trash/i.test(
              (b.getAttribute("aria-label") || "") + " " + (b.title || ""),
            ),
        );

        if (hasAction || cur.getBoundingClientRect().width > 500) {
          row = cur;
          break;
        }
      }

      if (!row) continue;

      const item = parse(row);
      if (!item || !item.service) continue;

      const key = [
        upper(item.service),
        Number(item.hours || 0).toFixed(6),
        Number(item.value || 0).toFixed(2),
      ].join("|");
      if (seen.has(row)) continue;
      seen.add(row);

      row.dataset.hpServiceKey = key;
      out.push(row);
    }

    return out;
  }
  function parse(row) {
    const raw = rowText(row);
    if (
      timesIn(raw).length !== 1 ||
      (raw.match(/R\$\s*[\d.]+,\d{2}/gi) || []).length !== 1
    )
      return null;
    const h = hrs(raw),
      value = money(raw);
    if (!h || !value) return null;
    const service = norm(
      withoutTimes(raw.replace(/R\$\s*[\d.]+,\d{2}/gi, " ")).replace(
        /×|✕|❌/g,
        " ",
      ),
    );
    if (!service) return null;

    const v = vehicle();
    const rate = h > 0 ? value / h : 0;
    return {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
      source: "Tempario",
      service,
      hours: h,
      value, // valor total exatamente capturado do Tempario
      hourlyRate: rate, // apenas derivado para exibição
      sourceValue: value,
      sourceHourlyRate: rate,
      vehicle: v,
      sourceUrl: location.href,
      addedAt: new Date().toISOString(),
    };
  }
  async function add(item) {
    const r = await window.hpSendCapture({
      capture_id: item.id,
      source: "tempario",
      name: item.service,
      quantity: 1,
      cost: 0,
      price: Math.round(item.value * 100),
      duration_seconds: Math.round(item.hours * 3600),
      vehicle: item.vehicle,
    });
    toast(
      r.duplicate
        ? "Serviço já enviado. Confira o orçamento na Horse Power."
        : `Serviço e tempo salvos: ${r.label || `Atendimento #${r.number}`}`,
    );
  }
  function inject() {
    const rows = candidates();
    const validButtons = new Set();

    for (const row of rows) {
      const item = parse(row);
      if (!item) continue;

      const key =
        row.dataset.hpServiceKey ||
        [
          upper(item.service),
          Number(item.hours || 0).toFixed(2),
          Number(item.value || 0).toFixed(2),
        ].join("|");
      row.dataset.hpServiceKey = key;
      let b = row.querySelector(".hp-tempario-btn");

      if (!b) {
        b = document.createElement("button");
        b.type = "button";
        b.className = "hp-tempario-btn";
        b.dataset.hpKey = key;
        b.textContent = "HP • Enviar";

        b.onclick = async (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const live = parse(row);
          if (!live) return;
          try {
            await add(live);
          } catch (e) {
            toast(e.message);
            return;
          }
          b.textContent = "✓ Enviado";
          b.classList.add("hp-added");
          setTimeout(() => {
            b.textContent = "HP • Enviar";
            b.classList.remove("hp-added");
          }, 1500);
        };
      }
      b.dataset.hpKey = key;
      validButtons.add(b);

      if (!row.contains(b)) {
        const buttons = [...row.querySelectorAll("button,a")];
        const del = buttons.find(
          (x) =>
            /×|excluir|remover/i.test(txt(x)) ||
            /delete|remove|trash/i.test(
              (x.getAttribute("aria-label") || "") + " " + (x.title || ""),
            ),
        );

        if (del) del.insertAdjacentElement("beforebegin", b);
        else {
          const cells = [
            ...row.querySelectorAll(":scope > td,:scope > [role=cell]"),
          ];
          (cells.length ? cells[cells.length - 1] : row).appendChild(b);
        }
      }
    }

    // Remove apenas botões realmente órfãos ou duplicados.
    for (const b of [...document.querySelectorAll(".hp-tempario-btn")]) {
      if (!validButtons.has(b)) b.remove();
    }
  }
  function ui() {
    if (!document.getElementById("hp-tempario-toast")) {
      const t = document.createElement("div");
      t.id = "hp-tempario-toast";
      document.body.appendChild(t);
    }
    if (!document.getElementById("hp-tempario-float")) {
      const d = document.createElement("div");
      d.id = "hp-tempario-float";
      d.innerHTML =
        '<strong>Horse Power</strong><span id="hp-tempario-count">0 serviço(s)</span><button>Abrir Horse Power</button>';
      d.querySelector("button").onclick = () => window.hpOpenQuote();
      document.body.appendChild(d);
    }
    updateFloat();
  }
  async function updateFloat() {
    const e = document.getElementById("hp-tempario-count");
    if (e) e.textContent = await window.hpCaptureStatus();
  }
  let timer;
  function toast(s) {
    const e = document.getElementById("hp-tempario-toast");
    if (!e) return;
    e.textContent = s;
    e.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => e.classList.remove("show"), 1800);
  }
  ui();
  inject();
  const mo = new MutationObserver(() => {
    clearTimeout(window.__hpT);
    window.__hpT = setTimeout(inject, 350);
  });
  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  setInterval(updateFloat, 5000);
})();
