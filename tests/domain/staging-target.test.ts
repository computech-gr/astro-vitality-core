import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";

function check(origin?: string, expected?: string, allowLocal = false) {
  const env: Record<string, string> = {};
  if (origin !== undefined) env["MITO_V3_STAGING_ORIGIN"] = origin;
  if (expected !== undefined) env["MITO_V3_STAGING_EXPECTED_HOST"] = expected;
  env["MITO_V3_ALLOW_LOCAL_STAGING"] = String(allowLocal);
  return spawnSync(process.execPath, ["scripts/verify-medical-v3-staging-target.mjs"], {
    env,
    encoding: "utf8",
  });
}

describe("read-only staging target policy", () => {
  test("missing independent target is blocked", () => {
    expect(check().status).toBe(2);
  });
  test("shared preview port 8080 is blocked", () => {
    expect(check("http://127.0.0.1:8080", "127.0.0.1", true).status).toBe(2);
  });
  for (const host of [
    "edocinfo.com", "mitochondria.edocinfo.com", "lovable.app", "x.lovable.app",
    "lovableproject.com", "x.lovableproject.com", "lovable.app.",
  ]) {
    test(`shared domain ${host} is blocked`, () => {
      expect(check(`https://${host}`, host).status).toBe(2);
    });
  }
  for (const host of ["localhost", "127.0.0.1"]) {
    test(`${host} requires explicit local permission even over HTTPS`, () => {
      expect(check(`https://${host}:8091`, host).status).toBe(2);
      expect(check(`http://${host}:8091`, host, true).status).toBe(0);
    });
  }
  test("local permission never enables insecure public HTTP", () => {
    expect(check("http://staging.example.org", "staging.example.org", true).status).toBe(2);
  });
  test("IPv6 requires separate review rather than implicit permission", () => {
    expect(check("https://[::1]:8091", "[::1]", true).status).toBe(2);
  });
  test("host mismatch is blocked", () => {
    expect(check("https://other.example.org", "staging.example.org").status).toBe(2);
  });
  for (const origin of [
    "https://user:password@staging.example.org", "https://staging.example.org/path",
    "https://staging.example.org?redirect=x", "https://staging.example.org#x",
  ]) {
    test(`non-origin target is blocked: ${origin}`, () => {
      expect(check(origin, "staging.example.org").status).toBe(2);
    });
  }
  test("safe string policy does not claim runtime acceptance", () => {
    const result = check("https://staging.example.org", "staging.example.org");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("browser acceptance remain UNVERIFIED");
  });
});