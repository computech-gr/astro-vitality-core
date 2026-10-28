import asyncio,json,os,re,subprocess
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/p365')
async def check_downloads(page,context,modules):
    await page.emulate_media(media='screen')
    for width,height in [(1280,1800),(390,844)]:
        await page.set_viewport_size({'width':width,'height':height})
        cover=page.locator('.report-cover')
        assert 'SYNTHETIC P29' in await cover.inner_text()
        assert 'Synthetic display fixture' in await cover.inner_text()
        await cover.screenshot(path=str(OUT/f'cover-{width}.png'))
        name=await page.evaluate('''async()=>{const {reportExportBasename}=await import('/src/domain/health-intelligence/report-export-identity.ts');return reportExportBasename({missionName:'SYNTHETIC P29',missionId:'SYNTHETIC-P29',crewDisplayName:'Synthetic display fixture',crewMemberId:'SYNTHETIC-CREW',generatedAt:document.querySelector('.report-cover').innerText.match(/Generated \(UTC\):\s*(\S+)/)[1],provenance:'synthetic'})}''')
        async with page.expect_download(timeout=120000) as dl:
            await page.get_by_role('button',name='Download PDF',exact=True).click()
        d=await dl.value
        assert d.suggested_filename==name+'.pdf',d.suggested_filename
        pdf=OUT/f'download-{width}.pdf';await d.save_as(pdf)
        assert pdf.read_bytes().startswith(b'%PDF-') and pdf.stat().st_size>10000
        info=subprocess.check_output(['pdfinfo',str(pdf)],text=True)
        assert '595.28 x 841.89' in info,info
        print('PDF DOWNLOAD PASS',width,d.suggested_filename,pdf.stat().st_size,info)
        await page.get_by_role('button',name='Download PDF',exact=True).wait_for(state='visible')
        async with page.expect_download() as dl:
            await page.get_by_role('button',name='Export evidence text',exact=True).click()
        d=await dl.value;assert d.suggested_filename==name+'.txt'
        txt=Path(await d.path()).read_text()
        for token in ['SYNTHETIC P29','Synthetic display fixture','Mission ID: SYNTHETIC-P29','Crew ID: SYNTHETIC-CREW','SYNTHETIC-EXCLUDED-3']+['SYNTHETIC-P29-'+str(i).zfill(3)+'-'+'abcdef0123456789'*8 for i in range(60)]:assert token in txt,token
        await page.locator('.report-print > div').first.screenshot(path=str(OUT/f'actions-{width}.png'))
        print('TXT PASS',width,len(txt))
    # Missing name fallback and wrong-role scope omission via memory-only adapter.
    fallback=modules['mission-identity.ts'].replace('missionName:"SYNTHETIC P29",crewDisplayName:"Synthetic display fixture"','missionName:" ",crewDisplayName:" "')
    fallback=fallback.replace('memberships:[','memberships:[{missionId:"OTHER",crewMemberId:"DENIED",role:"mission_operator"},')
    fm=dict(modules);fm['mission-identity.ts']=fallback
    await page.route('**/__p365_fallback/*',lambda route:route.fulfill(content_type='text/javascript',body=fm[route.request.url.rsplit('/',1)[-1]].replace('/__p29_presentation/','/__p365_fallback/')))
    await page.evaluate('''async()=>{const {default:React}=await import('/node_modules/.vite/deps/react.js?v='+window.p29Version);const {default:Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.p29Version);const {AstronautHealthReport}=await import('/__p365_fallback/report.js');const h=document.createElement('div');document.body.replaceChildren(h);Client.createRoot(h).render(React.createElement(AstronautHealthReport));}''')
    await page.get_by_label('Authorized mission and crew').select_option('SYNTHETIC-P29|SYNTHETIC-CREW')
    await page.locator('.report-history-table tbody tr').nth(63).wait_for()
    assert 'Crew identity unavailable' in await page.locator('.report-cover').inner_text()
    assert await page.get_by_label('Authorized mission and crew').locator('option').count()==2
    async with page.expect_download() as dl:await page.get_by_role('button',name='Export evidence text',exact=True).click()
    d=await dl.value;assert d.suggested_filename.startswith('MITOCHONDRIA_SYNTHETIC_P29_SYNTHETIC_CREW_')
    print('MISSING-NAME/DENIED-ROLE PASS',d.suggested_filename)
    # Genuine signed-in read-only account; no fabricated membership.
    session=json.loads(Path(os.path.expanduser('~/.cache/lovable-auth/session.json')).read_text())
    real=await context.new_page();await real.goto('http://localhost:8080')
    await real.evaluate('([k,v])=>localStorage.setItem(k,v)',[session['storage_key'],json.dumps(session['session'])])
    await real.goto('http://localhost:8080/mission/health-report');await real.wait_for_timeout(1500)
    count=await real.get_by_label('Authorized mission and crew').locator('option').count()
    await real.locator('.report-root').screenshot(path=str(OUT/'authenticated-report.png'))
    print('REAL ACCOUNT authorized crew options:',count-1)
    assert await real.get_by_role('button',name='Download PDF',exact=True).count()==0 if count==1 else True
    await real.close()
source=Path('/dev-server/tests/navigation/p29-medical-report.browser.py').read_text()
source=source.replace("OUT = Path('/tmp/browser/p29-medical-report')","OUT = Path('/tmp/browser/p365')")
source=source.replace('        await browser.close()','        await check_downloads(page,context,modules)\n        assert errors == [],errors\n        await browser.close()')
exec(compile(source,'p29-for-p365','exec'),globals())
