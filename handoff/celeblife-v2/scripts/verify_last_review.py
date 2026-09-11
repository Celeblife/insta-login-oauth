"""Local DOM probes for v1.3.1. Not a deployed app, physical device or OAuth test.
Requires Python playwright and Chromium. Does not access external URLs.
"""
from pathlib import Path
import json, shutil, argparse
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default='verification/last-audit');args=parser.parse_args()
O=(R/args.output_dir).resolve()
if not O.is_relative_to((R/'verification').resolve()): raise SystemExit('Output must be under verification/')
O.mkdir(parents=True,exist_ok=True)
base=(R/'reference/approved/index.html').read_text(); css=(R/'ui/production/usability-overrides.css').read_text()
html=base.replace('</head>','<style>'+css+'</style></head>').replace('<body>','<body data-celeblife-production="true">')
rows=[]; errors=[]; requests=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True,args=['--no-sandbox'])
 ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce',device_scale_factor=1)
 for w,h,scale in [(320,640,1),(360,640,1),(390,844,1),(430,844,1),(861,844,1),(320,320,1),(390,420,1),(320,844,2),(390,844,2)]:
  page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda req:requests.append(req.url))
  page.set_viewport_size({'width':w,'height':h});page.set_content(html)
  page.evaluate('''()=>{document.querySelector('#dialog-title').textContent='연결된 계정을 확인해 주세요.';
   document.querySelector('#dialog-body').textContent='입력하신 계정은 @aaa, Instagram에서 확인된 계정은 @'+'w'.repeat(30)+'입니다. 연결할 계정을 확인해 주세요.';
   const button=document.querySelector('#info-dialog .dialog-footer .primary');button.textContent='@'+'w'.repeat(30)+'으로 연결';
   const secondary=document.createElement('button');secondary.type='button';secondary.className='secondary';secondary.textContent='다른 계정으로 다시 연결';
   document.querySelector('#info-dialog .dialog-footer').append(secondary);document.querySelector('#info-dialog').showModal();}''')
  if scale==2:
   page.evaluate('''()=>{const els=[...document.querySelectorAll('#info-dialog *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()));const sizes=els.map(e=>parseFloat(getComputedStyle(e).fontSize));els.forEach((e,i)=>e.style.setProperty('font-size',sizes[i]*2+'px','important'));}''')
  page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
  d=page.locator('#info-dialog').evaluate('''el=>{const panel=el.getBoundingClientRect(),body=el.querySelector('.dialog-body'),btn=el.querySelector('.primary'),secondary=el.querySelector('.secondary');const r=btn.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(btn);const t=range.getBoundingClientRect();const foot=el.querySelector('.dialog-footer').getBoundingClientRect();const sr=secondary.getBoundingClientRect();const range2=document.createRange();range2.selectNodeContents(secondary);const t2=range2.getBoundingClientRect();return {panelWidth:panel.width,panelHeight:panel.height,buttonWidth:r.width,buttonScrollWidth:btn.scrollWidth,buttonClientWidth:btn.clientWidth,buttonTextFits:t.left>=r.left-1&&t.right<=r.right+1&&t.top>=r.top-1&&t.bottom<=r.bottom+1,secondaryTextFits:t2.top>=sr.top-1&&t2.bottom<=sr.bottom+1,footerFits:foot.bottom<=panel.bottom+1,modalScrollable:['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight,bodyContentHeight:body.clientHeight-parseFloat(getComputedStyle(body).paddingTop)-parseFloat(getComputedStyle(body).paddingBottom),documentWidth:document.documentElement.scrollWidth}}''')
  d.update(width=w,height=h,textScale=scale)
  d['pass']=d['buttonTextFits'] and d['secondaryTextFits'] and (d['footerFits'] or d['modalScrollable']) and d['bodyContentHeight']>0 and d['documentWidth']<=w+1
  rows.append(d)
  if (w,h,scale)==(390,844,1):page.screenshot(path=str(O/'confirmation-long-after.png'),full_page=True,animations='disabled')
  if (w,h,scale)==(320,320,1):page.screenshot(path=str(O/'confirmation-short-after.png'),full_page=True,animations='disabled')
  page.close()
 b.close()
report={'scope':'specified confirmation modal rendered in approved prototype DOM plus production CSS; not a React implementation',
 'browser':b.version,'mode':'in_memory_local_assets','cases':rows,'errors':errors,'external_requests':requests,
 'pass':all(r['pass'] for r in rows) and not errors and not requests,
 'not_run':['Real iOS/Android/Instagram WebView','Actual OS text scaling or keyboard','HTTP/CSP/Next.js/backend/DB/Meta/SMTP']}
(O/'confirmation-probes.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['pass'] else 1)
