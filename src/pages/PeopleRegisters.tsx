import { useSearchParams } from "react-router-dom";
import { Registers } from "./Registers";
export function PeopleRegisters() {
  const [params, setParams] = useSearchParams();
  const vehicles = params.get("aba") === "veiculos";
  return (
    <>
      <div className="tabs">
        <button
          className={!vehicles ? "active" : ""}
          onClick={() => setParams({ aba: "clientes" })}
        >
          Clientes
        </button>
        <button
          className={vehicles ? "active" : ""}
          onClick={() => setParams({ aba: "veiculos" })}
        >
          Veículos
        </button>
      </div>
      <Registers
        key={vehicles ? "vehicles" : "customers"}
        kind={vehicles ? "vehicles" : "customers"}
      />
    </>
  );
}
