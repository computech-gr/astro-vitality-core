"""P48 FINAL browser acceptance (STUBBED): readings built by the real synthetic intake builder,
returned through stubbed membership/event responses, render in the Companion for crew A only;
filters narrow them; crew B values never appear; the default-off intake panel stays hidden.
No real account, mission, membership or record is created or used.
Generate events first: bun /tmp/browser/p48f/gen.ts (writes /tmp/browser/p48f/events.json)."""
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

S = Path("/tmp/browser/p48f/shots"); S.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:8080/mission/companion"
KEY = "sb-cifbkafjelizzgyvmbzp-auth-token"
EVENTS = json.loads(Path("/tmp/browser/p48f/events.json").read_text())

async def run(p, w, h, tag):
    b = await p.chromium.launch(headless=True)
    page = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    sess = {"access_token": "stub.stub.stub", "refresh_token": "stub", "token_type": "bearer", "expires_in": 3600,
            "expires_at": int(time.time()) + 36000,
            "user": {"id": "00000000-0000-0000-0000-00000000c0a1", "aud": "authenticated", "role": "authenticated",
                     "email": "stub@example.invalid", "app_metadata": {}, "user_metadata": {}}}
    await page.route("**/rest/v1/mission_memberships*", lambda r: r.fulfill(status=200, content_type="application/json",
        body=json.dumps([{"mission_id": "mission-p48stub", "crew_member_id": "crew-a", "role": "crew_self", "active": True}])))
    # Simulates RLS returning a crew B row anyway; the client must still drop it.
    await page.route("**/rest/v1/mission_events*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(EVENTS)))
    await page.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(sess["user"])))
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate("([k,v]) => localStorage.setItem(k, v)", [KEY, json.dumps(sess)])
    await page.goto(URL, wait_until="networkidle")
    table = page.get_by_role("table", name="Recorded observations and evidence provenance")
    await table.wait_for(timeout=15000)
    metric = page.locator("#companion-metric")
    print(tag, "metric options:", await metric.locator("option").all_inner_texts())
    await metric.select_option("phys.heart_rate|{beats}/min")
    print(tag, "heart rows (all):", await table.locator("tbody tr").all_inner_texts())
    await page.get_by_label("Time window").select_option("7")
    print(tag, "heart rows (7d):", await table.locator("tbody tr").count())
    await page.get_by_label("Time window").select_option("all")
    await page.get_by_label("Evidence source").select_option("p48-synthetic-source-beta")
    print(tag, "heart rows (beta):", await table.locator("tbody tr").count())
    await page.get_by_label("Time window").select_option("90")
    await page.get_by_label("Evidence source").select_option("all")
    print(tag, "heart rows (90d):", await table.locator("tbody tr").count())
    body = await page.locator("main").inner_text()
    print(tag, "crew B values visible:", any(v in body for v in ["71 {beats}", "73 {beats}", "72 {beats}"]))
    print(tag, "intake panel visible:", await page.get_by_role("region", name="Synthetic demonstration readings").count())
    print(tag, "overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    await table.scroll_into_view_if_needed(); await page.screenshot(path=str(S / f"{tag}.png"))
    print(tag, "page errors:", errs)
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop"); await run(p, 390, 844, "mobile")
asyncio.run(main())
