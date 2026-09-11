"""Compare approved HTML and its split copy in one Chromium environment.
Requires: Python playwright, pillow; Chromium. This does not test any real API.
"""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
import threading, json, shutil, argparse
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--memory', action='store_true', help='Inline local assets for offline DOM/render verification when URL navigation is unavailable')
parser.add_argument('--output-dir',default='verification')
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]
OUT=(ROOT/args.output_dir).resolve()
if not OUT.is_relative_to((ROOT/'verification').resolve()): raise SystemExit('Output must be under verification/')
OUT.mkdir(parents=True,exist_ok=True)
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
thread=threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
base=f'http://127.0.0.1:{server.server_port}'
report={'scope':'split UI equivalence and demo interaction only; no real OAuth/DB/SMTP','comparisons':[],'interaction':{},'console_errors':[],'external_requests':[]}
report['render_mode']='in_memory_local_assets' if args.memory else 'http_local_assets'
report['limitations']=['Local URL loading is not tested in memory mode. CSS/JS are inlined by this harness only. No browser policy or distributed source is modified.'] if args.memory else []
def load(page,path,state):
    if not args.memory:
        page.goto(f'{base}/{path}#{state}',wait_until='networkidle')
        return page
    context=page.context
    viewport=page.viewport_size
    page.close()
    page=context.new_page()
    if viewport: page.set_viewport_size(viewport)
    page.on('pageerror',lambda err:report['console_errors'].append(str(err)))
    page.on('request',lambda req:report['external_requests'].append(req.url) if not req.url.startswith(base) else None)
    html=(ROOT/path).read_text(encoding='utf8')
    if path=='ui/index.html':
        html=html.replace('<link rel="stylesheet" href="./styles.css">','<style>'+(ROOT/'ui/styles.css').read_text(encoding='utf8')+'</style>')
        html=html.replace('<script src="./preview.js" defer></script>','<script>'+(ROOT/'ui/preview.js').read_text(encoding='utf8')+'</script>')
        html=html.replace("script-src 'self';", "script-src 'unsafe-inline';")
    page.set_content(html,wait_until='load')
    page.evaluate('(state)=>showView(state,{focus:false})',state)
    return page
try:
    with sync_playwright() as p:
        exe=shutil.which('chromium') or shutil.which('chromium-browser')
        browser=p.chromium.launch(headless=True,**({'executable_path':exe} if exe else {}),args=['--no-sandbox'])
        for label,viewport in [('desktop',{'width':1440,'height':960}),('mobile',{'width':390,'height':844})]:
            context=browser.new_context(viewport=viewport,reduced_motion='reduce')
            page=context.new_page()
            page.on('pageerror',lambda err:report['console_errors'].append(str(err)))
            page.on('request',lambda req:report['external_requests'].append(req.url) if not req.url.startswith(base) else None)
            for state in ['intro','form','loading','success','error']:
                images=[]
                for variant,path in [('approved','reference/approved/index.html'),('split','ui/index.html')]:
                    page=load(page,path,state)
                    page.locator(f'#view-{state}').wait_for(state='visible')
                    page.screenshot(path=str(OUT/f'{label}-{state}-{variant}.png'),full_page=True,animations='disabled')
                    images.append(Image.open(OUT/f'{label}-{state}-{variant}.png').convert('RGB'))
                same=images[0].size==images[1].size and ImageChops.difference(*images).getbbox() is None
                report['comparisons'].append({'viewport':label,'state':state,'pixel_identical':same,'size':images[1].size})
                assert same,f'UI differs: {label}/{state}'
            context.close()
        context=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce')
        page=context.new_page()
        page.on('pageerror',lambda err:report['console_errors'].append(str(err)))
        page=load(page,'ui/index.html','form')
        page.locator('button[type=submit]').click()
        assert page.locator('#name-error').is_visible()
        report['interaction']['empty_form_rejected']=True
        page.locator('#sample-btn').click()
        assert not page.locator('#agree-all').is_checked()
        report['interaction']['sample_does_not_preconsent']=True
        page.locator('#agree-all').check()
        assert page.locator('[data-consent]:checked').count()==4
        page.locator('[name=privacy]').uncheck()
        assert page.locator('#agree-all').evaluate('(el)=>el.indeterminate')
        report['interaction']['consent_all_and_indeterminate']=True
        page.locator('[data-dialog=privacy]').first.click()
        assert page.locator('#info-dialog').is_visible()
        page.keyboard.press('Escape')
        assert not page.locator('#info-dialog').is_visible()
        report['interaction']['policy_dialog_keyboard_close']=True
        page.locator('#agree-all').check()
        page.locator('button[type=submit]').click()
        assert page.locator('#oauth-dialog').is_visible()
        page.locator('#simulate-error').click()
        assert page.locator('#view-error').is_visible()
        page.locator('#view-error [data-view=form]').click()
        assert page.locator('#full-name').input_value()=='김셀럽'
        report['interaction']['cancel_preserves_in_tab_draft']=True
        page.locator('button[type=submit]').click()
        page.locator('#simulate-btn').click()
        page.locator('#view-success').wait_for(state='visible',timeout=10000)
        assert page.locator('#success-account').inner_text()=='@celeblife_demo'
        report['interaction']['demo_full_flow']=True
        page.set_viewport_size({'width':320,'height':780})
        page=load(page,'ui/index.html','form')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
        report['interaction']['no_horizontal_overflow_at_320']=True
        browser.close()
        report['passed']=not report['console_errors'] and not report['external_requests']
        assert report['passed']
finally:
    server.shutdown()
    (OUT/'ui-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
