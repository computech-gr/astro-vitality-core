import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
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
  const activeRef = useRef<HTMLLIElement>(null);
  const selected = resolveCatalogSelection(variables, value);
  const options = useMemo(() => filterCatalogVariables(variables, query), [variables, query]);
  const activeOption = active >= 0 ? options[active] : undefined;
  useEffect(() => { if (open) activeRef.current?.scrollIntoView({ block: "nearest" }); }, [open, active, query]);

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
      <div className="relative mt-1">
      <input
        ref={inputRef}
        id={inputId}
        className={`${className} pr-12`}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={statusId}
        aria-activedescendant={open && activeOption ? `${listId}-${activeOption.id}` : undefined}
        value={open ? query : selected ? variableLabel(selected) : query}
        placeholder="Search by name or catalog ID"
        onFocus={() => {
          setOpen(true);
          setActive(-1);
        }}
        onClick={() => setOpen(true)}
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
      <Button
        variant="ghost"
        type="button"
        aria-label={open ? "Close handbook variable options" : "Show handbook variable options"}
        aria-expanded={open}
        aria-controls={listId}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md border-l border-border text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => { const next = !open; inputRef.current?.focus(); setOpen(next); setQuery(""); setActive(-1); }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </Button>
      </div>
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
                ref={i === active ? activeRef : undefined}
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
