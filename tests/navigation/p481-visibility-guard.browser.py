"""P48.1 browser acceptance: hide/return reload guard on the Daily Health Companion.
Crew Self membership/evidence responses are STUBBED (disposable presentation evidence
only; no real account, mission, membership or record is created or used)."""
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

S = Path("/tmp/browser/p481/shots"); S.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:8080/mission/companion"
KEY = "sb-cifbkafjelizzgyvmbzp-auth-token"
MISSION, CREW = "m-stub-001", "c-self-001"
STATE = {"member": True}

def event(i, ts, src, value):
    return {"id": f"e{i}", "mission_id": MISSION, "crew_member_id": CREW, "kind": "observation",
            "event_timestamp": ts, "source_id": src, "source_version": "1", "classification": "synthetic",
            "payload": {"observation": {"metric": {"code": "hr_rest", "unit": "bpm", "displayName": "hr_rest"},
                                        "value": {"number": value}, "quality": {"level": "good"}}}}
EVENTS = [event(1, "2026-10-27T08:00:00Z", "device-alpha", 70), event(2, "2026-10-29T08:00:00Z", "device-alpha", 73)]

HIDE = "Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))"
SHOW = "Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))"

async def setup(page):
    sess = {"access_token": "stub.stub.stub", "refresh_token": "stub", "token_type": "bearer",
            "expires_in": 3600, "expires_at": int(time.time()) + 36000,
            "user": {"id": "00000000-0000-0000-0000-00000000c001", "aud": "authenticated", "role": "authenticated",
                     "email": "stub@example.invalid", "app_metadata": {}, "user_metadata": {}}}
    def members(r):
        body = [{"mission_id": MISSION, "crew_member_id": CREW, "role": "crew_self", "active": True}] if STATE["member"] else []
        return r.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    def events(r):
        return r.fulfill(status=200, content_type="application/json", body=json.dumps(EVENTS if STATE["member"] else []))
    await page.route("**/rest/v1/mission_memberships*", members)
    await page.route("**/rest/v1/mission_events*", events)
    await page.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(sess["user"])))
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate("([k,v]) => localStorage.setItem(k, v)", [KEY, json.dumps(sess)])

async def marker(page):
    await page.evaluate("window.__p481 = 'same-document'")
async def same_doc(page):
    return await page.evaluate("window.__p481 === 'same-document'")

async def run(p, w, h, tag):
    STATE["member"] = True
    b = await p.chromium.launch(headless=True)
    ctx = await b.new_context(viewport={"width": w, "height": h})
    page = await ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    reqs = []; page.on("request", lambda r: reqs.append(r.url) if "/rest/v1/mission_memberships" in r.url else None)
    await setup(page)
    await page.goto(URL, wait_until="networkidle")
    table = page.get_by_role("table", name="Recorded observations and evidence provenance")
    await table.wait_for(timeout=15000)
    print(tag, "authorized rows:", await table.locator("tbody tr").count())

    # A. No tab hiding: filters, synthetic chart, checklist and reminders keep working, no reload.
    await marker(page)
    await page.get_by_label("Time window").select_option("7")
    sec = page.get_by_role("region", name="Synthetic trend demonstration")
    await sec.get_by_role("button", name="Show synthetic example").click()
    await page.get_by_test_id("companion-synthetic-trend").get_by_label("Synthetic biomarker").select_option("hrv")
    first_box = page.get_by_role("checkbox").first
    await first_box.check()
    start = page.get_by_role("button", name="Start reminders")
    if await start.count(): await start.click()
    await page.evaluate(SHOW)  # visible->visible without a hidden phase must not reload
    await page.wait_for_timeout(800)
    print(tag, "no-hide: same document:", await same_doc(page),
          "| window:", await page.get_by_label("Time window").input_value(),
          "| synthetic shown:", await page.get_by_test_id("companion-synthetic-trend").count(),
          "| checklist kept:", await first_box.is_checked(),
          "| stop button:", await page.get_by_role("button", name="Stop reminders").count())

    # B. Hide and return while still authorized: reload, re-check membership, evidence re-read.
    before = len(reqs)
    await page.evaluate(HIDE); await page.wait_for_timeout(300)
    print(tag, "while hidden: same document:", await same_doc(page))
    async with page.expect_navigation(wait_until="networkidle"):
        await page.evaluate(SHOW)
    await table.wait_for(timeout=15000)
    print(tag, "return (authorized): reloaded:", not await same_doc(page),
          "| membership re-checked:", len(reqs) > before,
          "| rows:", await table.locator("tbody tr").count(),
          "| window reset:", await page.get_by_label("Time window").input_value(),
          "| synthetic reset:", await page.get_by_test_id("companion-synthetic-trend").count() == 0,
          "| reminders reset:", await page.get_by_role("button", name="Stop reminders").count() == 0)

    # C. Revoke while hidden, then return: no previous evidence remains.
    await marker(page)
    await page.evaluate(HIDE)
    STATE["member"] = False
    async with page.expect_navigation(wait_until="networkidle"):
        await page.evaluate(SHOW)
    await page.wait_for_timeout(1500)
    print(tag, "return (revoked): reloaded:", not await same_doc(page),
          "| table count:", await table.count(),
          "| value 73 visible:", await page.get_by_role("cell", name="73").count(),
          "| status:", (await page.get_by_test_id("trend-status").inner_text())[:140])
    print(tag, "overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    await page.screenshot(path=str(S / f"{tag}_revoked.png"))
    print(tag, "page errors:", errs)
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop")
        await run(p, 390, 844, "mobile")
asyncio.run(main())
