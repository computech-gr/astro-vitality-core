import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applySecurityHeaders, buildContentSecurityPolicy } from "@/security";

describe("P16 Security & Safety Hardening", () => {
  test("security headers deny framing and reduce browser authority", () => {
    const request = new Request("https://mitochondria.edocinfo.com/mission/ground");
    const response = applySecurityHeaders(request, new Response("ok"));
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=31536000");
    const permissionsPolicy = response.headers.get("permissions-policy") ?? "";
    expect(permissionsPolicy).toContain("camera=(self)");
    expect(permissionsPolicy).toContain("accelerometer=(self)");
    expect(permissionsPolicy).toContain("gyroscope=(self)");
    expect(permissionsPolicy).toContain("microphone=()");
    expect(permissionsPolicy).not.toContain("camera=()");
    expect(buildContentSecurityPolicy()).toContain("frame-ancestors 'none'");
  });

  test("media may load only from this site and the public GitHub raw host", () => {
    const media = buildContentSecurityPolicy()
      .split("; ")
      .find((directive) => directive.startsWith("media-src "));
    expect(media).toBe("media-src 'self' https://raw.githubusercontent.com");
  });

  test("frames may embed only the Office Online presentation viewer", () => {
    const frame = buildContentSecurityPolicy()
      .split("; ")
      .find((directive) => directive.startsWith("frame-src "));
    expect(frame).toBe("frame-src https://view.officeapps.live.com");
  });

  test("HSTS is not asserted for non-canonical preview hosts", () => {
    const response = applySecurityHeaders(
      new Request("https://preview.example.test/"),
      new Response("ok"),
    );
    expect(response.headers.get("strict-transport-security")).toBeNull();
  });

  test("hardening migration fails closed on misuse-sensitive paths", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260919170410_cfadc7d4-72db-42ad-a76e-4181cc0c70f4.sql",
      ),
      "utf8",
    ).toLowerCase();
    for (const required of [
      "mission operator event scope denied",
      "payload too large",
      "unsupported event kind",
      "invalid idempotency key",
      "status','conflict",
      "deidentify_research_jsonb",
      "security definer",
      "set search_path = public, pg_temp",
    ]) {
      expect(sql).toContain(required);
    }
    expect(sql).not.toMatch(/grant\s+execute[\s\S]{0,180}\s+to\s+(public|anon)\b/);
  });
});
