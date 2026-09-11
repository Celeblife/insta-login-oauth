"""Validate generated reader anchors and navigation, not app security or external services."""
from pathlib import Path
from collections import Counter
from bs4 import BeautifulSoup
import json
R=Path(__file__).resolve().parents[1]
soup=BeautifulSoup((R/'FINAL_HANDOFF.html').read_text(), 'html.parser')
counts=Counter(e['id'] for e in soup.select('[id]'))
duplicates={key:n for key,n in counts.items() if n>1}
rows=[]
for a in soup.select('body > nav a[href]'):
 href=a['href'];target=soup.find(id=href[1:]) if href.startswith('#') else None
 rows.append({'label':a.get_text(),'href':href,'target':target.get_text() if target else None,
              'pass':target is not None and target.get_text()==a.get_text()})
all_internal=[a['href'][1:] for a in soup.select('a[href^="#"]') if a['href']!='#']
missing=[key for key in all_internal if soup.find(id=key) is None]
report={'scope':'reader navigation only','duplicate_ids':duplicates,'navigation':rows,'missing_internal_targets':missing,
        'pass':bool(rows) and not duplicates and not missing and all(r['pass'] for r in rows)}
O=R/'verification/deep-audit';O.mkdir(parents=True,exist_ok=True)
(O/'reader.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['pass'] else 1)
