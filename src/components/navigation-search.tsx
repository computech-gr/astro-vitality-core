import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  INITIAL_SUGGESTIONS,
  searchEntries,
  type SearchEntry,
} from "@/domain/navigation-search/search";

function go(href: string) {
  if (href.startsWith("https://")) {
    window.open(href, "_blank", "noopener,noreferrer");
    return;
  }
  const url = new URL(href, window.location.origin);
  if (url.pathname === window.location.pathname && url.hash) {
    window.history.pushState(null, "", url.hash);
    document
      .getElementById(url.hash.slice(1))
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  window.location.assign(href);
}

export function NavigationSearch({ entries }: { entries: readonly SearchEntry[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    if (query.trim()) return searchEntries(entries, query);
    return INITIAL_SUGGESTIONS.map((t) => entries.find((e) => e.title === t)).filter(
      (e): e is SearchEntry => Boolean(e),
    );
  }, [entries, query]);

  const select = (entry: SearchEntry) => {
    setOpen(false);
    setQuery("");
    go(entry.href);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Search site (Ctrl+K)"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => setOpen(true)}
        className="min-h-11 min-w-11 text-muted-foreground hover:text-foreground"
      >
        <Search aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setQuery("");
        }}
      >
        <DialogContent
          data-navigation-search
          className="w-[calc(100vw-1.5rem)] max-w-xl overflow-hidden border-border bg-popover p-0"
        >
          <DialogTitle className="sr-only">Search The Mitochondria</DialogTitle>
          <DialogDescription className="sr-only">
            Type to find pages, guide sections and technology topics. Use arrow keys and Enter.
          </DialogDescription>
          <Command shouldFilter={false} label="Site search" className="bg-popover">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Search pages, topics, sections…"
              aria-label="Search pages, topics and sections"
            />
            <CommandList className="max-h-[min(60dvh,26rem)] overflow-x-hidden">
              <CommandEmpty>No matching pages. Try “health”, “offline” or “team”.</CommandEmpty>
              {results.length > 0 && (
                <CommandGroup heading={query.trim() ? "Results" : "Suggested"}>
                  {results.map((entry) => (
                    <CommandItem
                      key={`${entry.title}|${entry.href}`}
                      value={`${entry.title}|${entry.href}`}
                      onSelect={() => select(entry)}
                      className="min-h-12 cursor-pointer items-start gap-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                          <span className="truncate">{entry.title}</span>
                          {entry.href.startsWith("https://") && (
                            <>
                              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                              <span className="sr-only"> (opens in a new tab)</span>
                            </>
                          )}
                        </div>
                        {entry.description && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {entry.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-primary">
                        {entry.category}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
