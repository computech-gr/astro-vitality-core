"""P29 real menus and report component with memory-only synthetic read adapters.

This is presentation/Chromium PDF evidence, not authenticated storage acceptance.
No Cloud writes, persisted fixtures, provider requests or production role changes.
Run with python3 tests/navigation/p29-medical-report.browser.py.
"""
import asyncio
import json
import re
import subprocess
import xml.etree.ElementTree as ET
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/p29-medical-report')


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={'width': 1280, 'height': 1800})
        page = await context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto('http://localhost:8080/mission/health-report', wait_until='networkidle')
        await page.get_by_role('navigation', name='Primary navigation').get_by_role('button', name='Health & Intelligence', exact=True).click()
        menu = page.locator('[data-mega-menu="Health & Intelligence"]')
        link = menu.get_by_role('menuitem', name='Medical Report', exact=True)
        assert await link.get_attribute('href') == '/mission/health-report'
        await link.focus()
        await menu.screenshot(path=str(OUT / 'desktop-menu.png'))
        await link.press('Enter')
        await page.wait_for_url('**/mission/health-report')
        await page.get_by_label('Authorized mission and crew').wait_for()
        await page.wait_for_load_state("networkidle")
        await page.set_viewport_size({'width': 390, 'height': 844})
        await page.get_by_role('button', name='Open navigation menu').click()
        await page.wait_for_timeout(500)
        mobile = page.get_by_role('navigation', name='Mobile navigation')
        await mobile.get_by_role('button', name='Health & Intelligence', exact=True).click()
        group = mobile.get_by_role('group', name='Health & Intelligence: Health domains')
        link = group.get_by_role('link', name='Medical Report', exact=True)
        assert await link.get_attribute('href') == '/mission/health-report'
        await group.screenshot(path=str(OUT / 'mobile-menu.png'))
        await link.click()
        await page.wait_for_url('**/mission/health-report')
        await page.get_by_label('Authorized mission and crew').wait_for()
        assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        print('PASS: desktop Enter and mobile pointer reach the existing Medical Report route')

        await page.wait_for_load_state('networkidle')
        assert errors == [], errors
        # Use the exact compiled report component, real pure report builders and CSS.
        # Replace only identity/read adapters and unrelated advisor/AI panels in this
        # disposable page. This never grants authority to the actual application.
        modules = await page.evaluate(r'''async () => {
          let source = await (await fetch('/src/components/astronaut-health-report.tsx')).text();
          source = source.slice(0, source.indexOf('import * as RefreshRuntime'));
          source = source.replace(/import\.meta\.hot = [^;]+;/, '');
          source = 'const $RefreshSig$=()=>()=>{}; const $RefreshReg$=()=>{};\n'+source;
          window.p29Version = source.match(/react\.js\?v=([a-z0-9]+)/)[1];
          const base = {missionId:'SYNTHETIC-P29', crewMemberId:'SYNTHETIC-CREW', value:0.42,
            unit:'ng/mL', sourceLabel:'SYNTHETIC Laboratory / Εργαστήριο επίδειξης', specimen:'serum',
            assayMethod:'', notes:'', dataOrigin:'synthetic'};
          const ids = [];
          const entries = Array.from({length:60}, (_,i) => {
            const id='SYNTHETIC-P29-'+String(i).padStart(3,'0')+'-'+('abcdef0123456789'.repeat(8));
            ids.push(id);
            return {...base, id, variableId:'bone-001', observedAt:'2026-10-'+String(1+i%27).padStart(2,'0')+'T09:12:34.123Z', value:0.42+i/100};
          });
          window.p29Ids=ids;
          const domainEntries={bone:entries,
            immune:[{...base,id:'SYNTHETIC-IMM-001',variableId:'IMM-001',unit:'10^9/L',value:6.1,observedAt:'2026-10-01T10:00:00.000Z'}],
            cardiovascular:[{...base,id:'SYNTHETIC-CV-005',variableId:'cv-005',unit:'mmHg',value:118,observedAt:'2026-10-02T10:00:00.000Z'}],
            behavioral:[{...base,id:'SYNTHETIC-BSC-001',variableId:'BSC-001',unit:'h',value:6.5,observedAt:'2026-10-03T10:00:00.000Z'}]};
          const deviceRecords=[{id:'SYNTHETIC-DEVICE-STORE',kind:'observation',mission:{missionId:base.missionId,crewMemberId:base.crewMemberId},
            eventTimestamp:'2026-10-04T10:00:00Z',createdAt:'2026-10-04T10:00:01Z',sourceId:'SYNTHETIC-STRAP',
            payload:{observation:{id:'SYNTHETIC-WEARABLE-'+('9876543210abcdef'.repeat(8)),mission:{missionId:base.missionId,crewMemberId:base.crewMemberId},
            source:{sourceId:'SYNTHETIC-STRAP',sourceType:'device',adapterId:'org.mitochondria.web-bluetooth-heart-rate',manufacturer:'SYNTHETIC',model:'Strap'},
            metric:{code:'phys.heart_rate',displayName:'Heart rate',domain:'physiological',valueKind:'number',unit:'bpm'},value:{number:64},
            observedAt:'2026-10-04T10:00:00Z',status:'final',quality:{level:'good',artifactFlags:[]},tags:['synthetic:true']},context:{tags:[]},reviewStatus:'raw'}}];
          const pending=Array.from({length:4},(_,i)=>({...base,id:'SYNTHETIC-EXCLUDED-'+i+'-'+('fedcba9876543210'.repeat(8)),variableId:'bone-001',unit:'',observedAt:'2026-10-05T10:00:00Z'}));
          domainEntries.bone.push(...pending);
          const identity='export async function loadMissionIdentity(){return {signedIn:true,userId:"SYNTHETIC-PRESENTATION",error:null,memberships:[{missionId:"SYNTHETIC-P29",crewMemberId:"SYNTHETIC-CREW",role:"crew_self",missionName:"SYNTHETIC P29",crewDisplayName:"Synthetic display fixture"}]}}; export function subscribeMissionIdentity(){return ()=>{}};';
          const adapters={
            '/src/infrastructure/mission-identity.ts':identity,
            '/src/domain/health-intelligence/unified-health-report-loader.ts':'export async function loadUnifiedReportInputs(){return '+JSON.stringify({domainEntries,unifiedObservations:[],deviceRecords})+'}',
            '/src/components/medical-advisor-workbench.tsx':'export function MedicalAdvisorWorkbench(){return null}',
            '/src/components/synthetic-medical-review.tsx':'export function SyntheticMedicalReview(){return null}'};
          const modules={};
          source=source.replace(/from\s+(["'])([^"']+)\1/g,(whole,quote,path)=>{
            const adapter=adapters[path.split('?')[0]];
            if(adapter)modules[path.split('/').pop()]=adapter;
            return 'from '+JSON.stringify(adapter?location.origin+'/__p29_presentation/'+path.split('/').pop():path.startsWith('/')?location.origin+path:path);
          });
          modules['report.js']=source;
          return modules;
        }''')
        await page.close()
        page = await context.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.route('http://localhost:8080/__p29_fixture', lambda route: route.fulfill(content_type='text/html', body='<html><head><link rel="stylesheet" href="/src/styles.css"></head><body></body></html>'))
        await page.goto('http://localhost:8080/__p29_fixture', wait_until='networkidle')
        await page.route('**/__p29_presentation/*', lambda route: route.fulfill(status=200, content_type='text/javascript', body=modules[route.request.url.rsplit('/', 1)[-1]]))
        await page.evaluate("async () => { const m=await import("/@react-refresh");m.default.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>()=>{};window.__vite_plugin_react_preamble_installed__=true; }")
        await page.evaluate("v => window.p29Version=v", re.search(r'react\.js\?v=([a-z0-9]+)', modules['report.js']).group(1))
        await page.evaluate(r'''async () => {
          const {default:React}=await import('/node_modules/.vite/deps/react.js?v='+window.p29Version);
          const {default:Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.p29Version);
          const {AstronautHealthReport}=await import('/__p29_presentation/report.js');
          const host=document.createElement('div');document.body.replaceChildren(host);
          Client.createRoot(host).render(React.createElement(AstronautHealthReport));
        }''')
        await page.wait_for_timeout(700)
        await page.get_by_label('Authorized mission and crew').select_option('SYNTHETIC-P29|SYNTHETIC-CREW')
        await page.locator('.report-history-table tbody tr').nth(63).wait_for()
        assert await page.locator('.report-history-table tbody tr').count() == 64
        assert await page.locator('.report-exclusions-table tbody tr').count() == 4
        for width, height in [(390,844),(1280,1800)]:
            await page.set_viewport_size({'width':width,'height':height})
            assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            await page.locator('section[aria-label="Chronological history"]').screenshot(path=str(OUT / f'history-{width}.png'))
            overflow = await page.locator('.report-table').evaluate_all('(tables)=>tables.flatMap(t=>[...t.querySelectorAll("th,td")]).filter(c=>c.scrollWidth>c.clientWidth+1).length')
            assert overflow == 0, overflow
        await page.emulate_media(media='print')
        # Match A4 printable width for layout measurement, independent of mobile width.
        await page.set_viewport_size({'width':703,'height':1800})
        assert await page.locator('.report-history-table').evaluate('t=>t.scrollWidth<=t.clientWidth+1')
        await page.pdf(path=str(OUT/'report-a4.pdf'), format='A4', prefer_css_page_size=True, print_background=True, display_header_footer=False)
        await page.set_viewport_size({'width':390,'height':844})
        await page.pdf(path=str(OUT/'report-a4-from-mobile.pdf'), format='A4', prefer_css_page_size=True, print_background=True)
        ids=['SYNTHETIC-P29-'+str(i).zfill(3)+'-'+'abcdef0123456789'*8 for i in range(60)]
        assert errors == [], errors
        await browser.close()

    for name in ['report-a4','report-a4-from-mobile']:
        pdf=OUT/(name+'.pdf')
        subprocess.run(['pdftotext','-bbox',str(pdf),str(OUT/(name+'.html'))],check=True)
        root=ET.parse(OUT/(name+'.html')).getroot()
        ns={'x':'http://www.w3.org/1999/xhtml'}
        pages=root.findall('.//x:page',ns)
        assert len(pages)>=3, len(pages)
        text=''.join(''.join(root.itertext()).split())
        for ident in ids:
            assert ident in text, ident
        assert 'Εργαστήριο' in text
        assert 'mmHg' in text and '10^9/L' in text and '09:12:34.123Z' in text
        assert 'SYNTHETIC-EXCLUDED-3-' in text
        for index,pdfpage in enumerate(pages):
            w=float(pdfpage.attrib['width']);h=float(pdfpage.attrib['height'])
            assert abs(w-595.28)<1 and abs(h-841.89)<1
            for word in pdfpage.findall('.//x:word',ns):
                a=word.attrib
                assert float(a['xMin']) >= 32 and float(a['xMax']) <= w-32, (index,a,word.text)
                assert float(a['yMin'])>=8 and float(a['yMax'])<=h-8, (index,a,word.text)
        subprocess.run(['pdftoppm','-f','1','-l','2','-scale-to','1500','-png',str(pdf),str(OUT/name)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        print(f'PASS: {name}: {len(pages)} actual A4 pages, all 60 long IDs and Greek/English/units/precise times retained; text within page bounds')
    (OUT/'results.json').write_text(json.dumps({'rows':64,'excluded':4,'longIds':60,'browserErrors':errors,'acceptance':'synthetic presentation only'},indent=2))


asyncio.run(main())