# SEO & Indexability Policy (v20.2)

This project separates **public content** from **operational application
surfaces**. Search and AI crawlers are pointed only at the public content.

Canonical production origin: `https://mitochondria.edocinfo.com`.
Lovable preview origins (`*.lovable.app`) are never used in canonical, Open
Graph or Twitter metadata. All absolute URLs come from
`CANONICAL_ORIGIN` / `canonicalUrl()` in `src/infrastructure/config.ts`.

## Single source of truth

`src/infrastructure/seo.ts` holds the policy:

- `INDEXABLE_ROUTES` — public content routes, listed in `public/sitemap.xml`
- `NON_INDEXABLE_ROUTES` — operational consoles, `noindex, nofollow`
- `indexableRouteHead()` / `operationalRouteHead()` — the only two head
  metadata builders used by route files

## Indexable public content routes

| Route                 | Why indexable                                        |
| --------------------- | ---------------------------------------------------- |
| `/`                   | Public project landing page and positioning          |
| `/project/guide`      | Public project documentation and navigation guide    |
| `/mission/validation` | Public validation evidence and known limitations     |
| `/mission/submission` | Public challenge submission and attribution material |
| `/technology`         | Public index of the eight Technology topics          |
| `/technology/<topic>` | Eight public educational Technology topic pages      |

Each one self-canonicalizes to its own production URL and carries a complete
title, description, `robots: index, follow`, Open Graph set (`og:title`,
`og:description`, `og:type`, `og:url`, `og:image`) and Twitter/X set
(`twitter:card: summary_large_image`, `twitter:title`,
`twitter:description`, `twitter:image`). All share the existing
`/og-image.jpg` preview image; branding is unchanged.

## Routes intentionally excluded from indexing

Marked `noindex, nofollow` and absent from `sitemap.xml`:

| Route                   | Reason                                                       |
| ----------------------- | ------------------------------------------------------------ |
| `/mission/identity`     | Authentication and mission-membership operational surface    |
| `/mission/live`         | Live operational telemetry console; no stable public content |
| `/mission/devices`      | Runtime device-capability/integration console                |
| `/mission/readiness`    | Personal cognitive/behavioral assessment surface             |
| `/mission/intelligence` | Operational health-intelligence console                      |
| `/mission/alerts`       | Operational explainable-alert review surface                 |
| `/mission/guidance`     | Operational action/protocol guidance console                 |
| `/mission/offline`      | Local device/offline state surface                           |
| `/mission/records`      | Medical-sensitive mission history and synchronization status |
| `/mission/ground`       | Ground oversight and research-export console                 |
| `/mission/simulation`   | Interactive synthetic generator; output is not content       |

These pages stay publicly reachable for demo and judging. Excluding them
avoids advertising operational, personal or research-governance surfaces to
crawlers, and keeps indexed results limited to stable public content.

## Heading hierarchy

Every route renders exactly one meaningful `<h1>` describing that page,
followed by logical `<h2>` section headings (and `<h3>` where nested). No
heading level is skipped and no heading is used purely for styling.

## robots.txt and sitemap

`public/robots.txt` allows all crawlers and declares
`Sitemap: https://mitochondria.edocinfo.com/sitemap.xml`.
`public/sitemap.xml` is a valid `urlset` containing exactly the indexable
routes above (four core routes, the Technology index and eight topic pages), on absolute production URLs.

## Enforcement

`scripts/verify-seo.mjs` (wired into `bun run check` as `verify:seo`) and
`tests/seo/v20-2-seo.test.ts` enforce: one `h1` per page component, the
sitemap/route policy match, sitemap validity, the robots sitemap
declaration, self-canonical URLs, absence of preview origins, and full
OG/Twitter coverage.

## Out of scope

Google Search Console verification and property settings are an external,
manual step. Nothing in this repository fabricates or asserts that
verification.
