/**
 * P72.7 regression: the Scientific Review "display-sync" hydration error.
 *
 * Original failure (P72.6 Preview run): React reported "Hydration failed because the
 * server rendered text didn't match the client" inside BiomarkerInterpretationReview —
 * the server HTML said 416 open review tasks while the client's hydration render said
 * 437. The server never has device catalogs, but the component read the device's
 * synthetic demo catalog runtime during its first render; when the verified demo
 * snapshot finished loading before that part of the page hydrated, the first client
 * render counted the activated demo identities and no longer matched the server HTML.
 *
 * renderToStaticMarkup is the same render React performs for the server HTML and for
 * the hydration pass (it uses useSyncExternalStore's server snapshot), so the markup
 * produced with a loaded device catalog must be identical to the markup produced with
 * none. Before the fix these two renders differed.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";

import { BiomarkerInterpretationReview } from "@/components/biomarker-interpretation-review";
import { useActiveCatalog, useSyntheticDemoCatalogs } from "@/hooks/use-device-catalogs";
import {
  SYNTHETIC_DEMO_CLASSIFICATION,
  signSyntheticDemoSnapshot,
  type SyntheticDemoEntry,
} from "@/domain/health-intelligence/synthetic-demo-catalog";
import {
  getSyntheticDemoCatalogs,
  installOfferedDemoCatalog,
  resetSyntheticDemoCatalogsForTests,
} from "@/domain/health-intelligence/synthetic-demo-catalog-runtime";
import { generateTestSigningKey, type TrustedKey } from "@/domain/health-intelligence/catalog-snapshot-signing";
import type { SnapshotStorage } from "@/domain/health-intelligence/active-catalog-runtime";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MISSION = "mission-p727-hydration";

function html(el: ReactElement): string {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ["/"] }) });
  return renderToStaticMarkup(createElement(RouterContextProvider, { router } as never, el));
}

function entry(n: number): SyntheticDemoEntry {
  const hex = n.toString(16).padStart(8, "7");
  return {
    demoId: `demo:ubt-${hex}`,
    displayName: `P72.7 synthetic hydration marker ${n}`,
    aliases: [`P727 hydration marker ${n}`],
    unit: "ng/mL",
    domain: "bone",
    provenance: "synthetic",
    missionId: MISSION,
    submissionId: "00000000-0000-4000-8000-000000000727",
    termId: `ubt-${hex}`,
    classification: SYNTHETIC_DEMO_CLASSIFICATION,
    sourceDocumentSha256: ["a".repeat(64)],
    status: "ACTIVE",
    decision: { decisionEventId: `d${n}`, decidedAt: "2026-11-15T00:00:00Z", entrySha256: "b".repeat(64) },
    activation: { activationEventId: `a${n}`, activatedAt: "2026-11-15T00:01:00Z", demoCatalogVersion: 2 },
    revocation: null,
  };
}

async function loadDeviceDemoCatalog(count: number) {
  const k = await generateTestSigningKey("test-p727-hydration");
  const trusted: TrustedKey = { ...k.trusted, environment: "synthetic_demo" };
  const map = new Map<string, string>();
  const storage: SnapshotStorage = { get: (key) => map.get(key) ?? null, set: (key, v) => void map.set(key, v) };
  const signed = await signSyntheticDemoSnapshot(
    {
      schema: "mitochondria.synthetic-demo-catalog-snapshot.v1",
      environment: "synthetic_demo",
      missionId: MISSION,
      demoCatalogVersion: 2,
      issuedAt: "2026-11-15T00:02:00Z",
      entries: Array.from({ length: count }, (_, i) => entry(i + 1)),
    },
    trusted.keyId,
    k.privateKey,
  );
  const res = await installOfferedDemoCatalog(signed, MISSION, { storage, trustedKeys: [trusted] });
  expect(res.installed).toBe(true);
  expect(getSyntheticDemoCatalogs().get(MISSION)?.active.length).toBe(count);
}

function Probe() {
  const demo = useSyntheticDemoCatalogs();
  const active = useActiveCatalog();
  return createElement("p", null, `demo missions ${demo.size} · active ${active.active.length}`);
}

afterEach(() => resetSyntheticDemoCatalogsForTests());

describe("P72.7 Scientific Review display-sync (hydration) regression", () => {
  test("Biomarker interpretation review renders the same first markup with or without a loaded device catalog", async () => {
    resetSyntheticDemoCatalogsForTests();
    const serverHtml = html(createElement(BiomarkerInterpretationReview));
    await loadDeviceDemoCatalog(21);
    const hydrationHtml = html(createElement(BiomarkerInterpretationReview));
    expect(hydrationHtml).toBe(serverHtml);
  });

  test("the shared device-catalog hooks start from the empty server value", async () => {
    await loadDeviceDemoCatalog(3);
    expect(html(createElement(Probe))).toBe("<p>demo missions 0 · active 0</p>");
  });

  test("no component passes the live device-catalog getter as the server snapshot", () => {
    const files = [
      "src/components/biomarker-interpretation-review.tsx",
      "src/components/p37-catalog-panel.tsx",
      "src/components/p37-synthetic-demo-panel.tsx",
      "src/components/p614-held-mapping-queue.tsx",
      "src/components/p614-mapping-governance-panel.tsx",
      "src/components/unified-intake-workspace.tsx",
    ];
    for (const f of files) {
      const src = readFileSync(resolve(root, f), "utf8");
      expect(src).not.toMatch(/getSyntheticDemoCatalogs,\s*getSyntheticDemoCatalogs/);
      expect(src).not.toMatch(/getActiveCatalog,\s*getActiveCatalog/);
      expect(src).not.toMatch(/useSyncExternalStore\(\s*subscribe(SyntheticDemoCatalogs|ActiveCatalog)/);
    }
  });
});
