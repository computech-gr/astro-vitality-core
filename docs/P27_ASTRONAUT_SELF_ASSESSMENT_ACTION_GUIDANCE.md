# P27 — Astronaut Self-Assessment & Action Guidance

## Scope

An authenticated Crew Self member can complete a voluntary six-question session-only checklist from the existing `/mission/guidance` route, choose a mission, and review versioned protocol _categories_ for measurement quality, workload/recovery, hydration/nutrition, and environmental context. All categories reuse the existing P13 reviewed protocol library; the questionnaire introduces no clinical threshold, risk score, diagnosis, automatic finding, medical escalation or treatment recommendation.

## Access and privacy

The interface remains disabled until the current cloud context confirms an active `crew_self` membership with an assigned crew member. Switching mission resets answers. No answers or acknowledgement are saved, uploaded, written to browser storage, or included in existing mission records. The checkbox is explicitly session-only. No ground communication is initiated. For urgent concerns, users must follow established mission emergency/medical procedures.

## Clinical and scientific limitations

Self-reported context is **not** a measured biomarker, approved baseline, validated health score, or P12 intelligence finding. Protocol suggestions are review categories only. A request for qualified medical contact is an instruction to use the existing authorized channel; it is not an automatic alert or a governed escalation trigger. Full secure persistence, longitudinal review, approved medical triage and device E2E acceptance remain outside this patch and require separate implementation and validation.

## Integration

The existing Action Guidance navigation and `/mission/guidance` route are reused. No migrations, RLS changes, or SEO route additions. Existing P13 action-plan and acknowledgement contracts remain unchanged.

## Verify

`node scripts/verify-p27-self-assessment.mjs`

`bun test tests/domain/p27-self-assessment.test.ts`

`bun run typecheck && bun run build`
