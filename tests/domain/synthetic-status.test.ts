import { describe, expect, test } from "bun:test";
import {
  classifySyntheticStatusError, syntheticStatusFailure, operatorDeploymentRevision,
} from "../../src/domain/health-intelligence/synthetic-status";

describe("synthetic status diagnostics never attest authorization", () => {
  test("scope denial is distinguished from an internal exception", () => {
    expect(classifySyntheticStatusError({ code: "P0001", message: "scope denied" })).toBe("access_denied");
    expect(classifySyntheticStatusError({ code: "P0001", message: "private database detail" })).toBe("service_failure");
  });
  test("permission and expired-session failures are access denials", () => {
    for (const code of ["42501", "PGRST301", "PGRST302"]) {
      expect(classifySyntheticStatusError({ code })).toBe("access_denied");
    }
  });
  test("transport and unrelated database failures stay unavailable", () => {
    expect(classifySyntheticStatusError(new Error("private host"))).toBe("service_failure");
    expect(classifySyntheticStatusError({ code: "42883", message: "private function" })).toBe("service_failure");
    expect(classifySyntheticStatusError(null)).toBe("service_failure");
  });
  test("malformed status stays invalid rather than becoming authorized", () => {
    expect(syntheticStatusFailure(null, false)).toBe("invalid_response");
    expect(syntheticStatusFailure({ code: "42501" }, true)).toBe("access_denied");
    expect(syntheticStatusFailure(null, true)).toBeNull();
  });
  test("revision metadata accepts only the existing lowercase 40-hex contract", () => {
    const revision = "0123456789abcdef0123456789abcdef01234567";
    expect(operatorDeploymentRevision(revision)).toBe(revision);
    for (const invalid of [undefined, "", revision.toUpperCase(), revision.slice(1), "unattested"]) {
      expect(operatorDeploymentRevision(invalid)).toBeNull();
    }
  });
});