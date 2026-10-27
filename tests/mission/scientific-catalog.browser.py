import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
OUT=Path("/tmp/browser/scientific-catalog-regression")
OUT.mkdir(parents=True, exist_ok=True)
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={"width":1280,"height":1800})
  page=await context.new_page()
  if os.environ.get('LOVABLE_BROWSER_AUTH_STATUS') == 'injected':
   storage_key=os.environ.get('LOVABLE_BROWSER_SUPABASE_STORAGE_KEY'); session_json=os.environ.get('LOVABLE_BROWSER_SUPABASE_SESSION_JSON'); cookies=json.loads(os.environ.get('LOVABLE_BROWSER_SUPABASE_COOKIES_JSON') or '[]')
  else:
   with open(os.path.expanduser('~/.cache/lovable-auth/session.json')) as f: minted=json.load(f)
   storage_key=minted['storage_key']; session_json=json.dumps(minted['session']); cookies=minted.get('cookies') or []
  if cookies: await context.add_cookies([{**c,'url':'http://localhost:8080'} for c in cookies])
  await page.goto('http://localhost:8080')
  await page.evaluate('([k,v])=>window.localStorage.setItem(k,v)',[storage_key,session_json])
  for domain in ['immune','behavioral']:
   await page.goto('http://localhost:8080/mission/'+domain+'-health',wait_until='networkidle')
   combo=page.get_by_role('combobox',name='Explore scientific reference variables')
   await combo.click()
   options=page.get_by_role('option'); first=await options.nth(0).inner_text(); second=await options.nth(1).inner_text()
   first_id=first.split(' · ')[0]
   await combo.fill(first_id.lower()); assert await options.count()==1
   await combo.press('Enter'); assert await combo.input_value()==first
   await combo.click(); await combo.fill('zz-no-match'); assert await options.count()==0
   assert await page.get_by_role('article',name='Selected reference details').inner_text()
   await combo.press('Escape'); assert await combo.input_value()==first
   await page.get_by_role('button',name='Show scientific catalog options').click()
   await page.get_by_role('option',name=second,exact=True).click(); assert await combo.input_value()==second
   await combo.click(); await combo.press('End'); last=await options.last.inner_text(); await combo.press('Enter'); assert await combo.input_value()==last
   await combo.click(); await combo.press('Home'); await combo.press('Enter'); assert await combo.input_value()==first
   await combo.click(); await combo.press('ArrowDown'); await combo.press('Enter'); assert await combo.input_value()==second
   await combo.click(); await combo.press('ArrowUp'); await combo.press('Enter'); assert await combo.input_value()==last
   await combo.click(); await combo.press('Tab'); assert await combo.get_attribute('aria-expanded')=='false'
   button=page.get_by_role('button',name='Show scientific catalog options')
   await button.press('Enter')
   print(domain,'keyboard trigger focus:',await page.evaluate('document.activeElement.tagName'))
   await page.screenshot(path=str(OUT/(domain+'.png')))
   print(domain,'PASS: ID search, empty state, retained selection, pointer, Home/End/arrows/Enter/Escape/Tab')
  await page.goto('http://localhost:8080/mission/bone-health',wait_until='networkidle')
  combo=page.get_by_role('combobox',name='Handbook variable'); original=await combo.input_value()
  await page.get_by_role('button',name='Show handbook variable options').click()
  options=page.get_by_role('listbox',name='Handbook variables').get_by_role('option'); second=await options.nth(1).inner_text(); await options.nth(1).click(); assert await combo.input_value()==second
  await combo.click(); await combo.fill('zz-no-match'); assert await options.count()==0
  await combo.press('Escape'); assert await combo.input_value()==second
  await combo.click(); await combo.press('End'); last=await options.last.inner_text(); await combo.press('Enter'); assert await combo.input_value()==last
  await page.get_by_label('Lab / original source',exact=True).fill('UI-only synthetic check'); assert await combo.input_value()==last
  await page.screenshot(path=str(OUT/'bone.png'))
  print('bone PASS: chevron, pointer, empty state, retention, keyboard, unrelated form update; no save')
  for path in ['immune-health','behavioral-health','bone-health']:
   await page.set_viewport_size({'width':390,'height':844})
   await page.goto('http://localhost:8080/mission/'+path,wait_until='networkidle')
   combo=page.get_by_role('combobox',name='Handbook variable' if path=='bone-health' else 'Explore scientific reference variables')
   await combo.click(); await combo.scroll_into_view_if_needed()
   assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'),path+' overflow'
   await combo.screenshot(path=str(OUT/(path+'-mobile.png')))
   print(path,'mobile PASS: no horizontal overflow')
  await browser.close()
asyncio.run(main())
