/**
 * Browser-safe input schemas for the v9.4 observation sync server functions.
 *
 * The observation schema mirrors the canonical envelope field-for-field
 * (OBSERVATION_SYNC_ALLOWED_FIELDS in observation-sync.ts) and stays strict:
 * unknown keys are refused, never stripped, so a payload is never silently
 * altered before encryption. P62: the synthetic demo `catalogBasis` is an
 * accepted envelope field with its own exact-key schema; the full envelope
 * rules (date precision, demo metric/basis pairing, synthetic-only basis) run
 * afterwards and report their specific reason instead of a generic message.
 */
import { z } from "zod";
import {
  DATED_OBSERVATION_SCHEMA,
  SYNTHETIC_DEMO_BASIS_CLASSIFICATION,
  UNIFIED_OBSERVATION_SCHEMA,
  validateUnifiedObservation,
  type UnifiedObservation,
} from "@/domain/health-intelligence/observation-envelope";
import { isExplicitInstant } from "@/domain/health-intelligence/observation-date";
import { OBSERVATION_SYNC_BATCH_MAX, OBSERVATION_SYNC_PAGE_MAX } from "@/domain/health-intelligence/observation-sync";

const id = z.string().min(1).max(128);
const iso = z.string().min(10).max(40).refine((v) => isExplicitInstant(v), "invalid instant");
export const observationSyncScopeSchema = z
  .object({ missionId: id, crewMemberId: id, provenance: z.enum(["synthetic", "real"]) })
  .strict();

/** Exact keys of the synthetic demo basis; consistency with metricId/provenance is checked by the envelope rules. */
export const catalogBasisSchema = z
  .object({
    kind: z.literal("synthetic_demo"),
    demoId: z.string().regex(/^demo:ubt-[0-9a-f]{8}$/),
    termId: z.string().regex(/^ubt-[0-9a-f]{8}$/),
    displayName: z.string().min(1).max(200),
    demoCatalogVersion: z.number().int().min(1),
    classification: z.literal(SYNTHETIC_DEMO_BASIS_CLASSIFICATION),
  })
  .strict();

export const observationSyncObservationShape = z
  .object({
    schema: z.enum([UNIFIED_OBSERVATION_SCHEMA, DATED_OBSERVATION_SCHEMA]),
    id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,127}$/),
    missionId: id,
    crewMemberId: id,
    metricId: z.string().min(1).max(128),
    domain: z.string().min(1).max(64),
    value: z.string().min(1).max(64),
    originalUnit: z.string().min(1).max(64),
    reportedUnit: z.string().min(1).max(64).optional(),
    observedAt: z.string().min(10).max(40),
    datePrecision: z.enum(["date", "instant"]).optional(),
    collectionDate: z.string().max(10).optional(),
    source: z
      .object({
        kind: z.enum(["manual", "csv", "xlsx", "json", "fhir", "pdf_text", "ocr", "device", "self_assessment"]),
        label: z.string().min(1).max(300),
        documentName: z.string().max(300).optional(),
        documentSha256: z.string().max(128).optional(),
        excerpt: z.string().max(4000).optional(),
      })
      .strict(),
    provenance: z.enum(["synthetic", "real"]),
    quality: z.object({ reviewerConfirmed: z.boolean(), duplicateWarningAcknowledged: z.boolean().optional() }).strict(),
    reviewState: z.enum(["pending_review", "accepted", "rejected"]),
    status: z.enum(["active", "erroneous"]).optional(),
    statusReason: z.string().max(500).optional(),
    supersedesId: z.string().max(128).optional(),
    correction: z
      .object({
        intentId: z.string().max(64),
        originalRecordId: z.string().max(128),
        actorUserId: z.string().uuid(),
        actorRole: z.literal("ground_medical"),
        reason: z.string().max(500),
        decidedAt: iso,
      })
      .strict()
      .optional(),
    catalogBasis: catalogBasisSchema.optional(),
    recordedAt: iso,
  })
  .strict();

export const observationSyncObservationSchema = observationSyncObservationShape.superRefine((value, ctx) => {
  const issue = validateUnifiedObservation(value as UnifiedObservation);
  if (issue) ctx.addIssue({ code: "custom", message: `Invalid observation envelope: ${issue}` });
});

const eventSchema = z
  .object({
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{7,127}:(entry|status)$/),
    eventKind: z.enum(["entry", "status"]),
    observation: observationSyncObservationSchema,
  })
  .strict();

export const observationSyncPushInput = z
  .object({ scope: observationSyncScopeSchema, events: z.array(eventSchema).max(OBSERVATION_SYNC_BATCH_MAX), realDataConfirmed: z.boolean() })
  .strict();
export const observationSyncPullInput = z
  .object({
    scope: observationSyncScopeSchema,
    afterSeq: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    limit: z.number().int().min(1).max(OBSERVATION_SYNC_PAGE_MAX),
  })
  .strict();
