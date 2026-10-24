import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path('/tmp/browser/ux-polish')
ROUTES=['/','/mission/readiness','/mission/validation','/mission/intelligence','/project/guide','/mission/documents','/mission/experience','/mission/bone-health','/mission/immune-health','/mission/cardiovascular-health','/mission/behavioral-health','/does-not-exist','/technology/nonexistent']
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  results=[]
  for width in [1280,390]:
   context=await browser.new_context(viewport={'width':width,'height':1800})
   page=await context.new_page()
   for route in ROUTES:
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    response=await page.goto('http://localhost:8080'+route,wait_until='networkidle')
    await page.wait_for_timeout(250)
    state=await page.evaluate('''() => ({title:document.title,h1:document.querySelectorAll('h1').length,overflow:document.documentElement.scrollWidth-innerWidth,robots:[...document.querySelectorAll('meta[name="robots"]')].map(x=>x.content),canonical:[...document.querySelectorAll('link[rel="canonical"]')].map(x=>x.href),brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)})''')
    state.update(route=route,width=width,http=response.status,errors=errors)
    assert await page.locator('header').count()==1
    if not route.endswith('nonexistent') and route!='/does-not-exist':
     assert state['canonical']==['https://mitochondria.edocinfo.com'+('/' if route=='/' else route)]
    if route=='/mission/readiness':
     cta=page.get_by_role('link',name='Mission identity & sign-in')
     await cta.focus()
     assert await cta.evaluate('(x)=>x===document.activeElement')
    if route=='/mission/intelligence':
     await page.get_by_role('combobox',name='Provisional classification').screenshot(path=str(ROOT/f'classification-{width}.png'))
    if route=='/mission/readiness':
     assert await page.get_by_role('link',name='Mission identity & sign-in').count()==1
     assert await page.get_by_role('button',name='Continue',exact=True).count()==0
     await page.get_by_role('link',name='Mission identity & sign-in').click()
     assert page.url.endswith('/mission/identity')
     state['signin_navigation']=True
     await page.goto('http://localhost:8080'+route,wait_until='networkidle')
    if route=='/mission/intelligence':
     control=page.get_by_role('combobox',name='Provisional classification')
     await control.locator("option").nth(1).wait_for(state="attached")
     options=await control.locator('option').evaluate_all('(xs)=>xs.map(x=>x.value)')
     await control.select_option(options[1])
     state['classification']=await control.input_value()
     assert state['classification']==options[1]
     expected=await page.evaluate("() => document.querySelector('select').value")
     assert expected==options[1]
    if route=='/':
     region=page.get_by_role('region',name='Explore MITOCHONDRIA')
     state['onboarding_links']=await region.locator('a').evaluate_all('(xs)=>xs.map(x=>x.getAttribute("href"))')
     assert len(state['onboarding_links'])==4
     await region.screenshot(path=str(ROOT/f'home-explore-{width}.png'))
    if route in ['/does-not-exist','/technology/nonexistent']:
     assert response.status==404
     html=await response.text()
     assert 'Page not found | The Mitochondria' in html
     assert 'noindex, nofollow' in html
     assert state['title']=='Page not found | The Mitochondria'
     assert state['robots']==['noindex, nofollow'],state
     await page.get_by_role('link',name='Project Guide',exact=True).click()
     assert page.url.endswith('/project/guide')
     state['guide_navigation']=True
     await page.goto('http://localhost:8080'+route,wait_until='networkidle')
    assert state['h1']==1,state
    assert not state['brokenImages'],state
    assert not errors,state
    await page.screenshot(path=str(ROOT/(route.replace('/','_')+f'-{width}.png')))
    results.append(state)
   await context.close()
  await browser.close()
  (ROOT/'results.json').write_text(json.dumps(results,indent=2))
  print(json.dumps(results,indent=2))
asyncio.run(main())
