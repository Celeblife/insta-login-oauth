"""Rebuild local combined Markdown and a self-contained HTML reader. No remote I/O."""
from pathlib import Path
from markdown_it import MarkdownIt
from bs4 import BeautifulSoup
import re, base64, posixpath
R=Path(__file__).resolve().parents[1]
sources=[('고정 범위 감사 결과','docs/DEEP_AUDIT.md'),('이전 v1.3.1 검토 이력','docs/LAST_REVIEW.md'),('인계 요약','README.md'),('제품·시스템 기준','docs/V2_SPEC.md'),('UI/UX 구현 명세','docs/UI_UX_SPEC.md'),('백엔드·DB','docs/BACKEND_DB_SPEC.md'),('API 계약','contracts/API.md'),('v1.3 검토 이력','docs/SECOND_REVIEW.md'),('기존 발견사항','docs/FINAL_REVIEW.md'),('출시 게이트','docs/RELEASE_CHECKLIST.md'),('구현 순서','docs/IMPLEMENTATION_PLAN.md'),('테스트자료 초기화','docs/RESET_PLAN.md'),('실제 앱 인수 테스트','docs/TEST_MATRIX.md'),('현재 검증 결과','verification/FINAL_VERIFICATION.md'),('Codex 지시문','START_HERE_FOR_CODEX.md'),('근거·범위','docs/SOURCES.md')]
intro='# 셀럽라이프 온보딩 v2 · 재검토 인계서\n\n**v1.3.2 AUDIT · 2026-09-10**\n\n승인 UI·제품 결정을 유지한 감사 개정본입니다. 취소 초안 복원과 연결 해제·갱신 경계를 명확히 하고 통합 문서 목차를 수정했습니다. 실제 서비스·실기기·외부 계정 검증은 별도입니다. 이 통합본은 상세 문서의 읽기용 파생본입니다.\n\n'
text=intro
for idx,(title,rel) in enumerate(sources,1):
 raw=(R/rel).read_text()
 raw=re.sub(r'^# [^\n]+\n','',raw,count=1)
 def norm(m):
  pre,target=m.group(1),m.group(2)
  if target.startswith(('http:','https:','mailto:','#','data:')):return m.group(0)
  target=posixpath.normpath(posixpath.join(str(Path(rel).parent),target))
  return pre+'('+target+')'
 raw=re.sub(r'(!?\[[^\]]*\])\(([^ )]+)\)',norm,raw)
 text+=f'\n---\n\n## {idx:02}. {title}\n\n원문: `{rel}`\n\n'+raw+'\n'
(R/'FINAL_HANDOFF.md').write_text(text)
md=MarkdownIt('commonmark',{'html':False}).enable('table')
html=md.render(text);soup=BeautifulSoup(html,'html.parser')
for im in soup.select('img[src]'):
 p=R/im['src']
 if p.exists(): im['src']='data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
 im['loading']='lazy'
for table in list(soup.select('table')):
 wrap=soup.new_tag('div',attrs={'class':'table-wrap'});table.wrap(wrap)
anchors={rel:f'section-{i}' for i,(_,rel) in enumerate(sources,1)}
nav=[]
for h in soup.find_all('h2'):
 t=h.get_text()
 i=next((n for n,(title,_) in enumerate(sources,1) if t==f'{n:02}. {title}'),None)
 if i is not None:
  h['id']=f'section-{i}';nav.append(f'<a href="#section-{i}">{t}</a>')
for a in soup.select('a[href]'):
 href=a['href']
 if href in anchors:a['href']='#'+anchors[href]
 elif not href.startswith(('http:','https:','mailto:','#','data:')):
  # Non-document code links exist only in the ZIP. Display reference, not a broken standalone link.
  code=soup.new_tag('code');code.string=a.get_text()+' (ZIP: '+href+')';a.replace_with(code)
# Undo empty code nodes caused by code-file links, preserve labels in the robust branch below.
# Current README's non-doc links are handled by rerendering them as contextual archive labels.
htmlbody=str(soup)
# No external assets/scripts; the reader itself accepts no user input.
css='''*{box-sizing:border-box}body{margin:0;background:#f8f7fb;color:#292235;font-family:Arial,"Noto Sans CJK KR","Malgun Gothic",sans-serif;line-height:1.8}header{background:#fff;border-bottom:1px solid #e5dded;padding:28px max(20px,calc((100% - 1080px)/2));}header b{color:#7145b9;font-size:15px}main{max-width:1120px;margin:24px auto;padding:36px;background:white;border:1px solid #eee8f3;border-radius:16px}h1{font-size:29px;line-height:1.4}h2{font-size:24px;margin-top:55px;border-bottom:1px solid #e7e0ee;padding-bottom:12px;scroll-margin-top:20px}h3{font-size:19px;margin-top:32px}p,li{overflow-wrap:anywhere}a{color:#7046b8}nav{display:flex;gap:10px;flex-wrap:wrap;max-width:1080px;margin:20px auto;padding:0 16px}nav a{font-size:13px;background:#eee7f8;padding:5px 10px;border-radius:5px;text-decoration:none}img{display:block;max-width:100%;height:auto;margin:20px auto;border:1px solid #eee;border-radius:10px}pre{background:#f7f4fb;border:1px solid #e7deef;padding:18px;overflow:auto;font-size:13px;line-height:1.6}code{font-family:Consolas,monospace;font-size:.91em;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:14px;min-width:540px}td,th{text-align:left;vertical-align:top;border:1px solid #e7e1ed;padding:10px}th{background:#f3eff9}.table-wrap{overflow-x:auto;margin:20px 0}hr{margin:60px 0;border:0;border-top:1px solid #e8e0ef}@media(max-width:640px){main{margin:0;padding:22px 18px;border:0;border-radius:0}h1{font-size:25px}h2{font-size:22px}p,li{font-size:15px}header{padding:20px}table{font-size:13px}}'''
reader='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; base-uri \'none\'"><title>셀럽라이프 v2 인계서 v1.3.2</title><style>'+css+'</style></head><body><header><b>CELEBLIFE · DEVELOPMENT HANDOFF v1.3.2</b><div>문서·참고 코드 단계 / 실제 서비스 운영 검증 전</div></header><nav>'+''.join(nav)+'</nav><main>'+htmlbody+'</main></body></html>'
(R/'FINAL_HANDOFF.html').write_text(reader)
print('reader rebuilt',len(text),len(reader))
