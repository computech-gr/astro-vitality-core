import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  filterCatalogVariables,
  moveActiveIndex,
  resolveCatalogSelection,
  variableLabel,
  type ComboboxVariable,
} from "@/domain/bone-health/variable-combobox";

interface Props<T extends ComboboxVariable> {
  variables: readonly T[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * WAI-ARIA combobox (list autocomplete). Typing filters only; the selected
 * catalog entry changes solely through an explicit option choice.
 */
export function BoneVariableCombobox<T extends ComboboxVariable>({
  variables,
  value,
  onChange,
  className = "",
}: Props<T>) {
  const baseId = useId();
  const inputId = `${baseId}-input`;
  const listId = `${baseId}-list`;
  const statusId = `${baseId}-status`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = resolveCatalogSelection(variables, value);
  const options = useMemo(() => filterCatalogVariables(variables, query), [variables, query]);
  const activeOption = active >= 0 ? options[active] : undefined;

  function commit(id: string | undefined) {
    const match = resolveCatalogSelection(variables, id);
    if (!match) return;
    onChange(match.id);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((cur) => moveActiveIndex(cur, e.key === "ArrowDown" ? 1 : -1, options.length));
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActive(options.length ? 0 : -1);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter") {
      if (open && activeOption) {
        e.preventDefault();
        commit(activeOption.id);
      }
    } else if (e.key === "Escape") {
      if (open || query) {
        e.preventDefault();
        setOpen(false);
        setQuery("");
        setActive(-1);
      }
    }
  }

  const statusText = !open
    ? ""
    : options.length === 0
      ? `No handbook variables match “${query.trim()}”. Selection unchanged.`
      : `${options.length} handbook variable${options.length === 1 ? "" : "s"} available.`;

  return (
    <div className="relative">
      <label htmlFor={inputId}>Handbook variable</label>
      <p className="text-xs text-muted-foreground" data-testid="bone-variable-selected">
        Selected: {selected ? variableLabel(selected) : "none"}
      </p>
      <input
        ref={inputRef}
        id={inputId}
        className={`${className} mt-1`}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={statusId}
        aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
        value={open ? query : selected ? variableLabel(selected) : query}
        placeholder="Search by name or catalog ID"
        onFocus={() => {
          setOpen(true);
          setActive(-1);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setQuery("");
          setActive(-1);
        }}
      />
      <p id={statusId} className="sr-only" role="status" aria-live="polite">
        {statusText}
      </p>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Handbook variables"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground" aria-disabled="true">
              No matching handbook variables. The current selection is unchanged.
            </li>
          ) : (
            options.map((v, i) => (
              <li
                key={v.id}
                id={`${listId}-${v.id}`}
                role="option"
                aria-selected={v.id === value}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  i === active ? "bg-accent text-accent-foreground" : ""
                } ${v.id === value ? "font-semibold" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(v.id);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {variableLabel(v)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
