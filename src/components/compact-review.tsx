/**
 * Presentation-only building blocks for compact review screens: a keyboard-
 * focusable, internally scrolling region and a collapsible review card whose
 * body stays mounted while collapsed (so unsaved reviewer input is preserved).
 * Neither component reads, writes or decides anything.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Maximum heights (px) of the compact scroll areas, kept as static Tailwind classes. */
export const COMPACT_MAX_HEIGHT = {
  /** Mission synthetic demo parameters on Medical Intake. */
  demoParameters: "max-h-[300px]",
  /** Scientific review card lists. */
  reviewList: "max-h-[450px]",
  /** Ground Medical observation approval table. */
  approvalTable: "max-h-[450px]",
} as const;

export function CompactScrollRegion({
  label,
  maxHeight,
  className,
  children,
  testId,
}: {
  label: string;
  maxHeight: keyof typeof COMPACT_MAX_HEIGHT;
  className?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      data-testid={testId}
      className={cn(
        COMPACT_MAX_HEIGHT[maxHeight],
        "overflow-y-auto overscroll-contain rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CollapsibleReviewCard({
  id,
  label,
  title,
  meta,
  defaultOpen = false,
  children,
  testId,
  className,
}: {
  /** Element id; the card opens automatically when the page hash targets it. */
  id: string;
  /** Plain-text name used for the expand control and details region. */
  label: string;
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = `${id}-details`;
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [id]);
  return (
    <li
      id={id}
      data-testid={testId}
      data-state={open ? "open" : "closed"}
      className={cn("scroll-mt-24 rounded-md border border-border text-sm", className)}
    >
      <div className="flex flex-wrap items-center gap-2 p-3">
        <span className="min-w-0 flex-1 break-words font-semibold">{title}</span>
        {meta}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden
            className={cn("h-3.5 w-3.5 transition-transform", open ? "rotate-90" : "")}
          />
          {open ? "Collapse" : "Expand"}
        </button>
      </div>
      <div
        id={bodyId}
        role="region"
        aria-label={`${label} details`}
        hidden={!open}
        className="space-y-3 border-t border-border p-3"
      >
        {children}
      </div>
    </li>
  );
}
