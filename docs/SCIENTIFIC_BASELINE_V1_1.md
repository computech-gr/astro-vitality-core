# Scientific baseline v1.1

The reviewed scientific source for P4 is `SPACE_APPS_2026_Astronaut_Biomarker_Matrix_v1.1.xlsx`.

- Review completed: 2026-09-19
- SHA-256: `ffed3a7f3afb844963900bd53cbb9edd74588f613c925d323fd58ded0cce7273`
- Matrix scope: 81 biological/laboratory rows, 25 live signals, 20 functional/cognitive measures, 19 environmental/radiation indicators, 17 device-integration classes, and 36 source records.

The workbook remains the controlled scientific source. The repository stores an implementation catalogue derived from the reviewed MVP/near-term subset; it does not copy every research-only row into operational code.

## Decisions promoted into software governance

1. Personal longitudinal baseline, clinical/laboratory reference interval, and mission operational limit are three distinct layers and must never be collapsed into one `normal range`.
2. Research-only measurements may be stored with provenance but cannot drive operational actions by default.
3. Multi-signal relationships are evidence-weighted patterns, not diagnoses. Context, time window, confounders, data quality, and uncertainty must remain visible.
4. HRV, EDA, cortisol, cytokines, microbiome, and oxidative-stress measures must not be converted into generic stress/health scores.
5. Skin temperature is not core body temperature.
6. Creatinine must be interpreted with changing muscle mass and hydration; cystatin C is retained as complementary renal context.
7. CK is an exercise/injury marker and must not be treated as a direct muscle-loss proxy.
8. Hydration interpretation is multi-signal; urine specific gravity alone is not a dehydration diagnosis.
9. Cabin CO2 remains important environmental context, but a coincident cognitive change must not be presented as a proven causal CO2 effect at routine spacecraft levels.
10. Absorbed radiation dose and dose equivalent/effective quantities are distinct physical concepts and must use separate metric codes and units.
11. Microbiome changes remain longitudinal research context; there is no generic `healthy/unhealthy` microbiome score.
12. Event-driven cardiac markers and specialist assays remain medical-context/research pathways rather than routine wellness inputs.

## P1 closure

The v1.1 review satisfies the team-biologist review dependency that was intentionally left open in P1. P1 is therefore treated as scientifically closed for the challenge implementation baseline, subject to the standing rule that clinical thresholds, flight rules, treatment, and escalation protocols require separately qualified medical/mission governance.

## P4 seed catalogue

`src/domain/catalog/reviewed-mvp-v1.1.ts` contains the reviewed MVP/near-term canonical metric seed used by the P4 ingestion and serialization contracts. Every entry retains:

- a stable canonical metric code;
- matrix sheet and row identifier;
- review disposition and P0/P1/P2 priority;
- evidence source IDs;
- measurement cadence;
- allowed source types;
- interpretation tier;
- canonical unit policy where applicable.

Rows explicitly marked `REMOVE` are not promoted into the P4 catalogue.
