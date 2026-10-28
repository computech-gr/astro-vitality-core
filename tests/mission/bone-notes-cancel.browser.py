"""Real Bone form with isolated synthetic identity/history adapters; no Cloud writes."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/bone-notes-cancel")

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 1800})
        await page.goto("http://localhost:8080/mission/bone-health", wait_until="networkidle")
        await page.route("**/__bone_ux_test/*", lambda route: route.fulfill(status=200, content_type="text/javascript", body=modules[route.request.url.rsplit("/", 1)[-1]]))
        modules = await page.evaluate(r'''async () => {
          let source = await (await fetch('/src/components/bone-health-entry.tsx')).text();
          source = source.slice(0, source.indexOf('import * as RefreshRuntime'));
          source = source.replace(/import\.meta\.hot = [^;]+;/, '');
          source = 'const $RefreshSig$=()=>()=>{}; const $RefreshReg$=()=>{};\n'+source;
          const version = source.match(/react\.js\?v=([a-z0-9]+)/)[1];
          window.boneReactVersion=version;
          const {default: React} = await import('/node_modules/.vite/deps/react.js?v='+version);
          const {default: Client} = await import('/node_modules/.vite/deps/react-dom_client.js?v='+version);
          window.boneTest = {rows: [], writes: [], fail: false};
          const identity = `export async function loadMissionIdentity(){return {memberships:[{missionId:'ux-mission',crewMemberId:'ux-crew',role:'crew_self'}],error:null}}; export function subscribeMissionIdentity(){return ()=>{}}`;
          const history = `export async function listBoneEntries(m,c){return window.boneTest.rows.filter(r=>r.missionId===m&&r.crewMemberId===c)};
            export function findPotentialDuplicates(){return []};
            export async function saveBoneEntry(row){if(window.boneTest.fail)throw new Error('Synthetic write failure');window.boneTest.writes.push('save');window.boneTest.rows.push({...row})};
            export async function markBoneEntryErroneous(row){window.boneTest.writes.push('mark');window.boneTest.rows=window.boneTest.rows.map(r=>r.id===row.id?{...r,status:'erroneous'}:r)}`;
          const adapters = {'/src/infrastructure/mission-identity.ts':identity, '/src/domain/bone-health/history.ts':history, '/src/integrations/supabase/client.ts':'export const supabase={};'};
          const modules={};
          source = source.replace(/from\s+(["'])([^"']+)\1/g, (whole, quote, path) => {
            const adapter=adapters[path.split('?')[0]];
            if(adapter) modules[path.split('/').pop()]=adapter;
            return 'from '+JSON.stringify(adapter ? location.origin+'/__bone_ux_test/'+path.split('/').pop() : path.startsWith('/') ? location.origin+path : path);
          });
          modules['form.js']=source;
          return modules;
        }''')
        await page.evaluate(r'''async () => {
          const {default: React}=await import('/node_modules/.vite/deps/react.js?v='+window.boneReactVersion);
          const {default: Client}=await import('/node_modules/.vite/deps/react-dom_client.js?v='+window.boneReactVersion);
          const {BoneHealthEntryPage} = await import('/__bone_ux_test/form.js');
          const host=document.createElement('div'); document.body.replaceChildren(host);
          Client.createRoot(host).render(React.createElement(BoneHealthEntryPage));
        }''')
        form = page.locator("form").first
        await page.get_by_role("button", name="Save encrypted record", exact=True).wait_for()
        await page.wait_for_timeout(300)
        for label in ["Lab / original source", "Specimen / modality", "Assay / method"]:
            combo = form.get_by_role("combobox", name=label, exact=True)
            assert await combo.input_value() == "", label
        await page.get_by_label("Result", exact=True).fill("12")
        await page.get_by_role("combobox", name="Unit (as reported)", exact=True).fill("pg/mL")
        await form.locator('input[type="datetime-local"]').fill("2026-10-28T08:49")
        source = form.get_by_role("combobox", name="Lab / original source", exact=True)
        await source.fill("Astronaut custom lab")
        await page.get_by_role("combobox", name="Specimen / modality", exact=True).fill("Custom specimen")
        await page.get_by_role("combobox", name="Assay / method", exact=True).fill("Custom assay")
        await page.get_by_label("Data provenance", exact=True).select_option("synthetic")
        notes = "Original notes\nExact unicode α and punctuation."
        await page.get_by_label("Notes", exact=True).fill(notes)
        await page.get_by_role("button", name="Save encrypted record", exact=True).click()
        await page.get_by_role("button", name="Correct", exact=True).click()
        assert await page.get_by_label("Notes", exact=True).input_value() == notes
        before = await page.evaluate("JSON.stringify(window.boneTest)")
        await page.get_by_label("Notes", exact=True).fill("Unsaved change")
        await page.get_by_label("Result", exact=True).fill("99")
        cancel = form.get_by_role("button", name="Cancel", exact=True)
        await cancel.focus()
        await cancel.press("Enter")
        assert await page.evaluate("JSON.stringify(window.boneTest)") == before
        assert await form.get_by_role("button", name="Save correction", exact=True).count() == 0
        for label in ["Notes", "Result"]:
            assert await page.get_by_label(label, exact=True).input_value() == ""
        assert await form.locator('input[type="datetime-local"]').input_value() == ""
        await page.get_by_role("button", name="Correct", exact=True).click()
        await page.get_by_label("Result", exact=True).fill("13")
        await page.evaluate("window.boneTest.fail=true")
        await page.get_by_role("button", name="Save correction", exact=True).click()
        await page.get_by_role("status").filter(has_text="Synthetic write failure").wait_for()
        assert await page.evaluate("window.boneTest.rows[0].status") is None
        await page.evaluate("window.boneTest.fail=false")
        await page.get_by_role("button", name="Save correction", exact=True).click()
        await page.get_by_role("status").filter(has_text="Correction saved;").wait_for()
        assert await page.evaluate("window.boneTest.rows.map(r=>r.notes)") == [notes, notes]
        assert await page.evaluate("window.boneTest.writes") == ["save", "save", "mark"]
        assert await page.evaluate("window.boneTest.rows[0].status") == "erroneous"
        # Global cursor behavior is checked from the loaded stylesheet, not source text.
        cursors = await page.evaluate('''() => {
          const host=document.createElement('div'); document.body.append(host);
          host.innerHTML='<button>Enabled</button><button disabled>Disabled</button><a href="#">Link</a><a href="#" aria-disabled="true">Disabled link</a><input type="text">';
          const values=[...host.children].map(el=>getComputedStyle(el).cursor);host.remove();return values;
        }''')
        assert cursors == ["pointer", "not-allowed", "pointer", "not-allowed", "text"], cursors
        await form.screenshot(path=str(OUT / "desktop.png"))
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.get_by_role("button", name="Correct", exact=True).click()
        await form.screenshot(path=str(OUT / "mobile.png"))
        assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        print("PASS: original notes, cancel without writes, failed-save guard, append-before-mark, custom metadata, enabled/disabled cursors, desktop/mobile")
        await browser.close()

asyncio.run(main())