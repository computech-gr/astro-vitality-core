# P33 browser regression: real PDF upload through the shared four-domain import
# workflow, using synthetic in-memory authorization/history adapters only.
# No encrypted storage, no real accounts, no external services.
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/p33-universal')
OUT.mkdir(parents=True, exist_ok=True)
FIXTURES = Path('/dev-server/fixtures/synthetic/p33')
BONE_FIXTURE = Path('/dev-server/tests/fixtures/p3661-synthetic-lab-report.pdf')

DOMAINS = [
    # (profile export, fixture, expected matched count, needs shared date)
    ('IMMUNE_MEASUREMENT_PROFILE', 'p28-immune-report.pdf', 5, False),
    ('CARDIOVASCULAR_MEASUREMENT_PROFILE', 'p28-cardiovascular-report.pdf', 5, False),
    ('BEHAVIORAL_MEASUREMENT_PROFILE', 'p28-behavioral-report.pdf', 4, True),
    ('BONE_MEASUREMENT_PROFILE', None, 2, True),
    # P34: the two actual user-supplied cardiovascular PDFs.
    ('CARDIOVASCULAR_MEASUREMENT_PROFILE', '../p34/original-cardio-five-column.pdf', 5, False),
    ('CARDIOVASCULAR_MEASUREMENT_PROFILE', '../p34/p32-cardio-simple.pdf', 5, True),
]

HARNESS = r'''async()=>{
  const modules={}; window.p33={writes:[]};
  const strip=(s)=>s.slice(0,s.indexOf('import * as RefreshRuntime'));
  const fix=(s)=>'const $RefreshSig$=()=>()=>{}; const $RefreshReg$=()=>{};\n'+s.replace(/import\.meta\.hot = [^;]+;/,'');
  // In-memory history adapter: saveBoneEntry/listBoneEntries only.
  let hist=strip(await (await fetch('/src/domain/bone-health/history.ts')).text());
  hist=hist.replace(/import[^;]*from "\/src\/infrastructure\/offline[^;]*;/,'const persistOfflineMissionEvent=async()=>{}; const getOfflineMissionStore=()=>({list:async()=>[]});');
  hist=hist.replace(/export async function saveBoneEntry\s*\(/,'async function originalSave(');
  hist+='\nexport async function saveBoneEntry(entry){ window.p33.writes.push(entry); }';
  hist=hist.replace(/export async function listBoneEntries\s*\(/,'async function originalList(');
  hist+='\nexport async function listBoneEntries(){return window.p33.writes;}';
  modules['history.js']=hist;
  // Synthetic authorization stub: always the same signed-in synthetic user.
  modules['authz.js']='export async function authorizeBoneImport(scope){return {...scope,userId:"synthetic-user"};}\n'
    +'export function clearRetainedBoneImport(){try{window.sessionStorage.clear();}catch{}}\n'
    +'export function watchBoneImportSignOut(){}';
  modules['identity.js']='export function subscribeMissionIdentity(){return ()=>{};}';
  const rewrite=(source,map)=>source.replace(/from\s+(["'])([^"']+)\1/g,(whole,q,path)=>{
    for(const [prefix,target] of map){ if(path.startsWith(prefix)) return 'from '+JSON.stringify(location.origin+target); }
    return whole;
  });
  let queue=fix(strip(await (await fetch('/src/domain/bone-health/file-queue.ts')).text()));
  queue=rewrite(queue,[['/src/domain/bone-health/history.ts','/__files/history.js']]);
  modules['queue.js']=queue;
  let form=fix(strip(await (await fetch('/src/components/bone-health-import.tsx')).text()));
  window.reactVersion=form.match(/react\.js\?v=([a-z0-9]+)/)[1];
  form=rewrite(form,[
    ['/src/domain/bone-health/history.ts','/__files/history.js'],
    ['/src/domain/bone-health/file-queue.ts','/__files/queue.js'],
    ['/src/domain/bone-health/import-authorization.ts','/__files/authz.js'],
    ['/src/infrastructure/mission-identity.ts','/__files/identity.js'],
  ]);
  modules['form.js']=form;
  return modules;
}'''

RENDER = r'''async(profileName)=>{
  await import('/__files/form.js'); // ensures module graph is registered
  const {default:React}=await import('/node_modules/.vite/deps/react.js?v='+window.reactVersion);
  const {default:Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.reactVersion);
  const {MeasurementProfileProvider}=await import('/src/components/measurement-profile-context.tsx');
  const profiles=await import('/src/domain/health-measurements/profiles.ts');
  const {BoneHealthImport}=await import('/__files/form.js');
  window.sessionStorage.clear();
  let host=document.getElementById('p33-host');
  if(!host){host=document.createElement('main');host.id='p33-host';host.className='mx-auto max-w-5xl p-5';document.body.replaceChildren(host);}
  if(window.p33root) window.p33root.unmount();
  window.p33root=Client.createRoot(host);
  window.p33root.render(React.createElement(MeasurementProfileProvider,{profile:profiles[profileName]},
    React.createElement(BoneHealthImport,{missionId:'synthetic-mission',crewMemberId:'synthetic-crew',dataOrigin:'synthetic',onImported:async()=>{}})));
}'''

