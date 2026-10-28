import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path('/tmp/browser/bone-restoration'); OUT.mkdir(parents=True,exist_ok=True)
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
      if(name==='form.js') source=source.replace(/import[^;]*from \"\/src\/domain\/bone-health\/import-authorization.ts\";/,'const authorizeBoneImport=async scope=>{if(window.fileTest.denied)throw new Error(\"denied\");return {...scope,userId:\"synthetic-user\"};};const clearRetainedBoneImport=()=>sessionStorage.removeItem(\"mitochondria.bone-import.synthetic.v1\");const watchBoneImportSignOut=()=>{};').replace(/import[^;]*from \"\/src\/infrastructure\/mission-identity.ts\";/,'const subscribeMissionIdentity=listener=>{window.fileTest.refresh=listener;return ()=>{};};');
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
    window.fileTest.render=()=>{window.fileTest.root=Client.createRoot(host);window.fileTest.root.render(React.createElement(BoneHealthImport,{missionId:'synthetic-mission',crewMemberId:'synthetic-crew',dataOrigin:'synthetic',onImported:async()=>{}}));};window.fileTest.render();
  }''')
  button=page.get_by_role('button',name='Choose laboratory files',exact=True)
  await button.wait_for(); await page.wait_for_function("!document.querySelector('button').disabled && !document.querySelector('fieldset').disabled")
  assert await page.locator('input[type=file]').count()==1
  assert await button.evaluate('(e)=>getComputedStyle(e).cursor')=='pointer'
  await button.focus()
  async with page.expect_file_chooser() as fc: await button.press('Enter')
  csv='variable,value,unit,observed_at,source\nbone-001,12,custom-unit,2026-10-28T07:18:00Z,Synthetic lab'
  await (await fc.value).set_files([{'name':'results.csv','mimeType':'text/csv','buffer':csv.encode()}, {'name':'broken.csv','mimeType':'text/csv','buffer':b'wrong header'}, {'name':'synthetic.pdf','mimeType':'application/pdf','buffer':Path('/dev-server/tests/fixtures/p3661-synthetic-lab-report.pdf').read_bytes()}])
  await page.get_by_role('status').filter(has_text='CSV parsing').wait_for()
  await page.get_by_role('status').filter(has_text='PDF selectable text').wait_for(timeout=30000)
  assert await page.get_by_role('status').filter(has_text='Required CSV headers').count()==1
  assert await page.locator('fieldset fieldset').count()==3
  assert await page.locator('input[type=checkbox]:checked').count()==0
  # Corrected-text recheck accepts table IDs and CSV and exposes unsupported rows.
  pdf_item=page.locator('li').filter(has=page.get_by_role('heading',name='synthetic.pdf',exact=True))
  await pdf_item.get_by_text('Review extracted text',exact=True).click()
  text=pdf_item.get_by_label('Review and correct extracted text (local only)')
  await text.fill('bone-999 12 nmol')
  await pdf_item.get_by_role('button',name='Recheck corrected text').click()
  assert await pdf_item.get_by_role('alert').count()==1
  await text.fill('Catalog ID | Result | Unit\nbone-002 | 42.5 | nmol\nbone-003 | 3.1 | nmol')
  await pdf_item.get_by_role('button',name='Recheck corrected text').click()
  assert await pdf_item.locator('fieldset').count()==2
  await text.fill('variable,value,unit,observed_at,source\nbone-002,42.5,nmol,2026-10-28T07:18:00Z,Synthetic lab\nbone-003,3.1,nmol,2026-10-28T07:18:00Z,Synthetic lab')
  await pdf_item.get_by_role('button',name='Recheck corrected text').click()
  assert await pdf_item.locator('fieldset').count()==2
  await page.get_by_role('button',name='Check offline OCR readiness').click()
  await page.get_by_role('status').filter(has_text='CSV and selectable-text PDFs remain available').wait_for()
  await page.locator('fieldset fieldset').first.get_by_role('checkbox').check()
  # PDF rows need an explicit reported date; all rows remain separate reviewer decisions.
  for fs in (await page.locator('fieldset fieldset').all())[1:]:
    await fs.get_by_label('Observation date / time (ISO 8601)').fill('2026-10-28T07:18:00Z')
    await fs.get_by_role('checkbox').check()
  await page.evaluate('window.dispatchEvent(new Event("focus"))')
  await page.wait_for_timeout(250)
  assert await page.locator('input[type=checkbox]:checked').count()==0
  await page.evaluate('window.fileTest.root.unmount();window.fileTest.render()')
  await button.wait_for(); await page.wait_for_timeout(250)
  assert await page.locator('fieldset fieldset').count()==3
  assert await page.get_by_text('Re-select original file to reprocess',exact=True).count()>=3
  assert await page.locator('input[type=checkbox]:checked').count()==0
  for fs in await page.locator('fieldset fieldset').all(): await fs.get_by_role('checkbox').check()
  await page.get_by_role('button',name='Confirm selected results and save').click()
  await page.get_by_role('status').filter(has_text='1 saved. Synthetic save failure').wait_for()
  assert await page.evaluate('window.fileTest.writes.length')==1
  assert await page.locator('fieldset fieldset').first.get_by_role('checkbox').is_disabled()
  await page.evaluate('window.fileTest.root.unmount();window.fileTest.render()'); await page.wait_for_timeout(250)
  assert await page.locator('fieldset fieldset').first.get_by_role('checkbox').is_disabled()
  for fs in (await page.locator('fieldset fieldset').all())[1:]: await fs.get_by_role('checkbox').check()
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
  await page.evaluate('window.fileTest.denied=true;window.fileTest.refresh()'); await page.wait_for_timeout(250)
  assert await page.locator('fieldset fieldset').count()==0
  assert await page.evaluate('sessionStorage.getItem("mitochondria.bone-import.synthetic.v1")') is None
  print(json.dumps({'passed':['single picker','keyboard file chooser','mixed multiple-file selection','CSV corrected-text recheck','PDF table corrected-text recheck and errors','real PDF selectable text extraction','OCR unavailable handled independently','tab/refocus resets approval','remount preserves edits','denied restoration clears cache','partial-save remount receipts and safe retry','desktop/mobile no overflow','global enabled/disabled cursors'], 'scope':'synthetic in-memory history/authorization adapter, not encrypted-storage/auth acceptance','page_errors':errors}))
  await browser.close()
asyncio.run(main())
