import { useEffect, useMemo, useState } from "react";
import { Activity, Radiation, Thermometer, Wind } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { HealthDomainId } from "@/domain/health-domains/registry";
import {
  BODY_TEMPERATURE_SITE_LABELS,
  buildSharedMissionContext,
  formatContextValue,
  projectSharedContextIntoDomain,
  type SharedContextEntry,
  type SharedContextParameterId,
  type SharedContextReadingInput,
} from "@/domain/mission-context/shared-context";
import { getPublicDemoWorkspaceFn } from "@/lib/p69-public-demo.functions";

const ICONS: Record<SharedContextParameterId, typeof Activity> = {
  radiation_dose_rate: Radiation,
  cabin_co2: Wind,
  cabin_air_temperature: Thermometer,
  body_temperature: Activity,
};

const STATUS_LABEL: Record<SharedContextEntry["status"], string> = {
  available: "Available",
  stale: "Stale",
  unavailable: "Unavailable",
  missing: "No reading",
};

function ContextCard({ entry }: { entry: SharedContextEntry }) {
  const Icon = ICONS[entry.parameter.id];
  const r = entry.reading;
  return (
    <div className="rounded-lg border border-border bg-card p-4" data-testid={`context-${entry.parameter.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {entry.parameter.label}
        </p>
        <Badge variant={entry.status === "available" ? "secondary" : "outline"}>{STATUS_LABEL[entry.status]}</Badge>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold">{formatContextValue(entry)}</p>
      {r ? (
        <dl className="mt-2 grid gap-1 text-xs text-muted-foreground">
          {r.measurementSite ? (
            <div>
              <dt className="inline font-medium text-foreground">Site: </dt>
              <dd className="inline">{BODY_TEMPERATURE_SITE_LABELS[r.measurementSite]}</dd>
            </div>
          ) : null}
          {r.measurementMethod ? (
            <div>
              <dt className="inline font-medium text-foreground">Method: </dt>
              <dd className="inline">{r.measurementMethod}</dd>
            </div>
          ) : null}
          <div>
            <dt className="inline font-medium text-foreground">Observed: </dt>
            <dd className="inline">{r.observedAt.replace("T", " ").replace(/:00(\.0+)?Z$/, " UTC").replace(/Z$/, " UTC")}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">Source: </dt>
            <dd className="inline">{r.sourceLabel}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-foreground">Quality: </dt>
            <dd className="inline">{r.quality}{r.simulated ? " · simulated" : ""}</dd>
          </div>
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">No reading is available; nothing is estimated.</p>
      )}
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {entry.notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * P68 read-only shared mission context. Given readings, renders them; without
 * readings it loads them only for a signed-in public-demo identity (synthetic
 * workspace). Otherwise every parameter is shown as "No reading" — nothing is
 * invented. Never changes the domain's review status.
 */
export function SharedMissionContextPanel({
  domainId,
  readings,
}: {
  domainId: HealthDomainId;
  readings?: readonly SharedContextReadingInput[];
}) {
  const [loaded, setLoaded] = useState<readonly SharedContextReadingInput[]>([]);
  const [origin, setOrigin] = useState<"none" | "demo">("none");

  useEffect(() => {
    if (readings) return;
    let active = true;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (!active || data.session?.user.app_metadata?.["mitochondria_public_demo"] !== true) return;
      const result = await getPublicDemoWorkspaceFn().catch(() => null);
      if (active && result?.ok) {
        setLoaded(result.context);
        setOrigin("demo");
      }
    });
    return () => {
      active = false;
    };
  }, [readings]);

  const source = readings ?? loaded;
  const projection = useMemo(
    () => projectSharedContextIntoDomain(buildSharedMissionContext(source), domainId),
    [source, domainId],
  );

  return (
    <section
      aria-labelledby={`${domainId}-shared-context-title`}
      className="mt-8 rounded-xl border border-border bg-deep/40 p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${domainId}-shared-context-title`} className="text-lg font-semibold">
          Shared mission context
        </h2>
        <span className="text-xs uppercase text-muted-foreground">
          Same in Bone · Immune · Cardiovascular · Behavioral
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{projection.statement}</p>
      {!readings && origin === "none" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          No mission context feed is connected on this page. Readings appear here only from a governed source.
        </p>
      ) : null}
      {origin === "demo" ? (
        <p className="mt-1 text-xs text-muted-foreground">From your synthetic public demo workspace.</p>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {projection.entries.map((entry) => (
          <ContextCard key={entry.parameter.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
