/**
 * P37 SYNTHETIC DEMO catalog (pure, browser-safe). Mirrors the governed
 * lifecycle for a demonstration only: a Researcher's explicitly labelled demo
 * decision (no source-validation receipt), Ground Medical demo activation and
 * recognition of later synthetic examinations in the same mission.
 *
 * Isolation from the production catalog:
 * - separate schema, "synthetic_demo" environment and signing key; production
 *   loaders refuse it and this verifier refuses production snapshots;
 * - demo: identifiers only, synthetic provenance only, one mission per snapshot;
 * - recognition is an annotation: it never changes a row's catalog
 *   classification, never makes a row saveable and never routes it to domain
 *   read models. It only marks the row as already covered so no duplicate
 *   unknown-biomarker request is generated.
 * - matching is label + exact unit (no conversion); specimen and method are not
 *   invented, so the demo can never be mistaken for validated recognition.
 */
import { canonicalJson } from "./observation-envelope";
import { normalizeCatalogText, sha256Hex } from "./catalog-lifecycle";
import { syntheticIntakeAliasEntry } from "./p612-synthetic-intake-aliases";
import { unitNotationMatch, type UnitNotationMatch } from "./p613-unit-notation";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import {
  deriveSigningKeyFromSecret,
  signCanonicalPayload,
  verifyCanonicalPayload,
  type TrustedKey,
} from "./catalog-snapshot-signing";

export const SYNTHETIC_DEMO_SNAPSHOT_SCHEMA =
  "mitochondria.synthetic-demo-catalog-snapshot.v1" as const;
export const SIGNED_SYNTHETIC_DEMO_SCHEMA =
  "mitochondria.signed-synthetic-demo-catalog.v1" as const;
export const SYNTHETIC_DEMO_CLASSIFICATION = "SYNTHETIC_DEMO_NOT_SCIENTIFICALLY_VALIDATED" as const;
export const SYNTHETIC_DEMO_ACKNOWLEDGEMENT = "SYNTHETIC DEMO - NOT A SCIENTIFIC APPROVAL" as const;
export const SYNTHETIC_DEMO_LABEL =
  "SYNTHETIC DEMO — not a scientific approval, source validation or production catalog entry";
const DEMO_ID = /^demo:ubt-[0-9a-f]{8}$/;
const DOMAINS: readonly HealthDomainId[] = ["bone", "immune", "cardiovascular", "behavioral"];
/** Domain-separated derivation: the demo key is never the production catalog key. */
const DEMO_KEY_LABEL = "mitochondria.p37-synthetic-demo-catalog.v1:";

export interface SyntheticDemoEntryDefinition {
  demoId: string;
  displayName: string;
  aliases: string[];
  unit: string;
  domain: HealthDomainId;
  provenance: "synthetic";
  missionId: string;
  submissionId: string;
  termId: string;
  classification: typeof SYNTHETIC_DEMO_CLASSIFICATION;
  sourceDocumentSha256: string[];
}
export interface SyntheticDemoEntry extends SyntheticDemoEntryDefinition {
  status: "ACTIVE" | "REVOKED";
  decision: { decisionEventId: string; decidedAt: string; entrySha256: string };
  activation: { activationEventId: string; activatedAt: string; demoCatalogVersion: number };
  revocation: {
    revocationEventId: string;
    revokedAt: string;
    reason: string;
    demoCatalogVersion: number;
  } | null;
}
export interface SyntheticDemoSnapshot {
  schema: typeof SYNTHETIC_DEMO_SNAPSHOT_SCHEMA;
  environment: "synthetic_demo";
  missionId: string;
  demoCatalogVersion: number;
  issuedAt: string;
  entries: SyntheticDemoEntry[];
}
export interface SignedSyntheticDemoSnapshot {
  schema: typeof SIGNED_SYNTHETIC_DEMO_SCHEMA;
  keyId: string;
  signature: string;
  snapshot: SyntheticDemoSnapshot;
}

/** Shape returned by p37_demo_catalog_snapshot_v1 (identities never included). */
export interface DemoSnapshotRpc {
  mission_id: string;
  demo_catalog_version: number;
  entries: SyntheticDemoEntry[];
}

