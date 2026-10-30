# P46.1 Synthetic Health Trends Demonstration

- Adds an explicit opt-in illustrative SVG chart under Dynamic Health Trends.
- Five hardcoded example resting-heart-rate values are SYNTHETIC and are never stored or exported.
- Does not call Supabase, impersonate Crew Self, alter authorization, or change real read-only charts.
- The unauthorized Crew Self message remains visible; the demo is separate.
- Existing P46 foreground reminders, checklist, environment selection and quality labels remain unchanged.

## Acceptance

1. Signed out: no private data, show/hide synthetic chart works, labels are visible.
2. Signed in without Crew Self: no private data, demo remains synthetic.
3. Signed in with Crew Self: real metric charts still use authorized scientific evidence; demo is clearly separate.
4. Test 1-minute reminder with page open, Stop, reload resets; browser permission optional.
5. Run bun run check, production build, browser 390/1280 and report results. No publish.
