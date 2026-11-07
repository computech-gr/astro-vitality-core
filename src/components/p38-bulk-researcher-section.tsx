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

export const BULK_RESEARCHER_ANCHOR = "bulk-synthetic-demo-researcher-decisions";
export const BULK_RESEARCHER_HEADING = "Bulk Synthetic Demo Researcher Decisions";

export const BULK_RESEARCHER_NOTICE: Record<
  Exclude<BulkResearcherVisibility, "visible">,
  string
> = {
  sign_in:
    "Sign in with an authorized Researcher account to see the synthetic demonstration missions available for bulk decisions.",
  choose_mission: "Choose a synthetic demonstration mission above to open the bulk decisions.",
  loading: "Reading this mission's synthetic demo scope…",
  unavailable: "Bulk decisions are unavailable for this account or mission. Nothing was changed.",
  not_researcher:
    "Only an authorized Researcher (scientific approver) can record bulk SYNTHETIC DEMO decisions for this mission. Nothing was changed.",
  no_demo_scope:
    "No owner-authorized synthetic demo scope exists for this mission, so there is nothing to decide in bulk.",
};

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
