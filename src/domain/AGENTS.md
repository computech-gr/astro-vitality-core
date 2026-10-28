# Domain rules

- Bone health history is append-only: corrections mark the prior entry erroneous and add a superseding entry via collapseBoneEntryVersions in src/domain/bone-health/history.ts; never rewrite or delete encrypted offline records.
- Bone correction forms retain the persisted observation instant until the datetime field is edited, and append the correction successfully before marking the original erroneous; source suggestions are authorized mission/crew/provenance scoped.
- Bone reported metadata pickers share an editable combobox and pure scoped suggestion module; historical hints require current authorization and exact mission/crew/provenance/variable matches, while typing and filtering never normalize or replace reported values.
- Health-domain leaf workspaces share registry-driven navigation using Button-as-link controls; consistent active/focus states must not introduce domain ingestion or catalog activation.
- All four health domains share the Bone measurement/import workflow via per-domain profiles in src/domain/health-measurements/profiles.ts (own catalog/source/session keys; Bone keeps original IDs); synthetic-only session review restores after fresh authorization. Keeps domains isolated without duplication.
- Bone import bulk verification shares existing save validation through a pure selection helper; silent same-account focus reads preserve in-memory review, while remounts reset verification and every save freshly authorizes its scope.
- Bone shared-date fills use the pure review-selection helper (strict calendar/timezone checks) and apply on row-bound confirmation; per-file, unsaved-only, never verification.
