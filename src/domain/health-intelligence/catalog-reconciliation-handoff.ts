/**
 * P36 Catalog Reconciliation — review-only handoff (pure, read-only).
 *
 * Reads data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json and
 * cross-checks every row against the existing catalogs WITHOUT changing them.
 * Every row is review-only and stays PENDING_NIKOLAS_REVIEW: this module never
 * activates a metric, never approves an alias or unit, never converts a value,
 * never feeds intake classification, domain analytics, PDF interpretation or
 * sync eligibility. Activation requires a separate governed patch through the
 * versioned catalog-extensions registry after independent scientific review.
 */
import handoffJson from "../../../data/scientific/p36-unknown-biomarker-reconciliation-handoff.v1.json";
import p36Registry from "../../../data/scientific/p36-biomarker-source-registry.v1.json";
import p355Catalog from "../../../data/scientific/p355-proposed-domain-catalog.v1.json";
import governedRegistry from "../../../data/scientific/catalog-extensions.v1.json";
import { REQUIRED_SCIENTIFIC_GATE, termIdFor } from "./unknown-biomarker-review";

export const CATALOG_RECONCILIATION_HANDOFF_SCHEMA = "mitochondria.catalog-reconciliation-review-handoff.v1";

export type HandoffCandidateStatus = "P36_PROVISIONAL" | "P35_5_DRAFT" | "UNRESOLVED";

export interface HandoffRow {
  termId: string;
  sourceLabel: string;
  sourceUnit: string;
  observations: number;
  candidateCatalogId: string | null;
  candidateCatalogName: string | null;
  candidateCatalogStatus: HandoffCandidateStatus;
  sourceCatalogUnit: string | null;
  reviewStatus: string;
  scientificApproval: boolean;
  proposedAction: string;
  notes: string;
}

export interface CatalogReconciliationHandoff {
  schema: string;
  sourceRequestSchema: string;
  sourceCatalogVersion: string;
  proposedCatalogVersion: string;
  status: string;
  activationAllowed: boolean;
  rows: HandoffRow[];
}

/** Prerequisites that must all be met by a separate governed patch; none can be satisfied in the app. */
export const ACTIVATION_PREREQUISITES = [
  "Independent named scientific reviewer decision",
  "Supporting handbook evidence references",
  "Unit confirmation",
  "Specimen confirmation",
  "Assay / method confirmation",
  "Protocol confirmation",
  "Versioned code review of a separate activation patch",
] as const;

export type BlockReason =
  | "pending_scientific_review"
  | "p36_unit_unvalidated"
  | "p35_5_draft_no_validated_units"
  | "canonical_identity_unresolved"
  | "assay_protocol_identity_required"
  | "scale_unvalidated"
  | "protocol_unvalidated";

export const BLOCK_REASON_LABELS: Record<BlockReason, string> = {
  pending_scientific_review: `Scientific review ${REQUIRED_SCIENTIFIC_GATE}`,
  p36_unit_unvalidated: "P36 catalog has no validated unit (originalUnit null); no automatic unit approval",
  p35_5_draft_no_validated_units: "P35.5 draft catalog entry; no validated units",
  canonical_identity_unresolved: "No canonical catalog identity",
  assay_protocol_identity_required: "Requires assay/protocol identity resolution, not a string alias",
  scale_unvalidated: "Scale explicitly unvalidated",
  protocol_unvalidated: "Test protocol explicitly unvalidated",
};

/** Terms the handoff explicitly marks as needing identity resolution beyond an alias. */
const ASSAY_PROTOCOL_LABELS = new Set(["CTX", "P1NP", "PVT_MEDIAN_RT"]);
const SCALE_UNVALIDATED_IDS = new Set(["BSC-008"]);
const PROTOCOL_UNVALIDATED_LABELS = new Set(["PVT_MEDIAN_RT"]);

export interface ReconciliationRowView extends HandoffRow {
  /** Always false: no row can be activated from the app. */
  activationAllowed: false;
  blockReasons: BlockReason[];
  /** Live catalog cross-check (read-only). */
  catalogCrossCheck: {
    found: boolean;
    catalogStatus: string | null;
    catalogUnit: string | null;
  };
}

export interface ReconciliationView {
  ok: boolean;
  /** Integrity problems that make the handoff fail closed (still never activates). */
  problems: string[];
  status: typeof REQUIRED_SCIENTIFIC_GATE;
  activationAllowed: false;
  sourceCatalogVersion: string;
  proposedCatalogVersion: string;
  rows: ReconciliationRowView[];
  totalTerms: number;
  totalObservations: number;
  approvedCount: 0;
}

const P36_BY_ID = new Map(
  (p36Registry.metrics as readonly { id: string; name: string; originalUnit?: string | null; sourceClassification?: string }[]).map((m) => [m.id, m]),
);
const P355_BY_ID = new Map(
  (p355Catalog.entries as readonly { id: string; name: string; status: string }[]).map((e) => [e.id, e]),
);

