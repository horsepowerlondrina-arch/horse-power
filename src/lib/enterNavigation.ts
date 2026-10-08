import { flushSync } from "react-dom";

/** Enter commits the current field through blur and advances without submitting. */
export function advanceOnEnter(event: KeyboardEvent) {
  if (
    event.key !== "Enter" ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.shiftKey
  )
    return;
  const field = event.target;
  if (!(field instanceof HTMLElement) || !field.matches("input, select"))
    return;
  if (
    field.matches(
      'input[type="checkbox"], input[type="radio"], input[type="file"], input[type="button"], input[type="submit"], input[type="reset"], input[type="search"], input[type="hidden"]',
    ) ||
    field.closest(".search-field, [data-enter-native]")
  )
    return;
  const scope = field.closest('form, [role="dialog"], .page-content');
  if (!scope) return;
  event.preventDefault();
  // Holding Enter must never walk across fields or trigger a save.
  if (event.repeat) return;
  const fields = Array.from(
    scope.querySelectorAll<HTMLElement>("input, select, textarea"),
  ).filter(
    (candidate) =>
      candidate.closest('form, [role="dialog"], .page-content') === scope &&
      !candidate.matches(
        ':disabled, [readonly], [tabindex="-1"], input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"], input[type="file"]',
      ) &&
      !candidate.closest("[hidden], [inert], .search-field") &&
      candidate.getClientRects().length > 0 &&
      getComputedStyle(candidate).visibility !== "hidden",
  );
  const index = fields.indexOf(field);
  if (index < 0) return;
  const next = fields[index + 1];
  // Commit blur updates before NumericInput captures the next field's displayed value.
  flushSync(() => field.blur());
  if (next) next.focus();
}
