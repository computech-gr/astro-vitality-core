import { describe, expect, test } from "bun:test";
import { SYNTHETIC_DEMO_JOURNEY } from "../../src/components/mission-demo-launchpad";

describe("P35.11 synthetic demo launchpad", () => {
  test("has unique, internal mission routes", () => {
    const routes = SYNTHETIC_DEMO_JOURNEY.map((step) => step.href);
    expect(new Set(routes).size).toBe(routes.length);
    expect(routes.every((route) => route.startsWith("/mission/"))).toBe(true);
  });
  test("keeps independent review visible but not elevated", () => {
    expect(SYNTHETIC_DEMO_JOURNEY.find((step) => step.href === "/mission/ground")?.purpose).toContain("Independent Ground Medical");
  });
});
