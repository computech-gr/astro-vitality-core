"""P48.2 browser acceptance: focused fail-closed Crew Self revalidation on tab return.
Membership/evidence responses are STUBBED (disposable presentation evidence only; no real
account, mission, membership or record is created or used). Visibility is simulated by
overriding document.visibilityState and dispatching visibilitychange."""
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

S = Path("/tmp/browser/p482/shots"); S.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:8080/mission/companion"
KEY = "sb-cifbkafjelizzgyvmbzp-auth-token"
MISSION, CREW = "m-stub-001", "c-self-001"
STATE = {"member": True, "offline": False, "delay_events": 0.0}

def event(i, ts, src, value):
    return {"id": f"e{i}", "mission_id": MISSION, "crew_member_id": CREW, "kind": "observation",
            "event_timestamp": ts, "source_id": src, "source_version": "1", "classification": "synthetic",
            "payload": {"observation": {"metric": {"code": "hr_rest", "unit": "bpm", "displayName": "hr_rest"},
                                        "value": {"number": value}, "quality": {"level": "good"}}}}
EVENTS = [event(1, "2026-10-20T08:00:00Z", "device-alpha", 70), event(2, "2026-10-29T08:00:00Z", "device-alpha", 73),
          event(3, "2026-10-29T09:00:00Z", "device-beta", 74)]

HIDE = "Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'))"
SHOW = "Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'))"

async def setup(page, counts):
    sess = {"access_token": "stub.stub.stub", "refresh_token": "stub", "token_type": "bearer",
            "expires_in": 3600, "expires_at": int(time.time()) + 36000,
            "user": {"id": "00000000-0000-0000-0000-00000000c001", "aud": "authenticated", "role": "authenticated",
                     "email": "stub@example.invalid", "app_metadata": {}, "user_metadata": {}}}
    async def members(r):
        counts["members"] += 1
        if STATE["offline"]: return await r.abort("internetdisconnected")
        body = [{"mission_id": MISSION, "crew_member_id": CREW, "role": "crew_self", "active": True}] if STATE["member"] else []
        await r.fulfill(status=200, content_type="application/json", body=json.dumps(body))
    async def events(r):
        counts["events"] += 1
        if STATE["delay_events"]: await asyncio.sleep(STATE["delay_events"])
        if STATE["offline"]: return await r.abort("internetdisconnected")
        await r.fulfill(status=200, content_type="application/json", body=json.dumps(EVENTS if STATE["member"] else []))
    await page.route("**/rest/v1/mission_memberships*", members)
    await page.route("**/rest/v1/mission_events*", events)
    await page.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(sess["user"])))
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate("([k,v]) => localStorage.setItem(k, v)", [KEY, json.dumps(sess)])

async def run(p, w, h, tag):
    STATE.update(member=True, offline=False, delay_events=0.0)
    counts = {"members": 0, "events": 0}
    b = await p.chromium.launch(headless=True)
    ctx = await b.new_context(viewport={"width": w, "height": h})
    page = await ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    navs = []; page.on("framenavigated", lambda f: navs.append(f.url) if f == page.main_frame else None)
    await setup(page, counts)
    await page.goto(URL, wait_until="networkidle")
    table = page.get_by_role("table", name="Recorded observations and evidence provenance")
    status = page.get_by_test_id("trend-status")
    await table.wait_for(timeout=15000)
    print(tag, "authorized rows:", await table.locator("tbody tr").count())

    # Non-sensitive state set before any tab switch
    await page.get_by_label("Time window").select_option("7")
    await page.get_by_label("Evidence source").select_option("device-beta")
    await page.get_by_role("region", name="Synthetic trend demonstration").get_by_role("button", name="Show synthetic example").click()
    await page.get_by_test_id("companion-synthetic-trend").get_by_label("Synthetic biomarker").select_option("hrv")
    box = page.get_by_role("checkbox").first; await box.check()
    await page.get_by_role("button", name="Start reminders").click()
    navs.clear()

    # A. Hide: evidence disappears immediately; return: same scope re-read, state kept, no reload.
    m0 = counts["members"]
    await page.evaluate(HIDE)
    print(tag, "hidden: table:", await table.count(), "| status:", await status.inner_text())
    STATE["delay_events"] = 1.5
    await page.evaluate(SHOW)
    await page.wait_for_timeout(300)
    print(tag, "return pending: table:", await table.count(), "| status:", await status.inner_text())
    await table.wait_for(timeout=15000)
    STATE["delay_events"] = 0.0
    print(tag, "return authorized: reloaded:", bool(navs), "| membership re-read:", counts["members"] > m0,
          "| rows:", await table.locator("tbody tr").count(),
          "| window kept:", await page.get_by_label("Time window").input_value(),
          "| source kept:", await page.get_by_label("Evidence source").input_value(),
          "| synthetic kept:", await page.get_by_test_id("companion-synthetic-trend").count() == 1,
          "| checklist kept:", await box.is_checked(),
          "| reminders kept:", not await page.get_by_role("button", name="Stop", exact=True).is_disabled())

    # B. Stale response race: return, revoke while the evidence request is still in flight.
    STATE["delay_events"] = 2.0
    await page.evaluate(HIDE); await page.evaluate(SHOW)
    await page.wait_for_timeout(400)   # membership answered (authorized), evidence pending
    STATE["member"] = False
    await page.evaluate(HIDE); await page.evaluate(SHOW)  # second return -> revoked
    await page.wait_for_timeout(3000)  # first, delayed evidence response arrives late
    STATE["delay_events"] = 0.0
    print(tag, "race: table:", await table.count(), "| 73 visible:", await page.get_by_role("cell", name="73 bpm").count(),
          "| status:", await status.inner_text())

    # C. Network failure on return: hidden + retry; then restore access and retry.
    STATE.update(member=True, offline=True)
    await page.evaluate(HIDE); await page.evaluate(SHOW)
    retry = page.get_by_role("button", name="Retry authorization")
    await retry.wait_for(timeout=10000)
    print(tag, "offline: table:", await table.count(), "| status:", await status.inner_text())
    await page.screenshot(path=str(S / f"{tag}_offline.png"))
    STATE["offline"] = False
    await retry.click()
    await table.wait_for(timeout=15000)
    print(tag, "retry: rows:", await table.locator("tbody tr").count(), "| retry button gone:", await retry.count() == 0)

    print(tag, "any full reload during test:", bool(navs),
          "| checklist kept:", await box.is_checked(),
          "| reminders kept:", not await page.get_by_role("button", name="Stop", exact=True).is_disabled())
    print(tag, "storage holds evidence:", "73" in await page.evaluate("JSON.stringify(Object.assign({}, sessionStorage))"))
    print(tag, "overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    await page.get_by_label("Time window").scroll_into_view_if_needed()
    await page.screenshot(path=str(S / f"{tag}_final.png"))
    print(tag, "page errors:", errs)
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop")
        await run(p, 390, 844, "mobile")
asyncio.run(main())
