# P36 browser regression: actual Challenge 02 PDF upload through the hybrid
# extraction pipeline. Synthetic in-memory adapters only; the AI server is either
# genuinely unreachable (no session → unavailable path) or route-intercepted
# (stubbed envelope → UI wiring). The real provider call is verified separately
# server-side; this file never claims authenticated persistence or real AI.
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

base = Path('tests/navigation/p33-universal-documents.browser.py').read_text().split('asyncio.run(main())')[0]
ns = {'__name__': 'p36_base'}
exec(compile(base, 'p33-universal-documents.browser.py', 'exec'), ns)
OUT = Path('/tmp/browser/p36-4-date'); OUT.mkdir(parents=True, exist_ok=True)
FIXTURE = Path('/dev-server/fixtures/synthetic/p36/P36_CHALLENGE_02_ORIGINAL.pdf')

ENVELOPE = {
    'rows': [
        {'catalogId': 'IMM-001', 'reportedAnalyte': 'Total leukocytes / WBC', 'value': 6.7, 'reportedUnit': '10^9/L', 'observedAt': None, 'dateKind': 'unknown', 'sourcePage': 1, 'evidenceSnippet': '6.7 x10^9/L Total leukocytes / WBC', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-002', 'reportedAnalyte': 'Neutrophils, absolute', 'value': 3.8, 'reportedUnit': '10^9/L', 'observedAt': None, 'dateKind': 'unknown', 'sourcePage': 1, 'evidenceSnippet': '3.8 x10^9/L Neutrophils, absolute', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-003', 'reportedAnalyte': 'Absolute lymphocyte count', 'value': 2.2, 'reportedUnit': '10^9/L', 'observedAt': None, 'dateKind': 'unknown', 'sourcePage': 1, 'evidenceSnippet': '2.2 x10^9/L Absolute lymphocyte count', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-007', 'reportedAnalyte': 'hs-CRP', 'value': 2.4, 'reportedUnit': 'mg/L', 'observedAt': None, 'dateKind': 'unknown', 'sourcePage': 1, 'evidenceSnippet': 'Measured result: 2.4 mg/L', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-006', 'reportedAnalyte': 'NLR', 'value': 1.73, 'reportedUnit': 'ratio', 'observedAt': None, 'dateKind': 'unknown', 'sourcePage': 1, 'evidenceSnippet': 'Calculated value: 1.73 (dimensionless ratio)', 'uncertainty': [], 'status': 'review', 'reasons': []},
    ],
    'errors': [], 'provider': 'stubbed-server', 'model': 'ui-wiring-only',
}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 1800})
        errors = []; logs = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: logs.append(m.text) if '[p36.4]' in m.text else None)
        await page.goto('http://localhost:8080/mission/bone-health', wait_until='networkidle')
        modules = await page.evaluate(ns['HARNESS'])
        await page.route('**/__files/*', lambda route: route.fulfill(status=200, content_type='text/javascript', body=modules[route.request.url.rsplit('/', 1)[-1]]))
        storage_key = await page.evaluate("() => Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')) || 'sb-cifbkafjelizzgyvmbzp-auth-token'")
        await page.evaluate("""([key]) => localStorage.setItem(key, JSON.stringify({access_token:'synthetic-ui-token',refresh_token:'synthetic',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:'synthetic-user',aud:'authenticated',role:'authenticated'}}))""", [storage_key])
        await page.route('**/api/medical-document-extraction', lambda route: route.fulfill(status=200, content_type='application/json', body=json.dumps(ENVELOPE)))
        for width, height in [(1280, 1800), (390, 844)]:
            await page.set_viewport_size({'width': width, 'height': height})
            await page.evaluate('window.p33.writes=[]')
            await page.evaluate(ns['RENDER'], 'IMMUNE_MEASUREMENT_PROFILE')
            await page.get_by_role('button', name='Choose laboratory files', exact=True).wait_for()
            await page.set_input_files('input[type=file]', [{'name': FIXTURE.name, 'mimeType': 'application/pdf', 'buffer': FIXTURE.read_bytes()}])
            ai_ok = page.get_by_role('status').filter(has_text='5 unchecked suggestion(s) added')
            await ai_ok.wait_for(timeout=60000)
            rows = page.locator('input[type=checkbox][aria-label^="I verified"]')
            assert await rows.count() == 5
            assert await page.locator('input[type=checkbox]:checked').count() == 0
            # No manual date input and no shared-date checkbox touched.
            dates = await page.evaluate("""() => [...document.querySelectorAll('input[type=datetime-local]')].map(i=>i.value)""")
            body = await page.text_content('main')
            print(width, 'date inputs:', dates, '| 07:35 shown:', body.count('2026-10-14T07:35'), '| table:', body.count('2026-10-14'))
            assert body.count('2026-10-14') >= 5, body[:1500]
            assert await page.get_by_role('button', name='Confirm selected results and save').is_disabled()
            assert await page.evaluate('window.p33.writes.length') == 0
            await page.screenshot(path=str(OUT / f'{width}-auto-dates.png'))
        print('diagnostics:', logs)
        assert not errors, errors
        await browser.close()

asyncio.run(main())