export function demoSnapshotFromRpc(rpc: DemoSnapshotRpc, issuedAt: string): SyntheticDemoSnapshot {
  return {
    schema: SYNTHETIC_DEMO_SNAPSHOT_SCHEMA,
    environment: "synthetic_demo",
    missionId: rpc.mission_id,
    demoCatalogVersion: Number(rpc.demo_catalog_version) || 0,
    issuedAt,
    entries: (rpc.entries ?? []).map((e) => ({
      demoId: e.demoId,
      displayName: e.displayName,
      aliases: [...e.aliases],
      unit: e.unit,
      domain: e.domain,
      provenance: e.provenance,
      missionId: e.missionId,
      submissionId: e.submissionId,
      termId: e.termId,
      classification: e.classification,
      sourceDocumentSha256: [...(e.sourceDocumentSha256 ?? [])],
      status: e.status,
      decision: { ...e.decision },
      activation: {
        ...e.activation,
        demoCatalogVersion: Number(e.activation.demoCatalogVersion),
      },
      revocation: e.revocation
        ? { ...e.revocation, demoCatalogVersion: Number(e.revocation.demoCatalogVersion) }
        : null,
    })),
  };
}

/** SHA-256 of the canonical demo definition, for display and integrity checks. */
export const demoDefinitionSha256 = (d: SyntheticDemoEntryDefinition) =>
  sha256Hex(canonicalJson(d));

export async function deriveSyntheticDemoSigningKey(secret: string) {
  if (typeof secret !== "string" || secret.length < 32) throw new Error("signing secret too short");
  return deriveSigningKeyFromSecret(DEMO_KEY_LABEL + secret);
}

export async function signSyntheticDemoSnapshot(
  snapshot: SyntheticDemoSnapshot,
  keyId: string,
  privateKey: CryptoKey,
): Promise<SignedSyntheticDemoSnapshot> {
  return {
    schema: SIGNED_SYNTHETIC_DEMO_SCHEMA,
    keyId,
    signature: await signCanonicalPayload(snapshot, privateKey),
    snapshot,
  };
}

export type DemoVerifyResult =
  { ok: true; snapshot: SyntheticDemoSnapshot } | { ok: false; reason: string };

/** Only a synthetic_demo key may sign a demo snapshot, and only a demo snapshot verifies here. */
export async function verifySyntheticDemoSnapshot(
  signed: unknown,
  trustedKeys: readonly TrustedKey[],
): Promise<DemoVerifyResult> {
  const s = signed as SignedSyntheticDemoSnapshot | null;
  if (
    !s ||
    s.schema !== SIGNED_SYNTHETIC_DEMO_SCHEMA ||
    typeof s.signature !== "string" ||
    !s.snapshot
  )
    return { ok: false, reason: "Not a signed synthetic demo catalog." };
  const snap = s.snapshot;
  if (
    snap.schema !== SYNTHETIC_DEMO_SNAPSHOT_SCHEMA ||
    snap.environment !== "synthetic_demo" ||
    typeof snap.missionId !== "string" ||
    !snap.missionId ||
    !Number.isInteger(snap.demoCatalogVersion) ||
    snap.demoCatalogVersion < 0 ||
    !Array.isArray(snap.entries)
  )
    return { ok: false, reason: "Synthetic demo catalog schema is not supported." };
  const key = trustedKeys.find((k) => k.keyId === s.keyId);
  if (!key) return { ok: false, reason: "Synthetic demo catalog is signed by an untrusted key." };
  if (key.environment !== "synthetic_demo")
    return { ok: false, reason: "This key may not sign synthetic demo catalogs." };
  return (await verifyCanonicalPayload(snap, s.signature, key.publicKeySpkiBase64))
    ? { ok: true, snapshot: snap }
    : { ok: false, reason: "Synthetic demo catalog failed integrity verification." };
}

export interface EvaluatedDemoCatalog {
  missionId: string;
  demoCatalogVersion: number;
  active: SyntheticDemoEntry[];
  revoked: SyntheticDemoEntry[];
  excluded: { demoId: string; reason: string }[];
}

const demoKeys = (e: SyntheticDemoEntryDefinition) =>
  [e.displayName, ...e.aliases].map((a) => `${normalizeCatalogText(a)}|${e.unit.trim()}`);

