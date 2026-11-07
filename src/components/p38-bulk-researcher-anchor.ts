/** Anchor, heading and notices of the Scientific Review bulk Researcher section (browser-safe). */
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