async def run_domain(page, profile, fixture, expected, needs_date, screenshot=False):
    await page.evaluate(RENDER, profile)
    await page.get_by_role('button', name='Choose laboratory files', exact=True).wait_for()
    path = FIXTURES / fixture if fixture else BONE_FIXTURE
    await page.set_input_files('input[type=file]', [{'name': path.name, 'mimeType': 'application/pdf', 'buffer': path.read_bytes()}])
    diag = page.get_by_role('status').filter(has_text='Extraction:')
    await diag.wait_for(timeout=60000)
    text = await diag.text_content()
    assert f'{expected} matched' in text, text
    assert '0 held' in text, text
    assert path.name in text, text  # source traceability
    rows = page.locator('input[type=checkbox][aria-label^="I verified"]')
    assert await rows.count() == expected, await rows.count()
    if needs_date:
        section = page.locator('section[aria-label="Shared observation date for this file"]')
        await section.locator('input[type=datetime-local]').fill('2026-10-01T09:00')
        await section.locator('input[type=checkbox]').click()  # explicit confirmation auto-applies; section then unmounts
    await page.get_by_role('checkbox', name=re.compile('^Verify All')).check()
    await page.get_by_role('button', name='Confirm selected results and save').click()
    await page.get_by_role('status').filter(has_text=f'{expected} results saved').wait_for()
    writes = await page.evaluate('window.p33.writes.map(w=>[w.variableId,w.unit,w.observedAt,w.sourceLabel,w.dataOrigin])')
    assert len(writes) == expected, writes
    assert all(w[2] for w in writes), writes  # every saved row has an explicit date
    assert all(path.name in (w[3] or '') for w in writes), writes  # source file traceability
    assert all(w[4] == 'synthetic' for w in writes), writes
    if screenshot:
        await page.screenshot(path=str(OUT / 'desktop.png'))
        await page.set_viewport_size({'width': 390, 'height': 844})
        await page.screenshot(path=str(OUT / 'mobile.png'))
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        await page.set_viewport_size({'width': 1280, 'height': 1800})
    return writes

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 1800})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        await page.goto('http://localhost:8080/mission/bone-health', wait_until='networkidle')
        modules = await page.evaluate(HARNESS)
        await page.route('**/__files/*', lambda route: route.fulfill(
            status=200, content_type='text/javascript',
            body=modules[route.request.url.rsplit('/', 1)[-1]]))

        saved = {}
        for i, (profile, fixture, expected, needs_date) in enumerate(DOMAINS):
            await page.evaluate('window.p33.writes=[]')
            writes = await run_domain(page, profile, fixture, expected, needs_date, screenshot=(i == 0))
            saved[profile] = [w[0] for w in writes]

        # Unsupported layout fails closed: explicit reasons, zero fabricated rows.
        await page.evaluate(RENDER, 'IMMUNE_MEASUREMENT_PROFILE')
        await page.get_by_role('button', name='Choose laboratory files', exact=True).wait_for()
        bad = FIXTURES / 'p33-unsupported-layout.pdf'
        await page.set_input_files('input[type=file]', [{'name': bad.name, 'mimeType': 'application/pdf', 'buffer': bad.read_bytes()}])
        diag = page.get_by_role('status').filter(has_text='Extraction:')
        await diag.wait_for(timeout=60000)
        text = await diag.text_content()
        assert '0 matched' in text and 'held' in text, text
        await page.get_by_text('No catalog-matched measurements').wait_for()
        body = await page.text_content('main')
        assert 'IMM-999' in body, body[:800]
        assert await page.locator('input[type=checkbox][aria-label^="I verified"]').count() == 0

        print(json.dumps({
            'passed': [
                'immune PDF: 5 rows recognized, reviewed, saved with header-tied dates',
                'cardiovascular PDF: 5 rows recognized from Greek reordered headers, saved',
                'behavioral PDF: 4 rows recognized (wrapped name, decimal comma), shared date confirmed',
                'bone fixture PDF: 2 rows still recognized, saved',
                'source file name traced into diagnostics and every saved record',
                'unsupported layout: zero matches, explicit IMM-999 held reason, no fabrication',
                'desktop/mobile layout without horizontal overflow',
            ],
            'saved_variable_ids': saved,
            'scope': 'synthetic in-memory adapters; not encrypted-storage/auth acceptance',
            'page_errors': errors,
        }, indent=1))
        await browser.close()

asyncio.run(main())
