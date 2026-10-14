# P21 — Navigation & Knowledge Experience

## Navigation

The header groups every destination into categorized mega menus on desktop
(1280 px and wider) and grouped accordions on mobile:

| Menu                | Groups                                                                   |
| ------------------- | ------------------------------------------------------------------------ |
| Mission             | Mission story, Why it matters                                            |
| Science             | Foundations, Context & safety                                            |
| Platform            | Crew workspace, Monitoring & data, Health domains, Intelligence & action |
| Mission Operations  | Access & governance, Ground & autonomy                                   |
| Technology          | Architecture, Data sources, Overview                                     |
| Open Source & About | Open Source, Backend on GitHub, About                                    |

Every previous label keeps its previous destination, except the eight
Technology labels, which now open dedicated topic pages. Existing
`/project/guide#…` anchors and homepage `/#…` anchors are unchanged, so old
bookmarks keep working.

## Topic pages

`/technology` and `/technology/<topic>` render from
`src/content/technology-topics.ts` through one reusable layout. Each page has
an introduction, why it matters, the approach, a diagram, a technical
explanation, implementation status and limitations, related pages and
repository source references. The status text follows the repository
documentation and never describes host-dependent or unvalidated work as
operational.
