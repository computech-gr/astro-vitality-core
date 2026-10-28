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
OUT = Path('/tmp/browser/p36-hybrid'); OUT.mkdir(parents=True, exist_ok=True)
FIXTURE = Path('/dev-server/fixtures/synthetic/p36/P36_CHALLENGE_02_ORIGINAL.pdf')

ENVELOPE = {
    'rows': [
        {'catalogId': 'IMM-001', 'reportedAnalyte': 'Total leukocytes / WBC', 'value': 6.7, 'reportedUnit': '10^9/L', 'observedAt': None, 'dateKind': 'collection', 'sourcePage': 1, 'evidenceSnippet': '6.7 x10^9/L Total leukocytes / WBC', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-002', 'reportedAnalyte': 'Neutrophils, absolute', 'value': 3.8, 'reportedUnit': '10^9/L', 'observedAt': None, 'dateKind': 'collection', 'sourcePage': 1, 'evidenceSnippet': '3.8 x10^9/L Neutrophils, absolute', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-003', 'reportedAnalyte': 'Absolute lymphocyte count', 'value': 2.2, 'reportedUnit': '10^9/L', 'observedAt': None, 'dateKind': 'collection', 'sourcePage': 1, 'evidenceSnippet': '2.2 x10^9/L Absolute lymphocyte count', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-007', 'reportedAnalyte': 'hs-CRP', 'value': 2.4, 'reportedUnit': 'mg/L', 'observedAt': None, 'dateKind': 'collection', 'sourcePage': 1, 'evidenceSnippet': 'Measured result: 2.4 mg/L', 'uncertainty': [], 'status': 'review', 'reasons': []},
        {'catalogId': 'IMM-006', 'reportedAnalyte': 'NLR', 'value': 1.73, 'reportedUnit': 'ratio', 'observedAt': None, 'dateKind': 'collection', 'sourcePage': 1, 'evidenceSnippet': 'Calculated value: 1.73 (dimensionless ratio)', 'uncertainty': [], 'status': 'review', 'reasons': []},
    ],
    'errors': [], 'provider': 'stubbed-server', 'model': 'ui-wiring-only',
}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 1800})
        errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto('http://localhost:8080/mission/bone-health', wait_until='networkidle')
        modules = await page.evaluate(ns['HARNESS'])
        await page.route('**/__files/*', lambda route: route.fulfill(
            status=200, content_type='text/javascript',
            body=modules[route.request.url.rsplit('/', 1)[-1]]))

        # Scenario A: no sign-in session in the harness → AI unavailable, local
        # results and held rows retained, nothing fabricated, nothing saved.
        await page.evaluate(ns['RENDER'], 'IMMUNE_MEASUREMENT_PROFILE')
        await page.get_by_role('button', name='Choose laboratory files', exact=True).wait_for()
        await page.set_input_files('input[type=file]', [{'name': FIXTURE.name, 'mimeType': 'application/pdf', 'buffer': FIXTURE.read_bytes()}])
        diag = page.get_by_role('status').filter(has_text='Extraction:')
        await diag.wait_for(timeout=60000)
        assert '0 matched' in await diag.text_content(), await diag.text_content()
        ai_status = page.get_by_role('status').filter(has_text='AI-assisted extraction')
        await ai_status.wait_for(timeout=60000)
        assert 'unavailable' in await ai_status.text_content(), await ai_status.text_content()
        await page.get_by_text('No catalog-matched measurements').wait_for()
        assert await page.locator('input[type=checkbox][aria-label^="I verified"]').count() == 0
        await page.screenshot(path=str(OUT / 'a-ai-unavailable.png'))
        print('A: offline/unavailable path — local failure retained, AI status visible, zero fabricated rows.')

        # Scenario B: stubbed server envelope (UI wiring only, not real AI).
        # A synthetic future-dated session lets the component attempt the call;
        # the network route is intercepted, so no real provider is contacted.
        storage_key = await page.evaluate(
            "() => Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')) || 'sb-cifbkafjelizzgyvmbzp-auth-token'")
        await page.evaluate('''([key]) => {
          localStorage.setItem(key, JSON.stringify({
            access_token: 'synthetic-ui-token', refresh_token: 'synthetic', token_type: 'bearer',
            expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600,
            user: { id: 'synthetic-user', aud: 'authenticated', role: 'authenticated' },
          }));
        }''', [storage_key])
        print('session injected under', storage_key)
        await page.route('**/api/medical-document-extraction', lambda route: route.fulfill(
            status=200, content_type='application/json', body=json.dumps(ENVELOPE)))
        for width, height in [(1280, 1800), (390, 844)]:
            await page.set_viewport_size({'width': width, 'height': height})
            await page.evaluate('window.p33.writes=[]')
            await page.evaluate(ns['RENDER'], 'IMMUNE_MEASUREMENT_PROFILE')
            await page.get_by_role('button', name='Choose laboratory files', exact=True).wait_for()
            await page.set_input_files('input[type=file]', [{'name': FIXTURE.name, 'mimeType': 'application/pdf', 'buffer': FIXTURE.read_bytes()}])
            ai_ok = page.get_by_role('status').filter(has_text='AI-assisted extraction (stubbed-server/ui-wiring-only)')
            await ai_ok.wait_for(timeout=60000)
            print("AI STATUS:", await ai_ok.text_content())
            rows = page.locator('input[type=checkbox][aria-label^="I verified"]')
            assert await rows.count() == 5, await rows.count()
            assert await page.locator('input[type=checkbox]:checked').count() == 0
            assert await page.get_by_text('AI-assisted suggestion — unverified', exact=True).count() == 5
            # Collection date must not appear as an observation date.
            body = await page.text_content('main')
            assert '2026-10-14' not in body, body[:600]
            assert await page.get_by_role('button', name='Confirm selected results and save').is_disabled()
            section = page.locator('section[aria-label="Shared observation date for this file"]')
            await section.locator('input[type=datetime-local]').fill('2026-10-14T07:35')
            await section.locator('input[type=checkbox]').click()
            await page.get_by_role('checkbox', name='Verify All', exact=False).check()
            await page.get_by_role('button', name='Confirm selected results and save').click()
            await page.get_by_role('status').filter(has_text='5 results saved').wait_for()
            writes = await page.evaluate('window.p33.writes.map(w=>[w.variableId,w.value,w.unit,w.observedAt,w.sourceLabel,w.dataOrigin])')
            assert [w[:3] for w in writes] == [['IMM-001', 6.7, '10^9/L'], ['IMM-002', 3.8, '10^9/L'], ['IMM-003', 2.2, '10^9/L'], ['IMM-007', 2.4, 'mg/L'], ['IMM-006', 1.73, 'ratio']], writes
            assert all(w[3] == '2026-10-14T07:35:00.000Z' for w in writes), writes
            assert all(FIXTURE.name in w[4] for w in writes), writes
            assert all(w[5] == 'synthetic' for w in writes), writes
            assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            await page.screenshot(path=str(OUT / f'b-{width}-ai-assisted-review.png'))
            print(f'B {width}px: 5 AI-assisted rows unchecked → human date confirmation → Verify All → save; adapter receipts only.')
        assert not errors, errors
        await browser.close()

asyncio.run(main())
