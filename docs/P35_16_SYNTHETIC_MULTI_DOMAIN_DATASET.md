# P35.16 — Offline synthetic multi-domain dataset

This patch adds an actual deterministic, four-domain, three-timepoint fictional dataset generator and JSON download inside the existing operator launchpad. The dataset is **not** an ingestion contract and is never submitted to Cloud. Bone/immune example values deliberately use arbitrary demonstration units and do not assert validated biomarkers, cutoffs, or findings. The button is disabled on `MISSION_TEST`. No migrations, RLS changes, new privileges, real data, publication or mission mutations. Existing five-menu navigation remains unchanged.

Acceptance: 4 focused tests; existing launchpad tests; one `bun run check`; signed-in operator can export on an independently approved non-reserved mission; `MISSION_TEST` button disabled; signed-out controls absent. Do not create a demo mission or change permissions without separate approval.

Administrator remains **not implemented**: true multi-role access requires reviewed backend authorization and a dedicated synthetic demo mission; operator role is not a superuser.