/**
 * Validate the handoff and build a read-only view. Fails closed: any row that
 * claims approval, any status other than PENDING_NIKOLAS_REVIEW, or a mismatched
 * term ID is reported as a problem and the row is still blocked.
 */
export function buildReconciliationView(handoff: CatalogReconciliationHandoff = handoffJson as CatalogReconciliationHandoff): ReconciliationView {
  const problems: string[] = [];
  if (handoff.schema !== CATALOG_RECONCILIATION_HANDOFF_SCHEMA) problems.push(`Unexpected schema ${handoff.schema}`);
  if (handoff.status !== REQUIRED_SCIENTIFIC_GATE) problems.push(`Handoff status ${handoff.status} is not ${REQUIRED_SCIENTIFIC_GATE}`);
  if (handoff.activationAllowed !== false) problems.push("Handoff claims activation is allowed; refused");
  if (handoff.sourceCatalogVersion !== governedRegistry.baseCatalogVersion)
    problems.push(`Source catalog version ${handoff.sourceCatalogVersion} is not recognized`);
  if (handoff.proposedCatalogVersion !== p355Catalog.version)
    problems.push(`Proposed catalog version ${handoff.proposedCatalogVersion} does not match P35.5 ${p355Catalog.version}`);

  const seen = new Set<string>();
  const rows: ReconciliationRowView[] = (Array.isArray(handoff.rows) ? handoff.rows : []).map((row) => {
    const reasons: BlockReason[] = ["pending_scientific_review"];
    if (row.reviewStatus !== REQUIRED_SCIENTIFIC_GATE) problems.push(`${row.sourceLabel}: review status ${row.reviewStatus} is not ${REQUIRED_SCIENTIFIC_GATE}`);
    if (row.scientificApproval !== false) problems.push(`${row.sourceLabel}: claims scientific approval; refused`);
    if (termIdFor(row.sourceLabel, row.sourceUnit) !== row.termId) problems.push(`${row.sourceLabel}: term ID ${row.termId} does not match the review screen's ID`);
    if (seen.has(row.termId)) problems.push(`${row.sourceLabel}: duplicate term ID ${row.termId}`);
    seen.add(row.termId);
    if (!Number.isInteger(row.observations) || row.observations < 0) problems.push(`${row.sourceLabel}: invalid observation count`);

    let crossCheck: ReconciliationRowView["catalogCrossCheck"] = { found: false, catalogStatus: null, catalogUnit: null };
    const id = row.candidateCatalogId;
    if (row.candidateCatalogStatus === "P36_PROVISIONAL" && id) {
      const m = P36_BY_ID.get(id);
      crossCheck = { found: Boolean(m), catalogStatus: m?.sourceClassification ?? null, catalogUnit: m?.originalUnit ?? null };
      if (!m) problems.push(`${row.sourceLabel}: ${id} not found in the P36 catalog`);
      if (!m?.originalUnit) reasons.push("p36_unit_unvalidated");
    } else if (row.candidateCatalogStatus === "P35_5_DRAFT" && id) {
      const e = P355_BY_ID.get(id);
      crossCheck = { found: Boolean(e), catalogStatus: e?.status ?? null, catalogUnit: null };
      if (!e) problems.push(`${row.sourceLabel}: ${id} not found in the P35.5 draft catalog`);
      reasons.push("p35_5_draft_no_validated_units");
    } else {
      if (id) problems.push(`${row.sourceLabel}: unresolved row names a catalog ID`);
      reasons.push("canonical_identity_unresolved");
    }
    if (ASSAY_PROTOCOL_LABELS.has(row.sourceLabel)) reasons.push("assay_protocol_identity_required");
    if (id && SCALE_UNVALIDATED_IDS.has(id)) reasons.push("scale_unvalidated");
    if (PROTOCOL_UNVALIDATED_LABELS.has(row.sourceLabel)) reasons.push("protocol_unvalidated");
    return { ...row, activationAllowed: false, blockReasons: reasons, catalogCrossCheck: crossCheck };
  });

  return {
    ok: problems.length === 0,
    problems,
    status: REQUIRED_SCIENTIFIC_GATE,
    activationAllowed: false,
    sourceCatalogVersion: handoff.sourceCatalogVersion,
    proposedCatalogVersion: handoff.proposedCatalogVersion,
    rows,
    totalTerms: rows.length,
    totalObservations: rows.reduce((n, r) => n + (Number.isInteger(r.observations) ? r.observations : 0), 0),
    approvedCount: 0,
  };
}

/** Always false. A row can only become active through a separate governed activation patch. */
export function canActivateHandoffRow(_row: HandoffRow): false {
  return false;
}

/** Read-only lookup so the review list can label current-batch terms that are in the handoff. */
export function handoffRowForTerm(view: ReconciliationView, termId: string): ReconciliationRowView | undefined {
  return view.rows.find((r) => r.termId === termId);
}
