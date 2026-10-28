"""P33 synthetic PDF fixture generator — SYNTHETIC TEST DATA ONLY.

Regenerates the catalog-accurate synthetic PDF reports in fixtures/synthetic/p33/
used by the P33 regression tests. The original P28/P32 PDFs were never committed
to the repository; these reconstructions carry the exact P28 CSV catalog IDs,
values and units in deliberately varied layouts (column order, Greek/English
headers, wrapped cells, reference intervals, decimal commas).

Run: python3 scripts/generate-p33-fixtures.py
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).resolve().parent.parent / "fixtures" / "synthetic" / "p33"

STYLE = """
<style>
  body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #111; }
  h1 { font-size: 15px; } table { border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #999; padding: 4px 10px; text-align: left; }
  th { white-space: nowrap; }
  .meta { color: #444; margin: 2px 0; }
</style>
"""

IMMUNE_ROWS = [
    ("IMM-001", "White blood cell count (total leukocytes)", "6.1", "10^9/L", "4.0–11.0", "whole blood"),
    ("IMM-002", "Neutrophil count (absolute)", "3.4", "10^9/L", "1.8–7.5", "whole blood"),
    ("IMM-003", "Lymphocyte count (absolute)", "1.9", "10^9/L", "1.0–4.8", "whole blood"),
    ("IMM-007", "C-reactive protein", "1.2", "mg/L", "0.0–5.0", "serum"),
    ("IMM-030", "25-hydroxyvitamin D", "72", "nmol/L", "50–125", "serum"),
]

CV_ROWS = [
    ("cv-001", "HR", "62", "bpm"),
    ("cv-005", "SBP", "118", "mmHg"),
    ("cv-006", "DBP", "76", "mmHg"),
    ("cv-027", "RMSSD", "48", "ms"),
    ("cv-065", "SpO₂", "98", "%"),
]

BSC_ROWS = [
    ("BSC-001", "Total sleep time (main sleep<br>+ naps)", "6,5", "h", "main sleep plus naps"),
    ("BSC-002", "Sleep efficiency", "88", "%", "night period"),
    ("BSC-004", "Sleep onset latency", "14", "min", "main sleep only"),
    ("BSC-015", "Karolinska Sleepiness Scale (KSS)", "4", "score", "self report"),
]

IMMUNE_HTML = f"""<html><head>{STYLE}</head><body>
<h1>SYNTHETIC IMMUNE PANEL — TEST DATA ONLY</h1>
<p class="meta">ΣΥΝΘΕΤΙΚΑ ΔΕΔΟΜΕΝΑ ΔΟΚΙΜΗΣ — not a real astronaut measurement.</p>
<p class="meta">Report ID LAB-2026-1042 · Patient: Synthetic Fixture · Accession 88421</p>
<table>
<tr><th>Catalog ID</th><th>Analyte</th><th>Result</th><th>Unit</th><th>Reference interval</th><th>Specimen</th><th>Collected</th></tr>
{"".join(f"<tr><td>{i}</td><td>{a}</td><td>{v}</td><td>{u}</td><td>{r}</td><td>{s}</td><td>2026-10-01T09:00:00Z</td></tr>" for i, a, v, u, r, s in IMMUNE_ROWS)}
</table>
<p class="meta">Reference intervals are report metadata, never measurements.</p>
</body></html>"""

CV_HTML = f"""<html><head>{STYLE}</head><body>
<h1>ΣΥΝΘΕΤΙΚΗ ΚΑΡΔΙΑΓΓΕΙΑΚΗ ΑΝΑΦΟΡΑ — ΔΟΚΙΜΑΣΤΙΚΑ ΔΕΔΟΜΕΝΑ</h1>
<p class="meta">SYNTHETIC TEST DATA — not a real astronaut measurement. Device: SYNTHETIC Demo Device.</p>
<table>
<tr><th>Αποτέλεσμα</th><th>Μονάδα</th><th>Εξέταση</th><th>Κωδικός</th><th>Ημερομηνία</th></tr>
{"".join(f"<tr><td>{v}</td><td>{u}</td><td>{a}</td><td>{i}</td><td>2026-10-02T08:00:00Z</td></tr>" for i, a, v, u in CV_ROWS)}
</table>
</body></html>"""

BSC_HTML = f"""<html><head>{STYLE}</head><body>
<h1>SYNTHETIC BEHAVIORAL HEALTH LOG — TEST DATA ONLY</h1>
<p class="meta">SYNTHETIC Demo Sleep Log · not a real astronaut measurement.</p>
<table>
<tr><th>Catalog ID</th><th>Analyte</th><th>Result</th><th>Unit</th><th>Notes</th></tr>
{"".join(f"<tr><td>{i}</td><td>{a}</td><td>{v}</td><td>{u}</td><td>{n}</td></tr>" for i, a, v, u, n in BSC_ROWS)}
</table>
<p class="meta">Collected 2026-10-03 — report-level note only; per-row observation times require human review.</p>
</body></html>"""

UNSUPPORTED_HTML = f"""<html><head>{STYLE}</head><body>
<h1>UNSUPPORTED LAYOUT — SYNTHETIC TEST DATA ONLY</h1>
<p class="meta">This report lists wellness markers in prose. White blood cells were within the reference range 4.0–11.0 10^9/L.</p>
<p class="meta">Heart rate &lt; 100 bpm at rest. Sleep efficiency &gt; 85 % is typical.</p>
<p class="meta">IMM-999 Unknown analyte 5 mg/L</p>
<p class="meta">IMM-001 &lt;script&gt;alert(1)&lt;/script&gt; 6.1 10^9/L</p>
<p class="meta">The patient reported sleeping well; no catalog-identified rows exist here.</p>
</body></html>"""

FIXTURES = {
    "p28-immune-report.pdf": IMMUNE_HTML,
    "p28-cardiovascular-report.pdf": CV_HTML,
    "p28-behavioral-report.pdf": BSC_HTML,
    "p33-unsupported-layout.pdf": UNSUPPORTED_HTML,
}


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        for name, html in FIXTURES.items():
            await page.set_content(html, wait_until="load")
            await page.pdf(path=str(OUT / name), format="A4", print_background=False)
            print("wrote", OUT / name)
        await browser.close()


asyncio.run(main())
