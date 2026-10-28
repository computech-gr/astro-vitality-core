"""P30 actual component screen checks and same-DOM A4 print equivalence.

Memory-only synthetic adapters; no Cloud writes, AI calls or approvals.
Run: python3 tests/navigation/p30-medical-contrast.browser.py
"""
import asyncio
import json
from pathlib import Path

OUT = Path('/tmp/browser/p30-medical-contrast')


async def check_p30(page, context, modules):
    await page.emulate_media(media='screen')
    for width, height in [(1280, 1800), (390, 844)]:
        await page.set_viewport_size({'width': width, 'height': height})
        primary = page.get_by_role('button', name='Print / Save as PDF', exact=True)
        secondary = page.get_by_role('button', name='Export evidence text', exact=True)
        await check_control(primary, 'rgb(8, 127, 156)', 'rgb(255, 255, 255)')
        await check_control(secondary, 'rgb(239, 248, 255)', 'rgb(18, 62, 99)')
        await primary.focus()
        await primary.press('Tab')
        assert await secondary.evaluate('e=>e.matches(":focus-visible")')
        assert await secondary.evaluate('e=>getComputedStyle(e).outlineWidth') == '3px'
        await page.locator('.report-print > div').first.screenshot(path=str(OUT / f'report-actions-{width}.png'))

    # Compare every rendered report element under print media with the same DOM,
    # first using the P29 stylesheet, then current P30. Generated dates cannot
    # introduce differences because the report is never reconstructed here.
    before_css = Path('/tmp/browser/p30/before-styles.css').read_text()
    current_css = Path('src/styles.css').read_text()
    assert current_css.startswith(before_css)
    p30_css = current_css[len(before_css):]
    await page.emulate_media(media='print')
    await page.set_viewport_size({'width': 703, 'height': 1800})
    await page.evaluate('''() => { window.p30ScreenRules=[];
      for(const sheet of document.styleSheets) for(const rule of [...sheet.cssRules])
        if(rule.media?.mediaText==='screen' && rule.cssText.includes('medical-action-primary')) {
          window.p30ScreenRules.push(rule); rule.media.mediaText='not all';
        }
      if(!window.p30ScreenRules.length) throw Error('P30 screen rule not found');
    }''')
    read_styles = '''() => [...document.querySelectorAll('.report-print, .report-print *')].map(e=>{
      const s=getComputedStyle(e);const r=e.getBoundingClientRect();
      return [e.tagName,[...s].map(p=>[p,s.getPropertyValue(p)]),r.x,r.y,r.width,r.height];
    })'''
    baseline = await page.evaluate(read_styles)
    await page.pdf(path=str(OUT / 'same-dom-p29-a4.pdf'), format='A4', prefer_css_page_size=True, print_background=True)
    await page.evaluate('()=>window.p30ScreenRules.forEach(r=>r.media.mediaText="screen")')
    assert await page.evaluate(read_styles) == baseline, 'Print styles or element dimensions changed'
    await page.pdf(path=str(OUT / 'same-dom-p30-a4.pdf'), format='A4', prefer_css_page_size=True, print_background=True)
    print('PASS: all computed print styles and element positions unchanged on the same 64-record report')

    # Use the real compiled advisor and report builder; substitute only the
    # history read/server hook in this disposable browser module.
    source = await page.evaluate('async()=>await(await fetch("/src/components/medical-advisor-workbench.tsx")).text()')
    source = source[:source.index('import * as RefreshRuntime')]
    import re
    source = re.sub(r'import\.meta\.hot = [^;]+;', '', source)
    source = 'const $RefreshSig$=()=>()=>{};const $RefreshReg$=()=>{};\n' + source
    source = re.sub(r'import \{ useServerFn \} from [^;]+;', 'const useServerFn=()=>async()=>({events:[],reason:"Synthetic presentation history only"});', source)
    source = re.sub(r'import \{ getMedicalReviewHistory \} from [^;]+;', 'const getMedicalReviewHistory={};', source)
    source = re.sub(r'from\s+(["\'])(/[^"\']+)\1', lambda m: 'from '+json.dumps('http://localhost:8080'+m.group(2)), source)
    await page.route('**/__p30_advisor.js', lambda route: route.fulfill(content_type='text/javascript', body=source))
    await page.emulate_media(media='screen')
    await page.evaluate('''async()=>{
      const {default:React}=await import('/node_modules/.vite/deps/react.js?v='+window.p29Version);
      const {default:Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.p29Version);
      const {MedicalAdvisorWorkbench}=await import('/__p30_advisor.js');
      const {buildHealthHistoryReport}=await import('/src/domain/health-intelligence/health-history-report.ts');
      const o={schema:'mitochondria.unified-observation.v1',id:'SYNTHETIC-P30-OBS',missionId:'SYNTHETIC-P30',crewMemberId:'SYNTHETIC-CREW',metricId:'cv-001',domain:'cardiovascular',value:'62',originalUnit:'bpm',observedAt:'2026-10-01T10:00:00Z',recordedAt:'2026-10-01T10:00:00Z',source:{kind:'manual',label:'SYNTHETIC'},provenance:'synthetic',quality:{reviewerConfirmed:true},reviewState:'accepted'};
      const host=document.createElement('article');host.className='report-print';document.body.replaceChildren(host);
      const root=Client.createRoot(host);window.p30Render=empty=>root.render(React.createElement(MedicalAdvisorWorkbench,{report:buildHealthHistoryReport(empty?[]:[o],o.missionId,o.crewMemberId,'synthetic'),authorizedMedicalRole:false,advisorLabel:'SYNTHETIC presentation only'}));
      window.p30Render(true);
    }''')
    export = page.get_by_role('button', name='Export de-identified evidence prompt (manual transfer)', exact=True)
    capture = page.get_by_role('button', name='Capture unverified draft', exact=True)
    for width, height in [(1280, 1800), (390, 844)]:
        await page.set_viewport_size({'width': width, 'height': height})
        await page.evaluate('()=>window.p30Render(true)')
        await page.wait_for_timeout(100)
        assert await export.is_disabled() and await capture.is_disabled()
        for control in [export, capture]:
            await check_control(control, 'rgb(213, 220, 228)', 'rgb(71, 85, 105)')
            assert await control.evaluate('e=>getComputedStyle(e).opacity') == '1'
        await page.get_by_role('region', name='AI draft and medical advisor review').screenshot(path=str(OUT / f'advisor-disabled-{width}.png'))
        await page.evaluate('()=>window.p30Render(false)')
        await page.wait_for_timeout(100)
        await check_control(export, 'rgb(239, 248, 255)', 'rgb(18, 62, 99)')
        assert await capture.is_disabled()
        await export.focus()
        await export.press('Tab')
        draft = page.get_by_label('AI-generated English draft (paste after authorized processing)')
        assert await draft.evaluate('e=>e.matches(":focus-visible")')
        await check_control(draft, 'rgb(248, 251, 255)', 'rgb(19, 47, 74)')
        assert await draft.evaluate('e=>getComputedStyle(e).outlineWidth') == '3px'
        await draft.fill('SYNTHETIC UI TEST ONLY — cv-001 recorded 62 bpm [SYNTHETIC-P30-OBS]')
        await draft.press('Tab')
        await check_control(capture, 'rgb(8, 127, 156)', 'rgb(255, 255, 255)')
        await capture.press('Enter')
        await page.get_by_label('Medical advisor edited opinion').wait_for()
        for label in ['Medical advisor edited opinion', 'Advisor review rationale (required)']:
            field = page.get_by_label(label)
            await field.focus()
            await check_control(field, 'rgb(248, 251, 255)', 'rgb(19, 47, 74)')
        assert await page.get_by_role('button', name='Acknowledge reviewed draft (session only)', exact=True).is_disabled()
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        await page.get_by_role('region', name='AI draft and medical advisor review').screenshot(path=str(OUT / f'advisor-captured-{width}.png'))
    print('PASS: desktop/mobile actual advisor disabled/enabled buttons, all three textareas, keyboard capture/focus and no overflow; no acknowledgment or generation')


async def check_control(control, background, foreground):
    colors = await control.evaluate('e=>{const s=getComputedStyle(e);return [s.backgroundColor,s.color]}')
    assert colors == [background, foreground], colors


OUT.mkdir(parents=True, exist_ok=True)
# Reuse P29's exact menu, data fixture, pure read models and A4 assertions.
source = Path('tests/navigation/p29-medical-report.browser.py').read_text()
source = source.replace("OUT = Path('/tmp/browser/p29-medical-report')", "OUT = Path('/tmp/browser/p30-medical-contrast')")
source = source.replace('        await browser.close()', '        await check_p30(page, context, modules)\n        assert errors == [], errors\n        await browser.close()')
exec(compile(source, 'p29-reused-for-p30', 'exec'), globals())