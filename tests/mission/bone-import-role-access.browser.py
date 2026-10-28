"""Real Bone form/importer with isolated synthetic identity adapters; no Cloud writes."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path('/tmp/browser/bone-import-role-access')

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1280, 'height': 1800})
        await page.goto('http://localhost:8080/mission/bone-health', wait_until='networkidle')
        modules = await page.evaluate(r'''async () => {
          let source = await (await fetch('/src/components/bone-health-entry.tsx')).text();
          source = source.slice(0, source.indexOf('import * as RefreshRuntime'));
          source = source.replace(/import\.meta\.hot = [^;]+;/, '');
          source = 'const $RefreshSig$=()=>()=>{}; const $RefreshReg$=()=>{};\n'+source;
          window.roleReactVersion=source.match(/react\.js\?v=([a-z0-9]+)/)[1];
          window.roleTest={memberships:[],listeners:[],reads:[]};
          const adapters={
            '/src/infrastructure/mission-identity.ts':`export async function loadMissionIdentity(){return {memberships:window.roleTest.memberships,error:null}}; export function subscribeMissionIdentity(cb){window.roleTest.listeners.push(cb);return ()=>{}}`,
            '/src/domain/bone-health/history.ts':`export async function listBoneEntries(m,c){window.roleTest.reads.push([m,c]);return []};export function findPotentialDuplicates(){return []};export async function saveBoneEntry(){throw new Error('No writes permitted')};export async function markBoneEntryErroneous(){throw new Error('No writes permitted')}`,
            '/src/integrations/supabase/client.ts':`export const supabase={from(table){let ids=[];const q={select(){return q},in(key,values){ids=values;return q},eq(){return q},then(resolve){return Promise.resolve({data:table==='mission_memberships'?ids.map(m=>({mission_id:m,crew_member_id:m+'-crew',role:'crew_self',active:true})):ids.map(id=>({id,display_name:id})),error:null}).then(resolve)}};return q}}`,
            '/src/components/scientific-handbook-reference.tsx':'export function BoneHandbookReference(){return null}',
            '/src/components/health-domain-navigation.tsx':'export function HealthDomainNavigation(){return null}'
          };
          const modules={};
          source=source.replace(/from\s+(["'])([^"']+)\1/g,(whole,q,path)=>{
            const adapter=adapters[path.split('?')[0]];
            if(adapter)modules[path.split('/').pop()]=adapter;
            return 'from '+JSON.stringify(adapter?location.origin+'/__bone_role_test/'+path.split('/').pop():path.startsWith('/')?location.origin+path:path);
          });modules['form.js']=source;return modules;
        }''')
        await page.route('**/__bone_role_test/*', lambda route: route.fulfill(status=200, content_type='text/javascript', body=modules[route.request.url.rsplit('/', 1)[-1]]))
        await page.evaluate('''async()=>{
          const {default:React}=await import('/node_modules/.vite/deps/react.js?v='+window.roleReactVersion);
          const {default:Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.roleReactVersion);
          const {BoneHealthEntryPage}=await import('/__bone_role_test/form.js');
          const host=document.createElement('div');document.body.replaceChildren(host);Client.createRoot(host).render(React.createElement(BoneHealthEntryPage));
        }''')
        async def identity(rows):
            await page.evaluate('(rows)=>{window.roleTest.memberships=rows;window.roleTest.listeners.forEach(cb=>cb())}', rows)
            await page.wait_for_timeout(200)
        picker=page.get_by_role('button',name='Choose laboratory files',exact=True)
        access=page.get_by_role('region',name='Laboratory import access',exact=True)
        provenance=page.get_by_role('combobox',name='Import data provenance',exact=True)
        # Each eligible role starts with no history, no correction, and no inferred provenance.
        for role in ['crew_self', 'ground_medical']:
            await identity([{'missionId':'role-mission','crewMemberId':'role-mission-crew' if role=='crew_self' else None,'role':role}])
            await access.wait_for()
            if await provenance.input_value(): await provenance.select_option('')
            assert await picker.count()==0
            assert await page.get_by_role('button',name='Save correction',exact=True).count()==0
            await provenance.focus()
            await provenance.select_option('synthetic')
            await picker.wait_for()
            assert await page.locator('form select').filter(has=page.locator('option[value="synthetic"]')).input_value()=='synthetic'
            assert await picker.evaluate('(el)=>getComputedStyle(el).cursor')=='pointer'
            await picker.focus()
            async with page.expect_file_chooser() as fc: await picker.press('Enter')
            csv=b'variable,value,unit,observed_at,source\nbone-001,12,exact-unit,2026-10-28T07:43:00Z,Synthetic lab'
            await (await fc.value).set_files({'name':'role-results.csv','mimeType':'text/csv','buffer':csv})
            await page.get_by_role('status').filter(has_text='CSV parsing').wait_for()
            assert await page.locator('fieldset').count()==1
            assert await page.locator('input[type=checkbox]:checked').count()==0
            await provenance.select_option('real')
            assert await page.locator('fieldset').count()==0
            await provenance.select_option('')
            assert await picker.count()==0
        # Ground medical can select only crew in its authorized missions; scope change drops queue.
        await identity([{'missionId':m,'crewMemberId':None,'role':'ground_medical'} for m in ['role-mission','other-mission']])
        await provenance.select_option('synthetic')
        await page.get_by_label('Mission',exact=True).select_option('other-mission')
        await page.wait_for_timeout(200)
        assert await page.get_by_label('Crew member',exact=True).input_value()=='other-mission-crew'
        assert await page.locator('fieldset').count()==0
        for role in ['observer','mission_control']:
            await identity([{'missionId':'role-mission','crewMemberId':'role-mission-crew','role':role}])
            assert await access.count()==0
            assert await picker.count()==0
            assert await page.get_by_role('button',name='Save encrypted record',exact=True).is_disabled()
        await identity([{'missionId':'role-mission','crewMemberId':'role-mission-crew','role':'crew_self'}])
        crew_values=await page.get_by_label('Crew member',exact=True).locator('option').evaluate_all('(options)=>options.map(o=>o.value)')
        assert 'other-mission-crew' not in crew_values
        await provenance.select_option('synthetic')
        await access.screenshot(path=str(OUT/'desktop.png'))
        await page.set_viewport_size({'width':390,'height':844})
        await access.screenshot(path=str(OUT/'mobile.png'))
        assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        print('PASS: Crew Self and Ground Medical import before correction; explicit shared provenance; keyboard CSV selection; unchecked review; provenance/scope queue reset; unauthorized denial; crew isolation; desktop/mobile. Synthetic identity/history adapters, no storage acceptance or writes.')
        await browser.close()

asyncio.run(main())