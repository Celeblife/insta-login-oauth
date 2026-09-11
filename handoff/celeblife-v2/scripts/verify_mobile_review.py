"""Narrow DOM layout probes for approved UI and production CSS corrections.
No network, OAuth, database, SMTP, device OS keyboard, or Safari behavior is tested.
Uses in-memory local HTML because localhost navigation was blocked in this review.
Requires: Python playwright; Chromium. Writes only verification/mobile-review/.
"""
from pathlib import Path
import json, shutil, argparse
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default='verification/mobile-review');args=parser.parse_args()
O=(R/args.output_dir).resolve()
if not O.is_relative_to((R/'verification').resolve()): raise SystemExit('Output must be under verification/')
O.mkdir(parents=True,exist_ok=True)
base=(R/'reference/approved/index.html').read_text()
css=(R/'ui/production/usability-overrides.css').read_text()
W=[320,345,346,360,375,390,412,430,768,860,861,900,1080,1440]
report={'scope':'prototype + CSS only, not a React app or physical device','mode':'memory','variants':{}}
def frame(page):
 page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
def measure(page,w):
 d=page.evaluate('''() => ({layoutWidth:innerWidth,documentWidth:document.documentElement.scrollWidth,
 clientWidth:document.documentElement.clientWidth,height:innerHeight})''')
 return {'configuredWidth':w,**d,'fits':d['documentWidth']<=w+1}
def long_data(page):
 page.locator('#full-name').fill('가'*50)
 page.locator('#instagram').fill('w'*30)
 page.locator('#email').fill('a'*64+'@'+'b'*63+'.'+'c'*60+'.com')
 page.locator('#phone').fill('01012345678')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 report['browser']=b.version
 for patched in [False,True]:
  label='corrected' if patched else 'baseline'
  ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce',device_scale_factor=1)
  page=ctx.new_page();errs=[];page.on('pageerror',lambda e:errs.append(str(e)))
  html=base if not patched else base.replace('</head>','<style>'+css+'</style></head>').replace('<body>','<body data-celeblife-production="true">')
  page.set_content(html,wait_until='load')
  result={'normal':[],'long_data':[],'short_modal':[]}
  for w in W:
   page.set_viewport_size({'width':w,'height':844})
   for state in ['intro','form','loading','success','error']:
    page.evaluate('(s)=>showView(s,{focus:false})',state);frame(page)
    result['normal'].append({'state':state,**measure(page,w)})
  page.set_viewport_size({'width':390,'height':844});page.evaluate("showView('form',{focus:false})");frame(page)
  page.screenshot(path=str(O/f'{label}-form-390.png'),full_page=True,animations='disabled')
  result['targets']=page.locator('.policy-link,.close-btn,.check-row label,.help-link,.panel-footer button').evaluate_all('''els=>els.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {selector:e.className||e.tagName,width:r.width,height:r.height}})''')
  long_data(page)
  for w in [320,360,390,430,861]:
   page.set_viewport_size({'width':w,'height':844});page.evaluate("showView('success',{focus:false})");frame(page)
   result['long_data'].append(measure(page,w))
   if w==390:page.screenshot(path=str(O/f'{label}-success-long-390.png'),full_page=True,animations='disabled')
  for h in [320,420,568]:
   page.set_viewport_size({'width':390,'height':h});page.evaluate("showView('form',{focus:false})");frame(page)
   page.locator('[data-dialog=privacy]').first.dispatch_event('click');frame(page)
   d=page.locator('#info-dialog').evaluate('''e=>{const p=e.getBoundingClientRect(),f=e.querySelector('.dialog-footer').getBoundingClientRect(),body=e.querySelector('.dialog-body');return {panelBottom:p.bottom,footerBottom:f.bottom,footerFits:f.bottom<=p.bottom+1,bodyHeight:body.clientHeight,bodyScrollHeight:body.scrollHeight}}''')
   result['short_modal'].append({'height':h,**d})
   if h==420:page.screenshot(path=str(O/f'{label}-modal-short-420.png'),full_page=True,animations='disabled')
   page.keyboard.press('Escape')
  page.set_viewport_size({'width':390,'height':844});page.evaluate("showView('form',{focus:false})");frame(page)
  page.evaluate('''()=>{const els=[...document.querySelectorAll('.content-panel *')].filter(e=>e.getClientRects().length && [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));const sizes=els.map(e=>parseFloat(getComputedStyle(e).fontSize));els.forEach((e,i)=>e.style.setProperty('font-size',sizes[i]*2+'px','important'))}''');frame(page)
  result['double_text_probe']=measure(page,390)
  result['errors']=errs
  result['measured_pass']=(all(x['fits'] for x in result['normal']+result['long_data']) and all(x['footerFits'] for x in result['short_modal']) and result['double_text_probe']['fits'] and not errs)
  report['variants'][label]=result
  ctx.close()
 b.close()
report['limitations']=['No real mobile Safari/Android browser or Instagram WebView','No actual virtual keyboard, safe-area inset, 200% OS text zoom; short-height and doubled computed-text probes only','No HTTP/CSP/Next.js/runtime backend tests; local assets injected into DOM','No overall WCAG conformance certification']
(O/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
summary={name:{'normal_width_pass':sum(x['fits'] for x in r['normal']),'normal_count':len(r['normal']),'long_pass':sum(x['fits'] for x in r['long_data']),'long_count':len(r['long_data']),'short_modal_pass':sum(x['footerFits'] for x in r['short_modal']),'short_modal_count':len(r['short_modal']),'double_text':r['double_text_probe']['fits'],'measured_pass':r['measured_pass']} for name,r in report['variants'].items()}
print(json.dumps(summary,ensure_ascii=False,indent=2))
if not report['variants']['corrected']['measured_pass']:raise SystemExit(1)
