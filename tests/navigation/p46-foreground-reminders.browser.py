import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
S = Path("/tmp/browser/p46/shots"); S.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:8080/mission/companion"
SPY = """(() => { const calls = []; window.__notes = calls;
  const Real = window.Notification;
  function Fake(title, opts) { calls.push({title, body: opts && opts.body}); }
  Fake.permission = 'default';
  Fake.requestPermission = async () => { Fake.permission = 'granted'; return 'granted'; };
  window.Notification = Fake; })()"""
async def run(p, w, h, tag):
    b = await p.chromium.launch(headless=True)
    ctx = await b.new_context(viewport={"width": w, "height": h})
    page = await ctx.new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    await page.clock.install()
    await page.goto(URL, wait_until="networkidle")
    await page.evaluate(SPY)
    sec = page.get_by_role("region", name="Optional timed reminders")
    await sec.wait_for()
    status = sec.locator("p[aria-live]")
    print(tag, "initial:", await status.inner_text())
    print(tag, "stop disabled:", await sec.get_by_role("button", name="Stop").is_disabled())
    opts = await sec.locator("select option").all_inner_texts(); print(tag, "options:", opts)
    await sec.get_by_label("Repeat every").select_option("1")
    await sec.get_by_role("button", name="Enable browser notifications").click()
    await page.wait_for_timeout(50)
    print(tag, "after permission:", await status.inner_text())
    await sec.get_by_role("button", name="Start reminders").click()
    print(tag, "started:", await status.inner_text())
    await page.clock.run_for(30_000)
    print(tag, "notice at 30s:", await sec.get_by_role("status").count())
    await page.clock.run_for(31_000)
    notice = sec.get_by_role("status")
    print(tag, "notice at 61s:", await notice.count(), (await notice.inner_text()).replace("\n"," | ") if await notice.count() else "")
    print(tag, "browser notifications:", await page.evaluate("window.__notes"))
    print(tag, "rescheduled:", await status.inner_text())
    await sec.scroll_into_view_if_needed()
    await sec.screenshot(path=str(S / f"{tag}_due.png"))
    await notice.get_by_role("button", name="Dismiss").click()
    print(tag, "after dismiss:", await sec.get_by_role("status").count())
    await page.clock.run_for(61_000)
    print(tag, "second notice:", await sec.get_by_role("status").count(), "notes:", len(await page.evaluate("window.__notes")))
    await sec.get_by_role("button", name="Stop").click()
    print(tag, "stopped:", await status.inner_text(), "notice:", await sec.get_by_role("status").count())
    await page.clock.run_for(120_000)
    print(tag, "after stop+2min notice:", await sec.get_by_role("status").count(), "notes:", len(await page.evaluate("window.__notes")))
    # restart then reload
    await sec.get_by_role("button", name="Start reminders").click()
    await page.reload(wait_until="networkidle")
    sec = page.get_by_role("region", name="Optional timed reminders"); await sec.wait_for()
    print(tag, "after reload:", await sec.locator("p[aria-live]").inner_text(), "| interval:", await sec.get_by_label("Repeat every").input_value())
    ls = await page.evaluate("Object.keys(localStorage).filter(k=>/remind|companion/i.test(k))")
    print(tag, "storage keys:", ls)
    # P45 still present
    for name in ["1 · Mission environment","2 · Daily routine & reminders"]:
        print(tag, name, await page.get_by_text(name).count())
    envs = await page.locator("#companion-environment option").count(); print(tag, "environments:", envs)
    ov = await page.evaluate("document.documentElement.scrollWidth - window.innerWidth"); print(tag, "horizontal overflow px:", ov)
    await sec.screenshot(path=str(S / f"{tag}_reload.png"))
    print(tag, "page errors:", errs)
    await b.close()
async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop")
        await run(p, 390, 844, "mobile")
asyncio.run(main())
