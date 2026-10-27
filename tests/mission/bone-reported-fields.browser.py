"""Non-saving actual-form checks plus isolated synthetic picker interaction coverage."""
import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/bone-reported")

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        if os.environ.get("LOVABLE_BROWSER_AUTH_STATUS") == "injected":
            storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
            session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
            cookies = json.loads(os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON") or "[]")
        else:
            with open(os.path.expanduser("~/.cache/lovable-auth/session.json")) as f:
                minted = json.load(f)
            storage_key = minted["storage_key"]
            session_json = json.dumps(minted["session"])
            cookies = minted.get("cookies") or []
        if cookies:
            await context.add_cookies([{**c, "url": "http://localhost:8080"} for c in cookies])
        await page.goto("http://localhost:8080")
        await page.evaluate("([k,v]) => window.localStorage.setItem(k,v)", [storage_key, session_json])
        await page.goto("http://localhost:8080/mission/bone-health", wait_until="networkidle")
        unit = page.get_by_role("combobox", name="Unit (as reported)", exact=True)
        await unit.click()
        await page.get_by_role("option", name="pg/mL", exact=True).click()
        await unit.fill("  Custom µg / L  ")
        await unit.press("Escape")
        for label, custom in [("Specimen / modality", "Serum (custom)"), ("Assay / method", "LC–MS/MS exact v2")]:
            combo = page.get_by_role("combobox", name=label, exact=True)
            await combo.fill(custom)
            await combo.press("Enter")
            assert await combo.input_value() == custom
            await page.get_by_role("button", name=f"Show {label} suggestions", exact=True).click()
            assert await page.get_by_role("status").filter(has_text="No matching suggestions").count() == 1
            await combo.press("Escape")
        variable = page.get_by_role("combobox", name="Handbook variable", exact=True)
        await variable.click()
        await variable.fill("bone-013")
        await variable.press("ArrowDown")
        await variable.press("Enter")
        await page.get_by_label("Notes", exact=True).fill("UI-only synthetic interaction; not saved")
        assert await unit.input_value() == "  Custom µg / L  "
        await unit.fill("")
        await unit.press("ArrowDown")
        await unit.press("Enter")
        assert await unit.input_value() in ["mg/dL", "mmol/L"]
        form = page.locator("form").first
        await form.screenshot(path=str(OUT / "actual-form.png"))
        print("Actual form PASS (session restored; no authorized mission membership): unit hints, custom specimen/method, variable-change retention, visible chevrons; no save")

        # The standalone synthetic harness mounts the real component and scoping helper, not a mock UI.
        await page.evaluate("""async () => {
          const {default: React} = await import('/node_modules/.vite/deps/react.js');
          const {default: ReactDOMClient} = await import('/node_modules/.vite/deps/react-dom_client.js');
          const {BoneReportedFieldCombobox} = await import('/src/components/bone-reported-field-combobox.tsx');
          const {boneReportedFieldSuggestions} = await import('/src/domain/bone-health/reported-field-suggestions.ts');
          const host = document.createElement('div'); host.id='picker-test'; document.body.replaceChildren(host);
          function Harness() {
            const [value,setValue] = React.useState('');
            const [authorized,setAuthorized] = React.useState(true);
            const [updates,setUpdates] = React.useState(0);
            const row = {missionId:'demo-mission',crewMemberId:'demo-crew',dataOrigin:'synthetic',variableId:'bone-001',unit:'custom',specimen:'Serum',assayMethod:'LC–MS/MS'};
            const suggestions = React.useMemo(() => boneReportedFieldSuggestions([row,{...row,assayMethod:'ELISA'}, {...row,crewMemberId:'other',assayMethod:'Excluded'}],
              {authorized,missionId:'demo-mission',crewMemberId:'demo-crew',dataOrigin:'synthetic',variableId:'bone-001'}).assayMethod,[authorized]);
            return React.createElement('form',{onSubmit:e=>{e.preventDefault();host.dataset.submitted='yes'}},
              React.createElement(BoneReportedFieldCombobox,{label:'Assay / method',value,onChange:setValue,suggestions,className:'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground'}),
              React.createElement('input',{'aria-label':'Unrelated form field',value:updates,onChange:()=>setUpdates(updates+1)}),
              React.createElement('input',{'aria-label':'Authorized scope',type:'checkbox',checked:authorized,onChange:()=>setAuthorized(!authorized)}));
          }
          ReactDOMClient.createRoot(host).render(React.createElement(Harness));
        }""")
        await page.wait_for_timeout(500)
        print("Harness diagnostics:", errors)
        print("Harness host:", await page.locator("#picker-test").count())
        combo = page.get_by_role("combobox", name="Assay / method", exact=True)
        await combo.click()
        assert await page.get_by_role("option").count() == 2
        await combo.press("ArrowUp")
        await combo.press("Enter")
        assert await combo.input_value() == "LC–MS/MS"
        await combo.fill("")
        await combo.press("End")
        await combo.press("ArrowDown")
        await combo.press("Enter")
        assert await combo.input_value() == "ELISA"
        await combo.fill("lc–ms")
        await page.get_by_role("option", name="LC–MS/MS", exact=True).click()
        await combo.fill("  custom exact method  ")
        await combo.press("Escape")
        await page.get_by_label("Unrelated form field").fill("1")
        assert await combo.input_value() == "  custom exact method  "
        trigger = page.get_by_role("button", name="Show Assay / method suggestions", exact=True)
        await trigger.focus()
        await trigger.press("Enter")
        assert await combo.evaluate("el => el === document.activeElement")
        await combo.press("Enter")
        assert await page.locator("#picker-test").get_attribute("data-submitted") is None
        await combo.fill("")
        await page.get_by_label("Authorized scope").uncheck()
        await combo.click()
        assert await page.get_by_role("option").count() == 0
        await page.locator("#picker-test").screenshot(path=str(OUT / "scope-denied.png"))
        print("Synthetic component harness PASS: filter, pointer, keyboard wrapping, chevron keyboard focus, exact custom text, rerender retention, Enter non-submit, authorization loss")
        assert errors == [], errors
        await browser.close()

asyncio.run(main())