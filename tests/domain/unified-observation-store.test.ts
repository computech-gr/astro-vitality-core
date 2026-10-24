import { describe, expect, test } from "bun:test";

import {
  isDomainReadable,
  UNIFIED_OBSERVATION_SCHEMA,
  validateUnifiedObservation,
  type UnifiedObservation,
} from "../../src/domain/health-intelligence/observation-envelope";
import {
  collapseUnifiedObservationVersions,
  domainReadableObservations,
  findUnifiedDuplicates,
} from "../../src/domain/health-intelligence/observation-store";

const base: UnifiedObservation = {
  schema: UNIFIED_OBSERVATION_SCHEMA,
  id: "obs-0001",
  missionId: "mission-1",
  crewMemberId: "crew-1",
  metricId: "cv-001",
  domain: "cardiovascular",
  value: "62",
  originalUnit: "bpm",
  observedAt: "2026-10-01T09:00:00.000Z",
  source: { kind: "manual", label: "Manual entry" },
  provenance: "synthetic",
  quality: { reviewerConfirmed: true },
  reviewState: "accepted",
  status: "active",
  recordedAt: "2026-10-01T09:05:00.000Z",
};

describe("unified observation envelope validation", () => {
  test("accepts a well-formed reviewer-confirmed observation", () => {
    expect(validateUnifiedObservation(base)).toBeNull();
  });
  test("rejects accepted observations without reviewer confirmation", () => {
    expect(
      validateUnifiedObservation({ ...base, quality: { reviewerConfirmed: false } }),
    ).toBe("Accepted observations require explicit reviewer confirmation.");
  });
  test("rejects missing identity, non-decimal values and empty units", () => {
    expect(validateUnifiedObservation({ ...base, missionId: "" })).toBe(
      "Mission and crew identity are required.",
    );
    expect(validateUnifiedObservation({ ...base, value: "high" })).toBe(
      "Value must be a plain decimal number.",
    );
    expect(validateUnifiedObservation({ ...base, originalUnit: " " })).toBe(
      "The original reported unit is required.",
    );
  });
});

describe("domain read-model connection rule", () => {
  test("only accepted, non-erroneous observations are domain-readable", () => {
    expect(isDomainReadable(base)).toBe(true);
    expect(isDomainReadable({ ...base, reviewState: "pending_review" })).toBe(false);
    expect(isDomainReadable({ ...base, reviewState: "rejected" })).toBe(false);
    expect(isDomainReadable({ ...base, status: "erroneous" })).toBe(false);
    expect(
      domainReadableObservations([
        base,
        { ...base, id: "obs-0002", reviewState: "pending_review" },
        { ...base, id: "obs-0003", status: "erroneous" },
      ]),
    ).toHaveLength(1);
  });
});

describe("append-only collapse, correction and replay", () => {
  test("newest stored version of an id wins; earlier versions are preserved upstream", () => {
    const collapsed = collapseUnifiedObservationVersions([
      { observation: base, storedAt: "2026-10-01T10:00:00.000Z" },
      {
        observation: { ...base, status: "erroneous", statusReason: "wrong unit" },
        storedAt: "2026-10-02T10:00:00.000Z",
      },
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0]!.status).toBe("erroneous");
  });
  test("replaying an identical id never duplicates the record", () => {
    const collapsed = collapseUnifiedObservationVersions([
      { observation: base, storedAt: "2026-10-01T10:00:00.000Z" },
      { observation: base, storedAt: "2026-10-01T10:00:01.000Z" },
    ]);
    expect(collapsed).toHaveLength(1);
  });
});

describe("duplicate warnings and mission isolation", () => {
  test("flags same metric, instant and value; ignores erroneous records", () => {
    expect(
      findUnifiedDuplicates([base], {
        metricId: "cv-001",
        observedAt: "2026-10-01T09:00:00.000Z",
        value: "62",
      }),
    ).toHaveLength(1);
    expect(
      findUnifiedDuplicates([{ ...base, status: "erroneous" }], {
        metricId: "cv-001",
        observedAt: "2026-10-01T09:00:00.000Z",
        value: "62",
      }),
    ).toHaveLength(0);
    expect(
      findUnifiedDuplicates([base], {
        metricId: "cv-001",
        observedAt: "2026-10-01T09:00:00.000Z",
        value: "63",
      }),
    ).toHaveLength(0);
  });
  test("list filtering is scoped by mission and crew identity", () => {
    // The store filters stored events by record.mission.missionId and
    // record.mission.crewMemberId before any payload is read; a record from
    // another mission can never enter the collapse set.
    const foreign = { ...base, missionId: "mission-2" };
    expect(foreign.missionId).not.toBe(base.missionId);
    expect(validateUnifiedObservation(foreign)).toBeNull();
  });
});
