# P13 — Action & Protocol Guidance

P13 implements the governed `ACT` boundary above P12 Health Intelligence. It does not diagnose disease, prescribe treatment, or autonomously change flight rules.

## Source alignment

The controlled roadmap defines P13 as a protocol library with severity, repeat measurement, countermeasure review, escalation and acknowledgement. The reviewed Biomarker Matrix v1.1 permits bounded operational action classes: repeat/quality check, recovery/workload review, hydration/nutrition review, exercise-countermeasure review, environmental review and medical escalation. Medical escalation and mission safety limits remain separately governed.

## Severity taxonomy

- `info` — context only; no operational action required.
- `watch` — observe/repeat/review; used for contextual findings such as non-causal CO2/cognition association.
- `action` — a reviewed multi-signal pattern maps to a bounded protocol/countermeasure-review category.
- `escalate` — may be created only from a separate authority/versioned governed trigger.
- `data_quality` — sensor/context quality must be corrected or repeated before health interpretation proceeds.

## Protocol library

The v1.1 software library contains versioned protocols for:

1. repeat measurement / quality check;
2. recovery / workload review;
3. hydration / nutrition review;
4. exercise countermeasure review;
5. environmental telemetry / response review;
6. medical / mission escalation — governed-trigger-only.

Protocol steps are review and routing instructions. They are not treatment prescriptions. Where a step references an approved mission countermeasure protocol, the external governed protocol remains authoritative.

## Finding-to-action mapping

P13 consumes a P12 `HealthIntelligenceFinding`. It preserves the finding identity, contributing evidence, uncertainty and confounders on every generated action card.

Research-only findings produce no operational actions. Information-only findings produce no action. Data-quality findings can only produce repeat/quality guidance. Contextual-only patterns remain `watch` severity. Reviewed non-diagnostic multi-signal patterns may produce `action` severity using the reviewed category mapping.

## Escalation boundary

P13 never promotes a P12 pattern to medical escalation by itself. `createGovernedEscalationAction()` requires an explicit trigger containing:

- authority;
- version;
- reason code;
- finding identity;
- activation time.

This keeps software pattern inference technically separate from mission/medical safety rules.

## Acknowledgement

Every operational action card requires acknowledgement. The acknowledgement contract preserves:

- action and finding IDs;
- mission/crew context;
- actor ID;
- acknowledgement state (`acknowledged`, `deferred`, `escalated`);
- timestamp;
- protocol ID and version;
- optional governed reason code.

P13 acknowledgement is domain/session state only. Durable local persistence, encrypted offline storage and synchronization are P14 scope; ground audit workflow is P15 scope.

## UI

`/mission/guidance` exposes the protocol library and safety boundary. It intentionally shows `NO ACTIVE SESSION GUIDANCE` until an actual or explicitly synthetic P12 finding is provided. It does not fabricate health evidence.

## Explicit non-goals

P13 does not add:

- diagnosis;
- medication or treatment instructions;
- autonomous flight-rule changes;
- universal clinical thresholds;
- automatic medical escalation from a pattern;
- persistence/database migrations;
- offline protocol cache or sync queue (P14);
- ground/medical console workflow (P15).
