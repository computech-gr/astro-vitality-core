import { useEffect, useState } from "react";
import type { InterpretationSnapshot } from "@/domain/health-intelligence/biomarker-interpretation";
import {
  loadVerifiedInterpretationSnapshot,
  registryInterpretationSnapshot,
} from "@/domain/health-intelligence/biomarker-interpretation-ledger";

const EVENT = "mitochondria:interpretation-changed";

/** Notify every open view (this tab and others) that interpretation review events changed. */
export function notifyInterpretationChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    localStorage.setItem(EVENT, String(Date.now()));
  } catch {
    /* storage unavailable: same-tab notification still works */
  }
}

/**
 * Last verified local interpretation snapshot (bundled registry + chain-verified
 * device events). Works offline; until the encrypted ledger is read, the
 * registry-only snapshot is used so reports never invent approvals.
 */
export function useInterpretationSnapshot(): { snapshot: InterpretationSnapshot; state: "registry_only" | "verified" | "error" } {
  const [value, setValue] = useState<{ snapshot: InterpretationSnapshot; state: "registry_only" | "verified" | "error" }>(() => ({
    snapshot: registryInterpretationSnapshot(),
    state: "registry_only",
  }));
  useEffect(() => {
    let active = true;
    const load = () =>
      void loadVerifiedInterpretationSnapshot()
        .then((snapshot) => active && setValue({ snapshot, state: "verified" }))
        .catch(() => active && setValue({ snapshot: registryInterpretationSnapshot(), state: "error" }));
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
  }, []);
  return value;
}
