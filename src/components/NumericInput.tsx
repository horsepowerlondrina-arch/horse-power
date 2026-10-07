import { useState, type InputHTMLAttributes } from "react";

/** Keep the user's draft while editing; numeric form state may normalize an empty value to zero. */
export function NumericInput({
  value,
  type = "number",
  onFocus,
  onChange,
  onBlur,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const [draft, setDraft] = useState<string | null>(null);
  if (type !== "number")
    return (
      <input
        {...props}
        type={type}
        value={value}
        onFocus={onFocus}
        onChange={onChange}
        onBlur={onBlur}
      />
    );
  return (
    <input
      {...props}
      type="number"
      value={draft ?? value}
      onFocus={(event) => {
        setDraft(
          event.currentTarget.value !== "" &&
            Number(event.currentTarget.value) === 0
            ? ""
            : event.currentTarget.value,
        );
        onFocus?.(event);
      }}
      onChange={(event) => {
        setDraft(event.currentTarget.value);
        onChange?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
    />
  );
}
