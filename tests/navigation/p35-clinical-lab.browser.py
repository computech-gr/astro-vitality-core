"""Actual PDF.js upload; synthetic adapters are NOT authenticated persistence evidence."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

base = Path('tests/navigation/p33-universal-documents.browser.py').read_text().split('asyncio.run(main())')[0]
ns = {'__name__': 'p35_base'}
exec(compile(base, 'p33-universal-documents.browser.py', 'exec'), ns)
OUT = Path('/tmp/browser/p35-clinical'); OUT.mkdir(parents=True, exist_ok=True)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width':1280,'height':1800})
        errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
        # Real requesting-user session, no membership changes or writes.
        with open(Path.home()/'.cache/lovable-auth/session.json') as f: minted=json.load(f)
        await page.goto('http://localhost:8080')
        await page.evaluate('([k,v])=>localStorage.setItem(k,v)',[minted['storage_key'],json.dumps(minted['session'])])
        await page.goto('http://localhost:8080/mission/immune-health',wait_until='networkidle')
        assert await page.get_by_text('This read-only evidence summary is restricted',exact=False).count()==1
        assert await page.get_by_role('button',name='Choose laboratory files',exact=True).count()==0
        await page.screenshot(path=str(OUT/'authenticated-operator-denied.png'))
        print('Real authenticated requesting account: operator denied import; Ground Medical persistence not available.')
        modules=await page.evaluate(ns['HARNESS'])
        await page.route('**/__files/*',lambda route: route.fulfill(status=200,content_type='text/javascript',body=modules[route.request.url.rsplit('/',1)[-1]]))
        for width,height in [(1280,1800),(390,844)]:
            await page.set_viewport_size({'width':width,'height':height})
            await page.evaluate('window.p33.writes=[]')
            await page.evaluate(ns['RENDER'],'IMMUNE_MEASUREMENT_PROFILE')
            await page.get_by_role('button',name='Choose laboratory files',exact=True).wait_for()
            path=Path('fixtures/synthetic/p35/realistic-clinical-lab.pdf')
            await page.set_input_files('input[type=file]',str(path.resolve()))
            diag=page.get_by_role('status').filter(has_text='Extraction:');await diag.wait_for(timeout=60000)
            assert '5 matched' in await diag.text_content() and '0 held' in await diag.text_content()
            checks=page.locator('input[type=checkbox][aria-label^="I verified"]')
            assert await checks.count()==5
            assert await page.locator('input[type=checkbox]:checked').count()==0
            assert await page.get_by_role('checkbox',name='Verify All',exact=False).is_disabled()
            assert await page.get_by_role('button',name='Confirm selected results and save').is_disabled()
            await page.screenshot(path=str(OUT/f'{width}-date-unconfirmed.png'))
            assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            section=page.locator('section[aria-label="Shared observation date for this file"]')
            await section.locator('input[type=datetime-local]').fill('2026-10-28T08:15')
            assert await page.get_by_role('checkbox',name='Verify All',exact=False).is_disabled()
            await section.locator('input[type=checkbox]').check()
            assert await checks.evaluate_all('(els)=>els.every(e=>!e.checked)')
            await page.get_by_role('checkbox',name='Verify All',exact=False).check()
            await page.get_by_role('button',name='Confirm selected results and save').click()
            await page.get_by_role('status').filter(has_text='5 results saved').wait_for()
            writes=await page.evaluate('window.p33.writes.map(w=>[w.variableId,w.value,w.unit,w.observedAt,w.sourceLabel])')
            assert [w[:3] for w in writes]==[['IMM-001',6.2,'10³/μL'],['IMM-002',3.4,'10³/μL'],['IMM-003',2.1,'10³/μL'],['IMM-006',1.62,'ratio'],['IMM-007',1.8,'mg/L']],writes
            await page.screenshot(path=str(OUT/f'{width}-reviewed-adapter-receipts.png'))
            print(f'{width}px actual clinical PDF: 5 exact readings, unconfirmed date blocks verification/save, explicit date and review required; adapter receipts only.')
        await page.set_viewport_size({'width':1280,'height':1800})
        for profile,fixture,count,date in ns['DOMAINS']:
            await page.evaluate('window.p33.writes=[]')
            await ns['run_domain'](page,profile,fixture,count,date)
        assert not errors,errors
        print('All four domains and both actual P34 PDFs pass real PDF.js uploads; no page errors.')
        await browser.close()

asyncio.run(main())
