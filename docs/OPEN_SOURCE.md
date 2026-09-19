# Open-Source Direction

The Mitochondria is licensed under Apache License 2.0 and is designed so its critical architecture can be inspected, tested, reproduced, and extended.

## Principles

- Source code and essential architecture are version controlled.
- Critical health behavior must not exist only inside a proprietary builder or vendor cloud.
- Device integrations use adapters so one vendor does not define the domain model.
- Scientific behavior is evidence-traceable and reviewable.
- Public demo data is synthetic or explicitly redistributable.
- Setup and quality gates are documented and automatable.

## Vendor-neutral direction

Lovable is used as a development accelerator. Supabase provides current application/backend capabilities. Neither should become the only conceptual implementation path for the health-domain model, device adapters, offline mission behavior, or scientific logic.

## Reproducibility

A fresh clone must be able to install dependencies from the committed lockfile, configure environment values from `.env.example`, pass repository quality gates, build, and run without hidden source files or private production credentials.

## Self-hosting direction

Later release phases will document local/self-hosted backend deployment and sample data. P2 establishes repository and environment discipline but does not claim a complete self-hosted mission backend yet.
