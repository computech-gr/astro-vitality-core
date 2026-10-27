"use client";

import { useId, useMemo, useState } from "react";

type Entry = { id: string; name: string; status: string };

/** Read-only selection. Never activates a proposal as an ingestion mapping. */
export function ScientificCatalogPicker({ entries }: { entries: readonly Entry[] }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState(0);
  const filtered = useMemo(() => entries.filter(e => `${e.id} ${e.name}`.toLowerCase().includes(query.toLowerCase())), [entries, query]);
  const selected = entries.find(e => e.id === selectedId);
  const choose = (e: Entry) => { setSelectedId(e.id); setQuery(""); setOpen(false); setActive(0); };
  return <div className="mt-4">
    <label htmlFor={`${id}-input`} className="block text-sm font-medium">Explore scientific reference variables</label>
    <div className="relative mt-2">
      <input id={`${id}-input`} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && filtered[active] ? `${id}-${filtered[active].id}` : undefined}
        className="w-full rounded-md border border-border bg-background p-3 pr-12 text-sm"
        placeholder="Search by name or catalog ID" autoComplete="off"
        value={open ? query : selected ? `${selected.id} · ${selected.name}` : ""}
        onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onBlur={() => { setOpen(false); setQuery(""); }}
        onKeyDown={e => {
          if (e.key === "Escape") { setOpen(false); setQuery(""); }
          else if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive(i => filtered.length ? (i + 1) % filtered.length : 0); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive(i => filtered.length ? (i - 1 + filtered.length) % filtered.length : 0); }
          else if (e.key === "Home" && open) { e.preventDefault(); setActive(0); }
          else if (e.key === "End" && open) { e.preventDefault(); setActive(Math.max(0, filtered.length - 1)); }
          else if (e.key === "Enter" && open && filtered[active]) { e.preventDefault(); choose(filtered[active]); }
        }}/>
      <button type="button" aria-label={open ? "Close scientific catalog options" : "Show scientific catalog options"} aria-expanded={open} aria-controls={`${id}-list`}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md border-l border-border text-muted-foreground hover:text-foreground"
        onMouseDown={e => e.preventDefault()} onClick={() => { setOpen(v => !v); setQuery(""); setActive(0); }}>
        <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground" role="status">{entries.length} reference entries · owner-reported verbal scientific review · formal reconciliation pending</p>
    {open && <ul id={`${id}-list`} role="listbox" aria-label="Scientific reference variables" className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground">
      {filtered.length ? filtered.map((e, i) => <li key={e.id} id={`${id}-${e.id}`} role="option" aria-selected={e.id === selectedId}
        className={`cursor-pointer border-b border-border px-3 py-2 text-sm ${active === i ? "bg-accent text-accent-foreground" : ""}`}
        onMouseEnter={() => setActive(i)} onMouseDown={event => { event.preventDefault(); choose(e); }}>
        {e.id} · {e.name}
      </li>) : <li className="px-3 py-2 text-sm text-muted-foreground">No matching reference variables; selection unchanged.</li>}
    </ul>}
    {selected && <article className="mt-3 rounded-md border border-border p-4 text-sm" aria-label="Selected reference details">
      <h3 className="font-semibold">{selected.id} · {selected.name}</h3>
      <p className="mt-2 text-muted-foreground">Scientific reference entry. Verbal reviewer approval reported by project owner; written per-entry confirmation pending. Not enabled for measurement ingestion or clinical use.</p>
    </article>}
  </div>;
}
