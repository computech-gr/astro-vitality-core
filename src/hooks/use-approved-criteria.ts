import { useEffect, useState } from "react";
import type { CriteriaReviewResolution } from "@/domain/health-intelligence/p57-criteria-review";

const EVENT = "mitochondria:reference-criteria-changed";

/** Notify every open view (this tab and others) that reference-criteria decisions changed. */
export function notifyCriteriaChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    localStorage.setItem(EVENT, String(Date.now()));
  } catch {
    /* same-tab notification still works */
  }
}

const EMPTY: CriteriaReviewResolution = { chainOk: true, problem: null, states: [], approved: [] };

/**
 * Chain-verified, server-attested P57 decisions from the encrypted local ledger.
 * Until the ledger is read (and on any error) NO criterion is approved, so
 * reports never colour a result from an unverified approval.
 */
export function useCriteriaResolution(): { resolution: CriteriaReviewResolution; state: "loading" | "verified" | "error"; reload: () => void } {
  const [value, setValue] = useState<{ resolution: CriteriaReviewResolution; state: "loading" | "verified" | "error" }>({ resolution: EMPTY, state: "loading" });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () =>
      void import("@/domain/health-intelligence/p57-criteria-ledger")
        .then((m) => m.loadCriteriaResolution())
        .then((resolution) => active && setValue({ resolution, state: "verified" }))
        .catch(() => active && setValue({ resolution: EMPTY, state: "error" }));
    load();
    const onStorage = (e: StorageEvent) => e.key === EVENT && load();
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tick]);
  return { ...value, reload: () => setTick((t) => t + 1) };
}
