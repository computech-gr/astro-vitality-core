import { useId, useMemo, useState, type KeyboardEvent } from "react";

type Props = { value: string; onChange: (value: string) => void; sources: readonly string[]; className?: string };

/** Editable source selector: historical suggestions are scoped by the parent to mission, crew and provenance. */
export function BoneSourceCombobox({ value, onChange, sources, className = "" }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const suggestions = useMemo(() => [...new Set(sources.map((s) => s.trim()).filter(Boolean))]
    .filter((s) => s.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()))
    .sort((a, b) => a.localeCompare(b)).slice(0, 30), [sources, value]);
  function select(source: string) { onChange(source); setOpen(false); setActive(-1); }
  function handleKeys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); setOpen(true);
      setActive((prev) => suggestions.length ? (prev + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length : -1);
    } else if (e.key === "Enter" && open && active >= 0 && suggestions[active]) {
      e.preventDefault(); select(suggestions[active]);
    } else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  }
  return <div className="relative min-w-0">
    <label htmlFor={`${id}-input`}>Lab / original source</label>
    <div className="relative">
      <input id={`${id}-input`} className={`${className} pr-12`} role="combobox" aria-autocomplete="list"
        aria-expanded={open} aria-controls={`${id}-options`} aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined}
        value={value} onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onKeyDown={handleKeys}
        onBlur={() => { setOpen(false); setActive(-1); }} required autoComplete="off"
        placeholder="Enter or select a laboratory / source" />
      <button type="button" aria-label={open ? "Close source suggestions" : "Show source suggestions"}
        aria-expanded={open} aria-controls={`${id}-options`}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md border-l border-border text-muted-foreground hover:text-foreground"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setOpen((current) => !current); setActive(-1); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
    {open && <ul id={`${id}-options`} role="listbox" aria-label="Previously used sources"
      className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
      {suggestions.length ? suggestions.map((source, i) => <li id={`${id}-option-${i}`} role="option" aria-selected={active === i} key={source}
        className={`cursor-pointer px-3 py-2 text-sm hover:bg-accent ${active === i ? "bg-accent" : ""}`}
        onMouseDown={(e) => e.preventDefault()} onClick={() => select(source)}>{source}</li>)
        : <li className="px-3 py-2 text-sm text-muted-foreground" role="presentation">No previous matching sources. You can enter a new one.</li>}
    </ul>}
  </div>;
}
