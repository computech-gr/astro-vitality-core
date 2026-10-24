"use client";

import { useMemo, useState } from "react";
import proposals from "../../data/scientific/p43-semantic-decision-proposals.v1.json";

/** Read-only scientific catalog exploration. Never feed these rows into clinical engines. */
export function ScientificResearchCandidates() {
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("ALL");
  const [visibleCount, setVisibleCount] = useState(12);
  const rows = proposals.rows;
  const classifications = Array.from(
    new Set(rows.map((row) => row.provisional_semantic_disposition)),
  );
  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const matchesClass =
          classification === "ALL" || row.provisional_semantic_disposition === classification;
        const needle = search.trim().toLocaleLowerCase();
        const matchesSearch =
          !needle ||
          [row.source_id, row.source_name, row.catalog_name, row.candidate_catalog_id].some(
            (value) => value.toLocaleLowerCase().includes(needle),
          );
        return matchesClass && matchesSearch;
      }),
    [classification, rows, search],
  );
  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  return (
    <section className="mt-12 space-y-4" aria-label="P43 research-only scientific mapping explorer">
      <div>
        <h2 className="font-display text-2xl font-semibold">
          Scientific mapping · research review
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {rows.length} provisional P43 proposals. These are source-document classifications, not
          independently verified NASA claims, approved biomarkers, clinical alerts, or operational
          mappings.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Search by source or candidate
          <input
            type="search"
            aria-label="Search provisional scientific proposals"
            className="rounded border border-border bg-background px-3 py-2"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setVisibleCount(12);
            }}
            placeholder="e.g. WBC"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Provisional classification
          <select
            className="max-w-full rounded border border-border bg-background px-3 py-2"
            value={classification}
            onChange={(event) => {
              setClassification(event.target.value);
              setVisibleCount(12);
            }}
          >
            <option value="ALL">All classifications</option>
            {classifications.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        Showing {filtered.length} matching proposals ({visible.length} rendered) of {rows.length} · 0 independently approved · 0
        operationally activated
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {visible.map((row) => (
          <article
            key={row.source_id}
            className="rounded-lg border border-border bg-surface p-4 text-sm"
          >
            <p className="font-mono text-xs text-muted-foreground">
              {row.source_id} → {row.candidate_catalog_id}
            </p>
            <h3 className="mt-2 font-semibold">
              {row.source_name} / {row.catalog_name}
            </h3>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {row.provisional_semantic_disposition.replaceAll("_", " ")}
            </p>
            <p className="mt-2">{row.scientific_rationale}</p>
            <p className="mt-2 text-muted-foreground">
              Source unit: {row.source_unit || "Not supplied"} · Evidence: source document only
            </p>
            <p className="mt-2 font-semibold">
              Independent review pending — no merge or activation
            </p>
          </article>
        ))}
      </div>
      {remaining > 0 && (
        <button
          type="button"
          className="rounded border border-border px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => setVisibleCount((count) => count + 12)}
        >
          Show 12 more ({remaining} remaining)
        </button>
      )}
      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No matching research proposals.</p>
      )}
      <p className="text-xs text-muted-foreground">
        The other 162 P37 records have no curated P39 mapping; absence from this explorer is not
        rejection. No patient data, Cloud writes, scoring, or diagnostic interpretation is performed
        here.
      </p>
    </section>
  );
}
