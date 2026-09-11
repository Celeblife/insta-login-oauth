from pathlib import Path
import json,shutil
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]; O=R/'verification/deep-audit'; O.mkdir(parents=True,exist_ok=True)
base=(R/'reference/approved/index.html').read_text();css=(R/'ui/production/usability-overrides.css').read_text()
html=base.replace('</head>','<style>'+css+'</style></head>').replace('<body>','<body data-celeblife-production="true">')
checks=[];errors=[];requests=[]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=shutil.which('chromium'),headless=True)
 ctx=b.new_context(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,reduced_motion='reduce')
 page=ctx.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url));page.set_content(html)
 page.locator('#full-name').focus();ids=[]
 for _ in range(5):
  ids.append(page.evaluate('document.activeElement.id'))
  page.keyboard.press('Tab')
 checks.append({'name':'form keyboard order','actual':ids,'pass':ids==['full-name','phone','email','instagram','agree-all']})
 page.locator('#agree-all').focus();page.keyboard.press('Space')
 checks.append({'name':'space toggles all consent','pass':page.locator('[data-consent]:checked').count()==4})
 page.locator('[data-dialog=privacy]').first.focus();page.keyboard.press('Enter')
 checks.append({'name':'keyboard opens policy','pass':page.locator('#info-dialog').is_visible()})
 trapped=True
 for _ in range(15):
  page.keyboard.press('Tab')
  trapped &= page.evaluate('!document.hasFocus() || document.querySelector("#info-dialog").contains(document.activeElement)')
 checks.append({'name':'15 tabs do not focus background document controls; browser chrome permitted','pass':trapped})
 page.keyboard.press('Escape')
 checks.append({'name':'escape closes and restores trigger focus','pass':not page.locator('#info-dialog').is_visible() and page.evaluate('document.activeElement.dataset.dialog')=='privacy'})
 page.locator('#full-name').focus();page.keyboard.press('Enter')
 checks.append({'name':'invalid keyboard submit focuses first field','pass':page.evaluate('document.activeElement.id')=='full-name' and page.locator('#name-error').is_visible()})
 browser=b.version;b.close()
report={'scope':'independent keyboard probes in local approved DOM + unchanged production CSS; browser chrome is outside DOM focus, not a background form escape; not actual app/physical phone or complete focus-loop conformance', 'browser':browser,'checks':checks,'pageErrors':errors,'requests':requests,'pass':all(x['pass'] for x in checks) and not errors and not requests}
(O/'keyboard-probes.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['pass'] else 1)
