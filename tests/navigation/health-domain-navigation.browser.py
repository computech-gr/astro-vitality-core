"""Shared domain navigation checks; no measurement writes or provider requests."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path("/tmp/browser/health-navigation")
DOMAINS = [("bone", "Bone Health"), ("immune", "Immune Changes"),
           ("cardiovascular", "Cardiovascular Health"), ("behavioral", "Behavioral Health")]

async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        for width, height in [(1280, 1800), (390, 844)]:
            await page.set_viewport_size({"width": width, "height": height})
            for domain, title in DOMAINS:
                await page.goto(f"http://localhost:8080/mission/{domain}-health", wait_until="networkidle")
                nav = page.get_by_role("navigation", name="Astronaut health domains", exact=True)
                assert await nav.count() == 1
                assert await nav.get_by_role("link").count() == 4
                current = nav.locator('[aria-current="page"]')
                assert await current.count() == 1
                assert await current.inner_text() == title
                first = nav.get_by_role("link", name="Bone Health", exact=True)
                await first.focus()
                for _, target_title in DOMAINS:
                    link = nav.get_by_role("link", name=target_title, exact=True)
                    assert await link.evaluate("el => el === document.activeElement")
                    assert await link.evaluate("el => el.matches(':focus-visible')")
                    assert await link.evaluate("el => parseFloat(getComputedStyle(el).outlineWidth) >= 2")
                    await link.press("Tab")
                await current.focus()
                await nav.screenshot(path=str(OUT / f"{domain}-{width}.png"))
                assert await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                if domain == "bone":
                    for label in ["Handbook variable", "Lab / original source", "Unit (as reported)", "Specimen / modality", "Assay / method"]:
                        assert await page.get_by_role("combobox", name=label, exact=True).count() == 1
                else:
                    assert await page.get_by_role("button", name="Save encrypted record", exact=True).count() == 0
                    if domain in ["immune", "behavioral"]:
                        picker = page.get_by_role("combobox", name="Explore scientific reference variables", exact=True)
                        await picker.click()
                        await picker.fill("zz-no-reference-match")
                        assert await page.get_by_role("option").count() == 0
                        await picker.press("Escape")
                print(domain, width, "PASS: four consistent links, unique active state, Tab focus, Bone pickers/read-only boundaries, no overflow")
        await page.set_viewport_size({"width": 1280, "height": 1800})
        await page.goto("http://localhost:8080/mission/bone-health", wait_until="networkidle")
        for domain, title in DOMAINS[1:] + DOMAINS[:1]:
            nav = page.get_by_role("navigation", name="Astronaut health domains", exact=True)
            target = nav.get_by_role("link", name=title, exact=True)
            if domain == "cardiovascular":
                await target.focus()
                await target.press("Enter")
            else:
                await target.click()
            await page.wait_for_url(f"**/mission/{domain}-health")
            await page.wait_for_load_state("networkidle")
            assert await page.get_by_role("navigation", name="Astronaut health domains", exact=True).locator('[aria-current="page"]').inner_text() == title
        assert errors == [], errors
        print("Pointer and Enter navigation PASS: all four destinations reached; no runtime errors, saves or generation")
        await browser.close()

asyncio.run(main())