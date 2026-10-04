import { useState } from "react";
import { useApp } from "../lib/context";
import { send } from "../lib/api";
import { Field, Submit } from "../components/ui";
import { money } from "../lib/types";
export function PartsPricing() {
  const { data, refresh, notify } = useApp();
  const [rules, setRules] = useState(() =>
    data.parts_pricing!.rules.map((r) => ({ ...r })),
  );
  const [cost, setCost] = useState(10000),
    [freight, setFreight] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const base = cost + freight,
    rule = rules.find((r) => r.up_to === null || base <= r.up_to);
  const price = rule
    ? Math.max(
        Math.round((base * (10000 + rule.markup_bps)) / 10000),
        base + rule.minimum_profit,
      )
    : 0;
  return (
    <form
      className="panel work-order-section"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await send(
            "/parts-pricing",
            { mode: "legacy", rate_bps: 4000, rules },
            "PUT",
          );
          await refresh();
          notify("Política de preços das peças salva.");
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Lucro das peças</h2>
      <p className="muted">
        A base é o custo unitário mais o frete por unidade. A venda usa o maior
        valor entre o acréscimo da faixa e o ganho mínimo. A regra vale para
        novas importações do Sky e para o botão Aplicar regra de lucro.
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Custo com frete até (R$)</th>
              <th>Acréscimo (%)</th>
              <th>Ganho mínimo / un. (R$)</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.up_to === null ? (
                    "Acima da última faixa"
                  ) : (
                    <input
                      aria-label={`Limite da faixa ${i + 1}`}
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={r.up_to / 100}
                      onChange={(e) =>
                        setRules((v) =>
                          v.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  up_to: Math.round(
                                    Number(e.target.value) * 100,
                                  ),
                                }
                              : x,
                          ),
                        )
                      }
                    />
                  )}
                </td>
                <td>
                  <input
                    aria-label={`Acréscimo da faixa ${i + 1}`}
                    type="number"
                    required
                    min="0"
                    max="1000"
                    step="0.01"
                    value={r.markup_bps / 100}
                    onChange={(e) =>
                      setRules((v) =>
                        v.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                markup_bps: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Ganho mínimo da faixa ${i + 1}`}
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={r.minimum_profit / 100}
                    onChange={(e) =>
                      setRules((v) =>
                        v.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                minimum_profit: Math.round(
                                  Number(e.target.value) * 100,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Simular uma peça</h3>
      <div className="form-grid">
        <Field label="Custo sem frete (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={cost / 100}
            onChange={(e) => setCost(Math.round(Number(e.target.value) * 100))}
          />
        </Field>
        <Field label="Frete por unidade (R$)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={freight / 100}
            onChange={(e) =>
              setFreight(Math.round(Number(e.target.value) * 100))
            }
          />
        </Field>
      </div>
      <p>
        Base: <strong>{money(base)}</strong> · Venda:{" "}
        <strong>{money(price)}</strong> · Ganho bruto:{" "}
        <strong>{money(price - base)}</strong>
      </p>
      <p className="muted">
        Orçamentos e OS já lançados preservam seus valores. Ganho bruto não
        desconta taxas de cartão nem despesas da oficina.
      </p>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      <Submit busy={busy}>Salvar política de preços</Submit>
    </form>
  );
}
