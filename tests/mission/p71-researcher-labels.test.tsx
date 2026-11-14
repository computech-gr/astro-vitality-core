import { describe, expect, test } from "bun:test";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } from "@tanstack/react-router";

import { BoneHandbookReference, CardiovascularHandbookReference } from "@/components/scientific-handbook-reference";
import { HealthDomainWorkspace } from "@/components/health-domain-workspace";
import { P35FinalAcceptance } from "@/components/p35-final-acceptance";
import { ProjectRoadmap } from "@/components/project-roadmap";
import { HEALTH_DOMAINS } from "@/domain/health-domains/registry";
import { MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";
import { buildFinalDemoReadiness } from "@/domain/mission-access/final-demo-readiness";
import { getDemoAcceptanceGates } from "@/domain/mission-access/offline-demo-acceptance";
import { buildScientificReviewDossiers } from "@/domain/health-intelligence/p36-scientific-review";
import { containsReviewerName, researcherDisplayStatus, researcherDisplayText } from "@/domain/scientific-localization/researcher-display";
import { redactProhibitedNames } from "@/domain/health-intelligence/report-identity-redaction";

function html(el: ReactElement, path = "/"): string {
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: [path] }) });
  // Link targets keep the real repository file paths (traceability); everything
  // shown to the reader — text, aria-labels, titles — must not carry the name.
  return renderToStaticMarkup(createElement(RouterContextProvider, { router } as never, el)).replace(/ href="[^"]*"/g, "");
}

describe("P71 Researcher display wording", () => {
  test("Latin and Greek name forms become Researcher wording", () => {
    expect(researcherDisplayText("Nikolas's source lists hsCRP")).toBe("The Researcher's source lists hsCRP");
    expect(researcherDisplayText("while NIKOLAS's source lists min.")).toBe("while the Researcher's source lists min.");
    expect(researcherDisplayText("Handbook (Nikolas) — English")).toBe("Handbook (Researcher) — English");
    expect(researcherDisplayText("Νικόλας review; Νικόλαος notes; Nikolaos; Nicholas; Nickolas")).toBe("Researcher review; Researcher notes; Researcher; Researcher; Researcher");
    expect(researcherDisplayText("nikolas:IMM-NIK-082")).toBe("researcher:IMM-NIK-082");
    for (const s of ["Nikolas", "nikolas", "Νικόλας", "Νικόλαος", "NICHOLAS"]) expect(containsReviewerName(researcherDisplayText(`x ${s} y`))).toBe(false);
  });

  test("the internal gate identifier is shown as PENDING_SCIENTIFIC_REVIEW but never changed elsewhere", () => {
    expect(researcherDisplayStatus("PENDING_NIKOLAS_REVIEW")).toBe("PENDING_SCIENTIFIC_REVIEW");
    expect(researcherDisplayStatus("SCIENTIFICALLY_APPROVED")).toBe("SCIENTIFICALLY_APPROVED");
    expect(researcherDisplayText("IMM-NIK-082 stays")).toBe("IMM-NIK-082 stays");
  });

  test("report redaction is unchanged", () => {
    expect(redactProhibitedNames("Nikolas reviewed PENDING_NIKOLAS_REVIEW")).toBe("the scientific reviewer reviewed PENDING_SCIENTIFIC_REVIEW");
  });

  test("health-domain workspaces, handbook screens, acceptance and roadmap render no personal name", () => {
    const pages = [
      ...HEALTH_DOMAINS.map((d) => html(createElement(HealthDomainWorkspace, { domainId: d.id }), d.path)),
      html(createElement(CardiovascularHandbookReference)),
      html(createElement(BoneHandbookReference)),
      html(createElement(P35FinalAcceptance)),
      html(createElement(ProjectRoadmap), "/project/guide"),
    ];
    for (const page of pages) expect(containsReviewerName(page)).toBe(false);
    expect(pages[1]).toContain("The owner reports that the Researcher completed verbal scientific review.");
  });

  test("domain registry, measurement profiles and mission-readiness texts carry no personal name", () => {
    const texts = [
      JSON.stringify(HEALTH_DOMAINS),
      JSON.stringify(Object.values(MEASUREMENT_PROFILES).map((p) => p.catalogStatusNote)),
      JSON.stringify(buildFinalDemoReadiness(null, "MITO_DEMO_2026")),
      JSON.stringify(getDemoAcceptanceGates()),
    ];
    for (const t of texts) expect(containsReviewerName(t)).toBe(false);
  });

  test("scientific review dossier display text carries no personal name after display wording", () => {
    const build = buildScientificReviewDossiers();
    for (const d of build.dossiers) {
      for (const u of d.unitComparisons) expect(containsReviewerName(researcherDisplayText(u.reference))).toBe(false);
      for (const q of d.unresolvedQuestions) expect(containsReviewerName(researcherDisplayText(q))).toBe(false);
      for (const e of d.evidence) {
        expect(containsReviewerName(e.title)).toBe(false);
        expect(containsReviewerName(researcherDisplayText([e.ref, ...e.details].join(" ")))).toBe(false);
      }
    }
  });
});

describe("P71 intake blocking reasons", () => {
  test("handoff block reasons show the display status, not the personal name", async () => {
    const { BLOCK_REASON_LABELS } = await import("@/domain/health-intelligence/catalog-reconciliation-handoff");
    expect(BLOCK_REASON_LABELS.pending_scientific_review).toBe("Scientific review PENDING_SCIENTIFIC_REVIEW");
    expect(containsReviewerName(JSON.stringify(BLOCK_REASON_LABELS))).toBe(false);
  });
});
