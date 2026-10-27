import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filterReportedSuggestions } from "@/domain/bone-health/reported-field-suggestions";
import { moveActiveIndex } from "@/domain/bone-health/variable-combobox";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly string[];
  required?: boolean;
  className?: string;
  description?: string;
};

/** Uses the editable lab picker pattern; typing and dismissal never replace a reported value. */
export function BoneReportedFieldCombobox({ label, value, onChange, suggestions, required = false, className = "", description }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const options = useMemo(() => filterReportedSuggestions(suggestions, value), [suggestions, value]);
  const activeOption = options[active];
  useEffect(() => { setActive(-1); }, [options]);
  useEffect(() => { if (open) activeRef.current?.scrollIntoView({ block: "nearest" }); }, [open, active]);
  function select(option: string) { onChange(option); setOpen(false); setActive(-1); }
  function handleKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive(previous => moveActiveIndex(previous, event.key === "ArrowDown" ? 1 : -1, options.length));
    } else if (open && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      setActive(options.length ? (event.key === "Home" ? 0 : options.length - 1) : -1);
    } else if (open && event.key === "Enter") {
      // Keep Enter inside the picker, including empty/custom results; never submit the medical form.
      event.preventDefault();
      if (activeOption !== undefined) select(activeOption);
      else setOpen(false);
    } else if (event.key === "Escape") {
      if (open) event.preventDefault();
      setOpen(false); setActive(-1);
    } else if (event.key === "Tab") { setOpen(false); setActive(-1); }
  }
  return <div className="relative min-w-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1); }
  }}>
    <label htmlFor={`${id}-input`}>{label}</label>
    <div className="relative">
      <input ref={inputRef} id={`${id}-input`} className={`${className} pr-12`} role="combobox"
        aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-options`}
        aria-activedescendant={open && activeOption !== undefined ? `${id}-option-${active}` : undefined}
        aria-describedby={description ? `${id}-description` : undefined}
        value={value} required={required} autoComplete="off"
        onChange={event => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={handleKeys} />
      <Button variant="ghost" type="button" aria-label={`${open ? "Close" : "Show"} ${label} suggestions`}
        aria-expanded={open} aria-controls={`${id}-options`}
        className="absolute inset-y-0 right-0 flex h-full w-11 items-center justify-center rounded-r-md border-l border-border text-muted-foreground hover:text-foreground"
        onMouseDown={event => event.preventDefault()}
        onClick={() => { const next = !open; inputRef.current?.focus(); setOpen(next); setActive(-1); }}>
        <ChevronDown aria-hidden="true" className={`h-5 w-5 ${open ? "rotate-180" : ""}`} />
      </Button>
    </div>
    {description && <p id={`${id}-description`} className="mt-1 text-xs text-muted-foreground">{description}</p>}
    {open && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
      <ul id={`${id}-options`} role="listbox" aria-label={`${label} suggestions`}>
        {options.map((option, index) => <li key={option} id={`${id}-option-${index}`} ref={active === index ? activeRef : undefined}
          role="option" aria-selected={option === value}
          className={`cursor-pointer break-words px-3 py-2 text-sm hover:bg-accent ${active === index ? "bg-accent" : ""}`}
          onMouseDown={event => event.preventDefault()} onClick={() => select(option)}>{option}</li>)}
      </ul>
      {!options.length && <p role="status" className="px-3 py-2 text-sm text-muted-foreground">No matching suggestions. Custom reported values are accepted.</p>}
    </div>}
  </div>;
}