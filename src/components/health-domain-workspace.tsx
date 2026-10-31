"use client";

import { useEffect, useState } from "react";
import { loadMissionIdentity, subscribeMissionIdentity } from "@/infrastructure/mission-identity";
import { HealthDomainNavigation } from "@/components/health-domain-navigation";
import { ScientificCatalogPicker } from "@/components/scientific-catalog-picker";
import { supabase } from "@/integrations/supabase/client";

import { loadCrewScientificEvidence } from "@/infrastructure/scientific-evidence";
import type { ScientificEvidenceReport } from "@/domain/health-intelligence/live-evidence";
import {
  getHealthDomain,
  projectDomainEvidence,
  type HealthDomainId,
} from "@/domain/health-domains/registry";
import { REVIEWED_INTELLIGENCE_PATTERNS_V1_1 } from "@/domain/health-intelligence/patterns";
import proposedCatalog from "../../data/scientific/p355-proposed-domain-catalog.v1.json";
import { CardiovascularHandbookReference } from "@/components/scientific-handbook-reference";
import { HealthMeasurementEntry } from "@/components/bone-health-entry";
import { MEASUREMENT_PROFILES } from "@/domain/health-measurements/profiles";

export function HealthDomainWorkspace({ domainId }: { domainId: HealthDomainId }) {
  const domain = getHealthDomain(domainId);
  const draftCatalog = proposedCatalog.entries.filter((item) => item.domain === domainId);
  const [report, setReport] = useState<ScientificEvidenceReport | null>(null);
  const patterns = REVIEWED_INTELLIGENCE_PATTERNS_V1_1.filter((pattern) =>
    domain.patternIds.includes(pattern.id),
  );
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 text-foreground">
      <p className="section-kicker">P26 · Integrated Astronaut Health Domains</p>
      <h1 className="mt-3 font-display text-4xl font-semibold">
        {domain.title} — Measurements &amp; Reference
      </h1>
      <p className="mt-4 max-w-3xl text-muted-foreground">{domain.scope}</p>
      <p className="mt-3 rounded-md border border-border p-3 text-sm" role="status">
        {domainId === "immune" || domainId === "behavioral"
          ? "The owner reports Nikolas completed verbal scientific review. Formal signed per-entry reconciliation is not recorded; no clinical validation or approval is implied. Research reference only."
          : domain.reviewState === "scientific_review_pending"
            ? "The owner reports Nikolas completed verbal scientific review. Formal signed per-entry reconciliation is not recorded. Existing evidence is displayed without clinical inference or approval."
            : "Bone handbook mapping available. Clinical validation and approved thresholds are not established."}
      </p>
      <HealthDomainNavigation current={domainId} />
      {domainId === "cardiovascular" && <CardiovascularHandbookReference />}
      {(domainId === "immune" || domainId === "behavioral") && (
        <section
          className="mt-7 rounded-xl border border-border p-5"
          aria-label="Scientific draft catalog"
        >
          <h2 className="text-xl font-semibold">Scientific reference catalog · {domainId === "immune" ? "IMM" : "BSC"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            MITOCHONDRIA scientific reference proposals, with supporting Nikolas handbook sources.
            The project owner reports that Nikolas completed verbal review of these entries.
            Formal per-entry reconciliation and signed reviewer confirmation are not yet recorded;
            operational measurement activation and clinical validation are separate.
          </p>
          <ScientificCatalogPicker entries={draftCatalog} />
          <p className="mt-3 text-sm">
            Synthetic document review remains a separate, human-controlled process.{" "}
            <a className="underline" href="/mission/documents">
              Open Mission Documents
            </a>
            .
          </p>
        </section>
      )}

      {domainId !== "bone" && (
        <HealthMeasurementEntry profile={MEASUREMENT_PROFILES[domainId]} embedded />
      )}

      <DomainEvidencePanel domainId={domainId} onReport={setReport} />
      <section className="mt-8 grid gap-5 md:grid-cols-2">
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold">Scientific relationship registry</h2>
          {patterns.map((pattern) => (
            <div key={pattern.id} className="mt-4 border-t border-border pt-3 text-sm">
              <h3 className="font-semibold">{pattern.displayName}</h3>
              <p className="text-muted-foreground">{pattern.summary}</p>
              <p className="mt-2">
                {pattern.operationalStatus.replaceAll("_", " ")} · {pattern.sourceIds.join(", ")}
              </p>
              <p className="mt-1 text-muted-foreground">
                {report?.patterns
                  .find((entry) => entry.id === pattern.id)
                  ?.status.replaceAll("_", " ") ?? "Not evaluated"}
              </p>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-border p-5">
          <h2 className="text-lg font-semibold">Interpretation boundaries</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {domain.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
            <li>
              Evidence presence does not prove a relationship, temporal coincidence, causation or
              health status.
            </li>
            <li>No autonomous diagnosis, alert, treatment or readiness decision.</li>
          </ul>
          <a className="mt-5 inline-block text-sm underline" href="/mission/intelligence">
            Open Health Intelligence
          </a>
        </div>
      </section>
      {domainId === "bone" && (
        <p className="mt-7 text-sm">
          For encrypted bone-health entry and document import,{" "}
          <a className="underline" href="/mission/bone-health">
            open the existing Bone Health workspace
          </a>
          .
        </p>
      )}
    </main>
  );
}
