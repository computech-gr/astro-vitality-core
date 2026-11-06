import { describe, expect, test } from "bun:test";
import {
  VERIFIED_REVISIONS_SCHEMA,
  isVerifiedRevision,
  loadVerifiedRevisions,
} from "@/domain/health-intelligence/p36-verified-revisions";

const validRevision = {
  revision: "a".repeat(40),
  verifiedAt: "2026-11-06T12:00:00.000Z",
  verifier: "ci-workflow",
  evidenceRefs: ["ci-run:https://example.invalid/run/1"],
};

function registry(revisions: unknown[], extra: Record<string, unknown> = {}) {
  return { schema: VERIFIED_REVISIONS_SCHEMA, governance: "governed", revisions, ...extra };
}

describe("p36 verified revisions registry", () => {
  test("bundled registry is valid and empty: promotion preparation stays unavailable", () => {
    const view = loadVerifiedRevisions();
    expect(view.problems).toEqual([]);
    expect(view.revisions).toEqual([]);
  });

  test("a well-formed revision loads", () => {
    const view = loadVerifiedRevisions(registry([validRevision]));
    expect(view.problems).toEqual([]);
    expect(view.revisions).toHaveLength(1);
    expect(isVerifiedRevision("a".repeat(40), view)).toBe(true);
  });

  test("fabricated, uppercase or truncated revisions are rejected fail-closed", () => {
    for (const bad of ["b".repeat(40), "A".repeat(40), "a".repeat(39), "a".repeat(41), "not-a-commit"]) {
      const view = loadVerifiedRevisions(registry([{ ...validRevision, revision: bad }]));
      expect(view.revisions).toEqual([]);
      expect(view.problems.length).toBeGreaterThan(0);
    }
  });

  test("revisions without evidence or verifier are rejected", () => {
    expect(loadVerifiedRevisions(registry([{ ...validRevision, evidenceRefs: [] }])).revisions).toEqual([]);
    expect(loadVerifiedRevisions(registry([{ ...validRevision, verifier: "" }])).revisions).toEqual([]);
    expect(loadVerifiedRevisions(registry([{ ...validRevision, verifiedAt: "not-a-date" }])).revisions).toEqual([]);
  });

  test("unknown fields and wrong schema fail closed", () => {
    expect(loadVerifiedRevisions(registry([{ ...validRevision, injected: true }])).revisions).toEqual([]);
    expect(loadVerifiedRevisions({ ...registry([validRevision]), schema: "other" }).revisions).toEqual([]);
    expect(loadVerifiedRevisions(null).revisions).toEqual([]);
  });

  test("duplicate revisions are rejected individually without hiding tampering", () => {
    const view = loadVerifiedRevisions(registry([validRevision, validRevision]));
    expect(view.revisions).toHaveLength(1);
    expect(view.problems.some((p) => p.includes("duplicate"))).toBe(true);
  });

  test("isVerifiedRevision never matches an unregistered revision", () => {
    const view = loadVerifiedRevisions(registry([validRevision]));
    expect(isVerifiedRevision("c".repeat(40), view)).toBe(false);
    expect(isVerifiedRevision("", view)).toBe(false);
  });
});