/** Fail closed: malformed, non-synthetic, other-mission or mutually conflicting entries never match. */
export function evaluateSyntheticDemoSnapshot(s: SyntheticDemoSnapshot): EvaluatedDemoCatalog {
  const excluded: EvaluatedDemoCatalog["excluded"] = [];
  const ok: SyntheticDemoEntry[] = [];
  const revoked: SyntheticDemoEntry[] = [];
  for (const e of s.entries) {
    const bad = !DEMO_ID.test(e.demoId)
      ? "Invalid demo identifier"
      : e.provenance !== "synthetic"
        ? "Not synthetic"
        : e.classification !== SYNTHETIC_DEMO_CLASSIFICATION
          ? "Missing synthetic demo classification"
          : e.missionId !== s.missionId
            ? "Entry belongs to another mission"
            : !e.unit?.trim()
              ? "Exact unit required"
              : !Array.isArray(e.aliases) || !e.aliases.some((a) => a.trim())
                ? "No observed label"
                : !DOMAINS.includes(e.domain)
                  ? "Unknown domain"
                  : null;
    if (bad) {
      excluded.push({ demoId: e.demoId, reason: bad });
      continue;
    }
    if (e.status === "ACTIVE") ok.push(e);
    else revoked.push(e);
  }
  const active = ok.filter((c) => {
    const keys = new Set(demoKeys(c));
    const clash = ok.some(
      (o) => o !== c && (o.demoId === c.demoId || demoKeys(o).some((k) => keys.has(k))),
    );
    if (clash)
      excluded.push({ demoId: c.demoId, reason: "Conflicts with another active demo entry" });
    return !clash;
  });
  return {
    missionId: s.missionId,
    demoCatalogVersion: s.demoCatalogVersion,
    active,
    revoked,
    excluded,
  };
}

export interface DemoRecognitionInput {
  label: string;
  unit: string;
  provenance?: "synthetic" | "real" | undefined;
  missionId?: string | undefined;
  sourceValidation?: "unvalidated" | undefined;
}
export type SyntheticDemoRecognition = {
  status: "SYNTHETIC_DEMO_RECOGNIZED";
  demoId: string;
  displayName: string;
  unit: string;
  domain: HealthDomainId;
  missionId: string;
  demoCatalogVersion: number;
  termId: string;
  /** P61.2: set when an owner-directed synthetic intake alias (pending Researcher review) named the entry. */
  intakeAlias?: { alias: string; basis: string } | undefined;
  /**
   * P61.3: set when the reported unit is the entry's unit written in another notation (closed rule list,
   * synthetic only, pending Researcher confirmation). `unit` is the entry's notation; nothing is converted.
   */
  unitNotation?: UnitNotationMatch | undefined;
};
export type DemoRecognitionResult =
  SyntheticDemoRecognition | { status: "UNKNOWN"; reason: string };

/**
 * Recorded on every observation saved through a SYNTHETIC DEMO entry, so the
 * stored record stays self-describing (and labelled) even after revocation.
 */
export interface SyntheticDemoCatalogBasis {
  kind: "synthetic_demo";
  demoId: string;
  termId: string;
  displayName: string;
  demoCatalogVersion: number;
  classification: typeof SYNTHETIC_DEMO_CLASSIFICATION;
}

export const isSyntheticDemoMetricId = (id: string) => DEMO_ID.test(id);

export function syntheticDemoBasisFor(
  e: SyntheticDemoEntry,
  demoCatalogVersion: number,
): SyntheticDemoCatalogBasis {
  return {
    kind: "synthetic_demo",
    demoId: e.demoId,
    termId: e.termId,
    displayName: e.displayName,
    demoCatalogVersion,
    classification: SYNTHETIC_DEMO_CLASSIFICATION,
  };
}

/**
 * Canonical re-validation of an already-assigned demo ID (stored records, sync,
 * corrections): same mission, synthetic only, exact unit. Revoked entries count
 * only when explicitly requested (history), never for new recognition.
 */
