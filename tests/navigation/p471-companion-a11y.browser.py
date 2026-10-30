"""P47.1 browser acceptance: semantic headings, 44px touch targets, keyboard focus, responsive layout."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
S = Path("/tmp/browser/p471/shots"); S.mkdir(parents=True, exist_ok=True)
URL = "http://localhost:8080/mission/companion"
async def run(p, w, h, tag):
    b = await p.chromium.launch(headless=True)
    page = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
    errs = []; page.on("pageerror", lambda e: errs.append(str(e)))
    cons = []; page.on("console", lambda m: cons.append(m.text) if m.type == "error" else None)
    await page.goto(URL, wait_until="networkidle")
    main = page.locator("main")
    heads = await main.evaluate("m => [...m.querySelectorAll('h1,h2,h3')].map(e => e.tagName + ' ' + e.textContent.trim())")
    print(tag, "headings:", heads)
    print(tag, "h2 by role:", [await x.inner_text() for x in await page.get_by_role("heading", level=2).all()])
    names = ["Action Guidance", "Health Intelligence", "Validation"]
    sizes = await main.evaluate("""m => [...m.querySelectorAll('a')].filter(a => a.className.includes('min-h-11'))
        .map(a => [a.textContent.trim(), Math.round(a.getBoundingClientRect().height), Math.round(a.getBoundingClientRect().width)])""")
    print(tag, "touch links:", sizes, "all>=44:", all(s[1] >= 44 for s in sizes))
    link = main.get_by_role("link", name="Action Guidance")
    await link.focus()
    oc = await link.evaluate("e => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, e.matches(':focus-visible')] }")
    print(tag, "focused guidance link outline (programmatic focus):", oc)
    # keyboard: tab through until a min-h-11 link focused
    await page.goto(URL, wait_until="networkidle")
    hit = None
    for i in range(200):
        await page.keyboard.press("Tab")
        info = await page.evaluate("() => { const a = document.activeElement; return a && a.tagName === 'A' && a.closest('main') && String(a.className).includes('min-h-11') && a.textContent.trim() ? [a.textContent.trim(), getComputedStyle(a).outlineStyle, getComputedStyle(a).outlineWidth] : null }")
        if info: hit = (i + 1, info); break
    print(tag, "keyboard reached touch link:", hit)
    if hit:
        await page.evaluate("document.activeElement.scrollIntoView({block:'center'})")
        await page.screenshot(path=str(S / f"{tag}_focus.png"))
    print(tag, "overflow px:", await page.evaluate("document.documentElement.scrollWidth - innerWidth"))
    print(tag, "errors:", errs, [c for c in cons if "asChild" in c or "validateDOMNesting" in c])
    await b.close()
async def main():
    async with async_playwright() as p:
        await run(p, 1280, 1800, "desktop")
        await run(p, 390, 844, "mobile")
asyncio.run(main())
