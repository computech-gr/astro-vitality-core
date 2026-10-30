"""P47 browser acceptance: synthetic multi-biomarker charts (signed out) and
Crew Self filters/provenance table with STUBBED membership/evidence responses.
Stubs are disposable presentation evidence only; they grant no real authority."""
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

S = Path("/tmp/browser/p47/shots"); S.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:8080/mission/companion"
KEY = "sb-cifbkafjelizzgyvmbzp-auth-token"
MISSION, CREW, OTHER = "m-stub-001", "c-self-001", "c-other-999"

def event(i, ts, src, value, unit="bpm", code="hr_rest", crew=CREW, q="good"):
    return {"id": f"e{i}", "mission_id": MISSION, "crew_member_id": crew, "kind": "observation",
            "event_timestamp": ts, "source_id": src, "source_version": "1", "classification": "synthetic",
            "payload": {"observation": {"metric": {"code": code, "unit": unit, "displayName": code},
                                        "value": {"number": value}, "quality": {"level": q}}}}

EVENTS = [
    event(1, "2026-08-01T08:00:00Z", "device-alpha", 66),
    event(2, "2026-10-10T08:00:00Z", "device-beta", 68, q="degraded"),
    event(3, "2026-10-27T08:00:00Z", "device-alpha", 70),
    event(4, "2026-10-29T08:00:00Z", "device-beta", 71),
    event(5, "2026-10-29T09:00:00Z", "foreign-device", 999, crew=OTHER),
]

async def stub_crew(page):
    sess = {"access_token": "stub.stub.stub", "refresh_token": "stub", "token_type": "bearer",
            "expires_in": 3600, "expires_at": int(time.time()) + 36000,
            "user": {"id": "00000000-0000-0000-0000-00000000c001", "aud": "authenticated", "role": "authenticated",
                     "email": "stub@example.invalid", "app_metadata": {}, "user_metadata": {}}}
    await page.route("**/rest/v1/mission_memberships*", lambda r: r.fulfill(status=200, content_type="application/json",
        body=json.dumps([{"mission_id": MISSION, "crew_member_id": CREW, "role": "crew_self", "active": True}])))
    await page.route("**/rest/v1/mission_events*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(EVENTS)))
    await page.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(sess["user"])))
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate("([k,v]) => localStorage.setItem(k, v)", [KEY, json.dumps(sess)])

async def run(p, w, h, tag):
    b = await p.chromium.launch(headless=True)
    ctx = await b.new_context(viewport={"width": w, "height": h})
    page = await ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    reqs = []; page.on("request", lambda r: reqs.append(r.url))
    # Signed out
    await page.goto(URL, wait_until="networkidle")
    print(tag, "signed-out status:", await page.get_by_test_id("trend-status").inner_text())
    print(tag, "signed-out data requests:", [u for u in reqs if "/rest/v1/" in u])
    sec = page.get_by_role("region", name="Synthetic trend demonstration")
    await sec.get_by_role("button", name="Show synthetic example").click()
    chart = page.get_by_test_id("companion-synthetic-trend")
    sel = chart.get_by_label("Synthetic biomarker")
    for m in ["heart", "hrv", "sleep"]:
        await sel.select_option(m)
        print(tag, m, "|", await chart.get_by_text("SYNTHETIC DEMONSTRATION —").inner_text(), "|",
              await chart.get_by_role("img").get_attribute("aria-label"), "| circles", await chart.locator("circle").count())
        await chart.screenshot(path=str(S / f"{tag}_synthetic_{m}.png"))
    print(tag, "signed-out overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    ls = await page.evaluate("JSON.stringify(Object.assign({}, localStorage, sessionStorage))")
    print(tag, "storage holds synthetic values:", "7.2" in ls or "heart" in ls)
    # Stubbed Crew Self
    await stub_crew(page)
    await page.goto(URL, wait_until="networkidle")
    await page.get_by_text("matching observations").wait_for(timeout=15000)
    count = page.get_by_text("matching observations")
    table = page.get_by_role("table", name="Recorded observations and evidence provenance")
    print(tag, "crew all:", await count.inner_text())
    print(tag, "rows:", await table.locator("tbody tr").all_inner_texts())
    print(tag, "foreign crew value shown:", await page.get_by_text("999").count())
    await page.get_by_label("Time window").select_option("7")
    print(tag, "7d:", await count.inner_text(), await table.locator("tbody tr").count())
    await page.get_by_label("Evidence source").select_option("device-beta")
    print(tag, "7d+beta:", await count.inner_text())
    await page.get_by_label("Evidence source").select_option("device-alpha")
    print(tag, "7d+alpha (one point):", await page.get_by_text("Only one observation is available").count())
    await page.get_by_label("Time window").select_option("all")
    await page.get_by_label("Evidence source").select_option("all")
    await page.get_by_label("Time window").focus(); await page.keyboard.press("ArrowDown")
    print(tag, "keyboard window value:", await page.get_by_label("Time window").input_value())
    print(tag, "crew overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    await page.get_by_label("Time window").scroll_into_view_if_needed()
    await page.screenshot(path=str(S / f"{tag}_crew.png"))
    print(tag, "page errors:", errs)
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop")
        await run(p, 390, 844, "mobile")
asyncio.run(main())