export function canonicalSyntheticDemoEntry(
  input: { demoId: string; unit: string; missionId?: string | undefined; provenance?: string },
  catalogs: ReadonlyMap<string, EvaluatedDemoCatalog>,
  includeRevoked = false,
): SyntheticDemoEntry | null {
  if (input.provenance !== "synthetic" || !input.missionId || !DEMO_ID.test(input.demoId))
    return null;
  const catalog = catalogs.get(input.missionId);
  if (!catalog) return null;
  const same = (e: SyntheticDemoEntry) =>
    e.demoId === input.demoId && e.missionId === input.missionId && e.unit === input.unit.trim();
  const active = catalog.active.filter(same);
  if (active.length === 1) return active[0]!;
  if (active.length > 1 || !includeRevoked) return null;
  // A demo ID may have been activated, revoked and re-activated; history only needs one consistent definition.
  const revoked = catalog.revoked.filter(same);
  const domains = new Set(revoked.map((e) => e.domain));
  return revoked.length && domains.size === 1 ? revoked[revoked.length - 1]! : null;
}

/** Label + exact unit within the same mission, synthetic provenance only, never for source-unvalidated rows. */
export function recognizeSyntheticDemo(
  input: DemoRecognitionInput,
  catalogs: ReadonlyMap<string, EvaluatedDemoCatalog>,
): DemoRecognitionResult {
  if (input.provenance !== "synthetic")
    return {
      status: "UNKNOWN",
      reason: "Synthetic demo recognition applies to synthetic data only.",
    };
  if (input.sourceValidation === "unvalidated")
    return { status: "UNKNOWN", reason: "The source marks this row unvalidated." };
  const catalog = input.missionId ? catalogs.get(input.missionId) : undefined;
  if (!catalog)
    return { status: "UNKNOWN", reason: "No verified synthetic demo catalog for this mission." };
  const label = normalizeCatalogText(input.label);
  const unit = input.unit.trim();
  const named = catalog.active.filter((e) =>
    [e.displayName, ...e.aliases].some((a) => normalizeCatalogText(a) === label),
  );
  if (!named.length) {
    // P61.2: owner-directed alias to an active entry with the identical unit (never a unit equivalence).
    const viaAlias = syntheticIntakeAliasEntry({ label: input.label, unit, missionId: catalog.missionId }, catalog);
    if (viaAlias) {
      const e = viaAlias.entry;
      return {
        status: "SYNTHETIC_DEMO_RECOGNIZED",
        demoId: e.demoId,
        displayName: e.displayName,
        unit: e.unit,
        domain: e.domain,
        missionId: e.missionId,
        demoCatalogVersion: catalog.demoCatalogVersion,
        termId: e.termId,
        intakeAlias: { alias: viaAlias.alias.alias, basis: viaAlias.alias.basis },
      };
    }
    return { status: "UNKNOWN", reason: "No active synthetic demo entry for this label." };
  }
  const exact = named.filter((e) => e.unit.trim() === unit);
  if (!exact.length) {
    // P61.3: the same unit written in another notation (closed typographic rules, never a conversion).
    const notation = named.flatMap((e) => {
      const m = unitNotationMatch(unit, e.unit);
      return m ? [{ e, m }] : [];
    });
    if (notation.length === 1) {
      const { e, m } = notation[0]!;
      return {
        status: "SYNTHETIC_DEMO_RECOGNIZED",
        demoId: e.demoId,
        displayName: e.displayName,
        unit: e.unit,
        domain: e.domain,
        missionId: e.missionId,
        demoCatalogVersion: catalog.demoCatalogVersion,
        termId: e.termId,
        unitNotation: m,
      };
    }
    return {
      status: "UNKNOWN",
      reason: notation.length > 1 ? "Ambiguous synthetic demo match." : "Unit differs from the demo entry; units are never converted.",
    };
  }
  if (exact.length > 1) return { status: "UNKNOWN", reason: "Ambiguous synthetic demo match." };
  const e = exact[0]!;
  return {
    status: "SYNTHETIC_DEMO_RECOGNIZED",
    demoId: e.demoId,
    displayName: e.displayName,
    unit: e.unit,
    domain: e.domain,
    missionId: e.missionId,
    demoCatalogVersion: catalog.demoCatalogVersion,
    termId: e.termId,
  };
}
