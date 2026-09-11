"""Validate this handoff's local files/links/manifest. Does not touch the live repo or DB."""
from pathlib import Path
import json,re,hashlib,sys
ROOT=Path(__file__).resolve().parents[1]
errors=[]; links=0
for f in ROOT.rglob('*.md'):
    if 'history-v1.1' in f.parts: continue
    for target in re.findall(r'!?\[[^\]]*\]\(([^ )]+)\)',f.read_text(encoding='utf8')):
        if target.startswith(('http:','https:','mailto:','#','data:')):continue
        p=(f.parent/target.split('#')[0]).resolve();links+=1
        if not p.exists():errors.append(f'{f.relative_to(ROOT)} missing link {target}')
for f in ROOT.rglob('*'):
    if f.is_file() and f.suffix.lower() in {'.ttf','.otf','.woff','.woff2','.key','.pem'}:
        errors.append('Forbidden distributed credential/font-like file: '+str(f.relative_to(ROOT)))
manifest=ROOT/'PACKAGE_MANIFEST.json'
if manifest.exists():
    data=json.loads(manifest.read_text())
    for item in data.get('files',[]):
        f=ROOT/item['path']
        if not f.exists() or hashlib.sha256(f.read_bytes()).hexdigest()!=item['sha256']:
            errors.append('Checksum mismatch: '+item['path'])
report={'passed':not errors,'local_markdown_links_checked':links,'errors':errors,
        'scope':'package consistency only; not real application/security/production testing'}
(ROOT/'verification/package-check.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(0 if report['passed'] else 1)
