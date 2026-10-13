import { describe, expect, it } from "vitest";
import { parseFirstOperatorBootstrapStatus } from "@/infrastructure/first-operator-activation";

describe("FV-01-UI-02 bootstrap state fail-closed parsing", () => {
  it("accepts a complete new-install state", () => {
    expect(
      parseFirstOperatorBootstrapStatus({
        operator_exists: false,
        bootstrap_armed: true,
        bootstrap_consumed: false,
      }),
    ).toEqual({ operatorExists: false, bootstrapArmed: true, bootstrapConsumed: false });
  });
  it("does not treat incomplete or invalid responses as new deployments", () => {
    expect(parseFirstOperatorBootstrapStatus({ operator_exists: false })).toBeNull();
    expect(parseFirstOperatorBootstrapStatus(null)).toBeNull();
  });
  it("preserves already-provisioned state", () => {
    expect(
      parseFirstOperatorBootstrapStatus({
        operator_exists: true,
        bootstrap_armed: false,
        bootstrap_consumed: true,
      })?.operatorExists,
    ).toBe(true);
  });
});

describe("FV-01-UI-02 visibility scenarios (mirrors mission-identity gate)", () => {
  const visible = (s: ReturnType<typeof parseFirstOperatorBootstrapStatus>) =>
    s?.operatorExists === false && s.bootstrapArmed && !s.bootstrapConsumed;
  it("hides activation on existing production with an active operator", () => {
    expect(
      visible(
        parseFirstOperatorBootstrapStatus({
          operator_exists: true,
          bootstrap_armed: false,
          bootstrap_consumed: true,
        }),
      ),
    ).toBe(false);
  });
  it("shows activation only on a fresh, armed, unconsumed install", () => {
    expect(
      visible(
        parseFirstOperatorBootstrapStatus({
          operator_exists: false,
          bootstrap_armed: true,
          bootstrap_consumed: false,
        }),
      ),
    ).toBe(true);
  });
  it("hides activation on a fresh install that is not yet armed", () => {
    expect(
      visible(
        parseFirstOperatorBootstrapStatus({
          operator_exists: false,
          bootstrap_armed: false,
          bootstrap_consumed: false,
        }),
      ),
    ).toBe(false);
  });
  it("fails closed on error or malformed status", () => {
    expect(visible(null)).toBe(false);
    expect(
      visible(
        parseFirstOperatorBootstrapStatus({
          operator_exists: "false",
          bootstrap_armed: true,
          bootstrap_consumed: false,
        }),
      ),
    ).toBe(false);
  });
});
