"""P48 FINAL browser acceptance of the Crew Self synthetic intake panel UI (STUBBED).
Server-function responses are replaced with stand-in eligible/accepted results, so this checks
presentation and the confirmation gate only. The real authorization and writes are verified
separately against the disposable database (scripts/verify-p48-synthetic-pg.ts).
Requires /tmp/browser/p48f/events.json (see p48-final-synthetic-trends.browser.py)."""
import asyncio, json, time
from pathlib import Path
from playwright.async_api import async_playwright

S = Path("/tmp/browser/p48f/shots"); S.mkdir(parents=True, exist_ok=True)
EVENTS = json.loads(Path("/tmp/browser/p48f/events.json").read_text())
KEY = "sb-cifbkafjelizzgyvmbzp-auth-token"
s = lambda v: {"t": 1, "s": v}
n = lambda v: {"t": 0, "s": v}
TRUE = {"t": 2, "s": 2}
def obj(i, d): return {"t": 10, "i": i, "p": {"k": list(d.keys()), "v": list(d.values())}, "o": 0}
def envelope(result): return json.dumps(obj(0, {"result": result, "error": {"t": 2, "s": 1}, "context": obj(90, {})}))
STATUS = envelope(obj(1, {"enabled": TRUE, "reason": s("eligible")}))
SUBMIT = envelope(obj(1, {"ok": TRUE, "counts": obj(2, {"accepted": n(6), "duplicate": n(0), "conflict": n(0), "rejected": n(0), "notAttempted": n(0)})}))
STATE = {"eligible": True, "submits": 0, "bodies": []}

async def run(p, w, h, tag):
    STATE.update(eligible=True, submits=0, bodies=[])
    b = await p.chromium.launch(headless=True)
    page = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    sess = {"access_token": "stub.stub.stub", "refresh_token": "stub", "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 36000,
            "user": {"id": "00000000-0000-0000-0000-00000000c0a1", "aud": "authenticated", "role": "authenticated", "email": "stub@example.invalid", "app_metadata": {}, "user_metadata": {}}}
    await page.route("**/rest/v1/mission_memberships*", lambda r: r.fulfill(status=200, content_type="application/json",
        body=json.dumps([{"mission_id": "mission-p48stub", "crew_member_id": "crew-a", "role": "crew_self", "active": True}])))
    await page.route("**/rest/v1/mission_events*", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(EVENTS)))
    await page.route("**/auth/v1/**", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(sess["user"])))
    async def serverfn(r):
        token = r.request.url.split("/_serverFn/")[1].split("?")[0]
        name = __import__("base64").urlsafe_b64decode(token + "=" * (-len(token) % 4)).decode(errors="ignore")
        if "getP48SyntheticIntakeStatus" in name:
            body = STATUS if STATE["eligible"] else envelope(obj(1, {"enabled": TRUE, "reason": s("not_crew_self")}))
            return await r.fulfill(status=200, content_type="application/json", headers={"x-tss-serialized": "true"}, body=body)
        STATE["submits"] += 1; STATE["bodies"].append(r.request.post_data or "")
        await r.fulfill(status=200, content_type="application/json", headers={"x-tss-serialized": "true"}, body=SUBMIT)
    await page.route("**/_serverFn/**", serverfn)
    await page.goto("http://localhost:8080/", wait_until="domcontentloaded")
    await page.evaluate("([k,v]) => localStorage.setItem(k, v)", [KEY, json.dumps(sess)])
    await page.goto("http://localhost:8080/mission/companion", wait_until="networkidle")
    panel = page.get_by_role("region", name="Synthetic demonstration readings")
    await panel.wait_for(timeout=15000)
    print(tag, "panel visible for eligible scope; submits on load:", STATE["submits"])
    await panel.get_by_role("button", name="Load scenario A (6 readings)").click()
    print(tag, "planned rows:", await panel.locator("tbody tr").count())
    print(tag, "review:", await panel.get_by_text("Review:").inner_text())
    submit = panel.get_by_role("button", name="Permanently add 6 synthetic readings")
    print(tag, "submit disabled before confirm:", await submit.is_disabled())
    await panel.get_by_role("checkbox").check()
    print(tag, "disabled with checkbox only:", await submit.is_disabled())
    await panel.get_by_label("Type P48_SYNTHETIC_DEMO to confirm").fill("P48_SYNTHETIC_DEMO")
    print(tag, "enabled after both confirmations:", not await submit.is_disabled())
    await panel.get_by_label("Reading 1 value").fill("65")
    print(tag, "edit resets confirmation:", await submit.is_disabled(), not await panel.get_by_role("checkbox").is_checked())
    await panel.get_by_label("Reading 2 value").fill("-1")
    print(tag, "invalid value message:", await panel.get_by_role("alert").inner_text())
    await panel.get_by_label("Reading 2 value").fill("52")
    await panel.get_by_role("checkbox").check(); await panel.get_by_label("Type P48_SYNTHETIC_DEMO to confirm").fill("P48_SYNTHETIC_DEMO")
    await submit.click()
    await page.get_by_text("Synthetic batch processed.").wait_for(timeout=10000)
    print(tag, "submits:", STATE["submits"], "| result:", await page.get_by_text("Synthetic batch processed.").inner_text())
    body = STATE["bodies"][0]
    print(tag, "request carries no classification field:", "classification" not in body, "| confirmation sent:", "irreversible" in body)
    await page.wait_for_timeout(1500)
    # Revocation: the next eligibility check fails -> panel hidden.
    STATE["eligible"] = False
    await page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});document.dispatchEvent(new Event('visibilitychange'))")
    print(tag, "panel while hidden:", await panel.count())
    await page.evaluate("Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});document.dispatchEvent(new Event('visibilitychange'))")
    await page.wait_for_timeout(2500)
    print(tag, "panel after revocation:", await panel.count())
    print(tag, "overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    print(tag, "page errors:", errs)
    await b.close()

async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop"); await run(p, 390, 844, "mobile")
asyncio.run(main())
