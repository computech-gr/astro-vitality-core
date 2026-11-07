/**
 * Page-level home of the EXISTING P38 bulk Researcher workflow on
 * /mission/scientific-review: a stable heading and anchor that is always
 * present, so the in-page link and the Global Scientific Review button can
 * reach it before a mission is chosen. It wraps P38BulkDemoResearcher; it does
 * not implement any selection, triage or decision logic of its own.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { BulkResearcherVisibility } from "@/domain/health-intelligence/p38-bulk-demo-selection";
import {
  BULK_RESEARCHER_ANCHOR,
  BULK_RESEARCHER_HEADING,
  BULK_RESEARCHER_NOTICE,
} from "@/components/p38-bulk-researcher-anchor";

export function BulkResearcherSection({
  visibility,
  children,
}: {
  visibility: BulkResearcherVisibility;
  children?: ReactNode;
}) {
  return (
    <section
      id={BULK_RESEARCHER_ANCHOR}
      aria-labelledby={`${BULK_RESEARCHER_ANCHOR}-title`}
      className="scroll-mt-24 space-y-3 rounded-lg border border-border bg-card p-4"
      data-testid="p38-bulk-researcher-section"
    >
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={`${BULK_RESEARCHER_ANCHOR}-title`} className="text-base font-semibold">
            {BULK_RESEARCHER_HEADING}
          </h3>
          <Badge variant="outline">SYNTHETIC DEMO</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          These are synthetic demonstration decisions only. They are not production scientific
          approval and not P41 interpretation approval, and they activate nothing.
        </p>
      </div>
      {visibility === "visible" ? null : (
        <p role="status" className="text-sm text-muted-foreground">
          {BULK_RESEARCHER_NOTICE[visibility]}
        </p>
      )}
      {children}
    </section>
  );
}
