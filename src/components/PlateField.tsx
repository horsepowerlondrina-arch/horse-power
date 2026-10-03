import { useRef, useState } from "react";
import { Search, LoaderCircle } from "lucide-react";
import { send } from "../lib/api";
import { Field } from "./ui";
import type { Entity } from "../lib/types";
type Lookup = { source: string; vehicle: Entity | null; message: string };
export function PlateField({
  value,
  onChange,
  onFound,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onFound: (result: Lookup) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(0),
    last = useRef("");
  const lookup = async (force = false) => {
    const plate = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(plate)) {
      setMessage("Informe uma placa completa para consultar.");
      return;
    }
    if (!force && last.current === plate) return;
    last.current = plate;
    const seq = ++request.current;
    setBusy(true);
    setMessage("");
    try {
      const result: Lookup = await send("/vehicles/lookup", { plate });
      if (seq !== request.current) return;
      setMessage(result.message);
      onFound(result);
    } catch (e) {
      if (seq === request.current) {
        setMessage((e as Error).message);
        last.current = "";
      }
    } finally {
      if (seq === request.current) setBusy(false);
    }
  };
  return (
    <div className="plate-lookup full">
      <div className="plate-lookup-row">
        <Field label="Placa">
          <input
            maxLength={8}
            placeholder="ABC1D23"
            disabled={disabled}
            value={value}
            onChange={(e) => {
              request.current++;
              setBusy(false);
              setMessage("");
              last.current = "";
              onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
            onBlur={() => {
              if (value.length === 7) void lookup();
            }}
          />
        </Field>
        <button
          type="button"
          className="button"
          disabled={disabled || busy || value.length !== 7}
          onClick={() => void lookup(true)}
        >
          {busy ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <Search size={17} />
          )}
          Consultar placa
        </button>
      </div>
      {message && (
        <p className="lookup-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
