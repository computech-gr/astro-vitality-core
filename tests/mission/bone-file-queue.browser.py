import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/bone-files')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1280,'height':1800})
  errors=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://localhost:8080/mission/bone-health',wait_until='networkidle')
  modules=await page.evaluate(r'''async()=>{
    const modules={}; window.fileTest={writes:[],failAt:2};
    const hist=await (await fetch('/src/domain/bone-health/history.ts')).text();
    let adapter=hist.slice(0,hist.indexOf('import * as RefreshRuntime'));
    adapter=adapter.replace(/import[^;]*from "\/src\/infrastructure\/offline[^;]*;/,'const persistOfflineMissionEvent=async()=>{}; const getOfflineMissionStore=()=>({list:async()=>[]});');
    adapter=adapter.replace('export async function saveBoneEntry(entry)', 'async function originalSave(entry)');
    adapter+='\nexport async function saveBoneEntry(entry){ if(window.fileTest.writes.length+1===window.fileTest.failAt)throw new Error("Synthetic save failure"); window.fileTest.writes.push(entry); }';
    adapter=adapter.replace('export async function listBoneEntries(', 'async function originalList(');
    adapter+='\nexport async function listBoneEntries(){return window.fileTest.writes;}';
    modules['history.js']=adapter;
    for(const [name,path] of [['queue.js','/src/domain/bone-health/file-queue.ts'],['form.js','/src/components/bone-health-import.tsx']]){
      let source=await (await fetch(path)).text(); source=source.slice(0,source.indexOf('import * as RefreshRuntime'));
      source=source.replace(/import\.meta\.hot = [^;]+;/,'');
      source='const $RefreshSig$=()=>()=>{}; const $RefreshReg$=()=>{};\n'+source;
      if(name==='form.js')window.reactVersion=source.match(/react\.js\?v=([a-z0-9]+)/)[1];
      source=source.replace(/from\s+(["'])([^"']+)\1/g,(whole,q,path)=>{
        let target=path.startsWith('/src/domain/bone-health/history.ts')?'/__files/history.js':path.startsWith('/src/domain/bone-health/file-queue.ts')?'/__files/queue.js':path;
        return 'from '+JSON.stringify(target.startsWith('/')?location.origin+target:target);
      }); modules[name]=source;
    } return modules;
  }''')
  await page.route('**/__files/*',lambda route:route.fulfill(status=200,content_type='text/javascript',body=modules[route.request.url.rsplit('/',1)[-1]]))
  await page.evaluate('''async()=>{
    const {default:React}=await import('/node_modules/.vite/deps/react.js?v='+window.reactVersion);
    const {default:Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.reactVersion);
    const {BoneHealthImport}=await import('/__files/form.js');
    const host=document.createElement('main');host.className='mx-auto max-w-5xl p-5';document.body.replaceChildren(host);
    Client.createRoot(host).render(React.createElement(BoneHealthImport,{missionId:'synthetic-mission',crewMemberId:'synthetic-crew',dataOrigin:'synthetic',onImported:async()=>{}}));
  }''')
  button=page.get_by_role('button',name='Choose laboratory files',exact=True)
  await button.wait_for()
  assert await page.locator('input[type=file]').count()==1
  assert await button.evaluate('(e)=>getComputedStyle(e).cursor')=='pointer'
  await button.focus()
  async with page.expect_file_chooser() as fc: await button.press('Enter')
  csv='variable,value,unit,observed_at,source\nbone-001,12,custom-unit,2026-10-28T07:18:00Z,Synthetic lab'
  await (await fc.value).set_files([{'name':'results.csv','mimeType':'text/csv','buffer':csv.encode()}, {'name':'broken.csv','mimeType':'text/csv','buffer':b'wrong header'}, {'name':'synthetic.pdf','mimeType':'application/pdf','buffer':Path('/dev-server/tests/fixtures/p3661-synthetic-lab-report.pdf').read_bytes()}])
  await page.get_by_role('status').filter(has_text='CSV parsing').wait_for()
  await page.get_by_role('status').filter(has_text='PDF selectable text').wait_for(timeout=30000)
  assert await page.get_by_role('status').filter(has_text='Required CSV headers').count()==1
  assert await page.locator('fieldset').count()==3
  assert await page.locator('input[type=checkbox]:checked').count()==0
  await page.get_by_role('button',name='Check offline OCR readiness').click()
  await page.get_by_role('status').filter(has_text='CSV and selectable-text PDFs remain available').wait_for()
  await page.locator('fieldset').first.get_by_role('checkbox').check()
  # PDF rows need an explicit reported date; all rows remain separate reviewer decisions.
  for fs in (await page.locator('fieldset').all())[1:]:
    await fs.get_by_label('Observation date / time (ISO 8601)').fill('2026-10-28T07:18:00Z')
    await fs.get_by_role('checkbox').check()
  await page.get_by_role('button',name='Confirm selected results and save').click()
  await page.get_by_role('status').filter(has_text='1 saved. Synthetic save failure').wait_for()
  assert await page.evaluate('window.fileTest.writes.length')==1
  assert await page.locator('fieldset').first.get_by_role('checkbox').is_disabled()
  await page.evaluate('window.fileTest.failAt=0')
  await page.get_by_role('button',name='Confirm selected results and save').click()
  await page.get_by_role('status').filter(has_text='2 results saved').wait_for()
  assert await page.evaluate('new Set(window.fileTest.writes.map(r=>r.id)).size')==3
  await page.screenshot(path=str(OUT/'desktop.png'))
  await page.set_viewport_size({'width':390,'height':844})
  await button.scroll_into_view_if_needed()
  await page.screenshot(path=str(OUT/'mobile.png'))
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  # Offline OCR failure: use a valid image, block only OCR dependencies, never medical uploads.
  await page.route('**/*tesseract*',lambda route:route.abort())
  await page.route('**/*traineddata*',lambda route:route.abort())
  await page.evaluate('''async()=>{const c=document.createElement('canvas');c.width=40;c.height=40;window.testPng=Array.from(new Uint8Array(await (await new Promise(r=>c.toBlob(r))).arrayBuffer()));}''')
  png=bytes(await page.evaluate('window.testPng'))
  await page.set_input_files('input[type=file]',[{'name':'scan.png','mimeType':'image/png','buffer':png}])
  await page.get_by_role('status').filter(has_text='On-device OCR unavailable').wait_for(timeout=30000)
  await page.get_by_role('button',name='Remove scan.png').click()
  assert await page.get_by_role('heading',name='scan.png').count()==0
  cursors=await page.evaluate('''()=>{const h=document.createElement('div');h.innerHTML='<div role="menuitem" class="cursor-default">Menu</div><button disabled>Disabled</button><label for="test-choice">Clickable</label><input id="test-choice" type="checkbox"><input type="file" disabled><div role="option" data-disabled>Disabled option</div>';document.body.append(h);const c=[...h.children].map(e=>getComputedStyle(e).cursor);h.remove();return c;}''')
  assert cursors==['pointer','not-allowed','pointer','pointer','not-allowed','not-allowed'],cursors
  print(json.dumps({'passed':['single picker','keyboard file chooser','mixed multiple-file selection','real CSV parsing','real PDF selectable text extraction','OCR unavailable handled independently','unchecked human review','partial save receipt and safe retry','desktop/mobile no overflow','global enabled/disabled cursors'], 'scope':'synthetic in-memory history adapter, not encrypted-storage/auth acceptance','page_errors':errors}))
  await browser.close()
asyncio.run(main())
