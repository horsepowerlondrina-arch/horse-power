import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { money, type Entity } from "../lib/types";
import { PageHeading, Empty, SearchBox } from "../components/ui";
export function ServiceTimes() {
  const [items, setItems] = useState<Entity[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    api<Entity[]>("/service-times")
      .then((r) => {
        if (current) setItems(r);
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, []);
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const rows = items.filter((i) =>
    normalize(
      [
        i.catalog_name,
        i.service_name,
        i.make,
        i.model,
        i.vehicle_year,
        i.engine,
      ].join(" "),
    ).includes(normalize(query)),
  );
  return (
    <>
      <PageHeading
        title="Tempos de serviço"
        description="Referências coletadas no Tempario e salvas com o veículo de cada consulta."
      />
      <div className="panel service-times-panel">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Buscar serviço, modelo ou ano…"
        />
        <p className="muted">
          Tempo de referência do fornecedor, não tempo medido da execução. Sem
          veículo informado, a referência permanece sem aplicação definida.
          Exibindo as últimas 2.000 capturas.
        </p>
        {error ? (
          <p role="alert" className="error-box">
            {error}
          </p>
        ) : loading ? (
          <p>Carregando tempos…</p>
        ) : rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Serviço</th>
                  <th>Veículo de referência</th>
                  <th>Tempo</th>
                  <th>Valor capturado</th>
                  <th>Origem</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.catalog_name}</strong>
                    </td>
                    <td>
                      {[i.make, i.model, i.vehicle_year, i.engine]
                        .filter(Boolean)
                        .join(" · ") || "Não informado"}
                    </td>
                    <td>
                      {Math.floor(i.duration_seconds / 3600) > 0
                        ? `${Math.floor(i.duration_seconds / 3600)}h `
                        : ""}
                      {Math.round((i.duration_seconds % 3600) / 60)}min
                    </td>
                    <td>{money(i.source_price)}</td>
                    <td>{i.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Nenhum tempo encontrado"
            description="Abra um orçamento, escolha Adicionar serviço e envie um item do Tempario pela extensão."
          />
        )}
      </div>
    </>
  );
}
