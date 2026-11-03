from pathlib import Path
import re, json, subprocess, urllib.request, sys
from html.parser import HTMLParser
base=Path(__file__).resolve().parent.parent
web=base/'public/studio3d'
checks={}
class Parser(HTMLParser):
    def __init__(self): super().__init__(); self.ids=set(); self.links=[]
    def handle_starttag(self,tag,attrs):
        d=dict(attrs)
        if 'id' in d:self.ids.add(d['id'])
        if tag=='script' and 'src' in d:self.links.append(d['src'])
parser=Parser();parser.feed((web/'index.html').read_text())
checks['HTML studio parse']=bool({'auth-gate','studio','glb-upload','publish-draft','admin-login'}.issubset(parser.ids))
for f in web.glob('*.js'):
    proc=subprocess.run(['node','--check',str(f)],capture_output=True,text=True)
    checks['JS syntax '+f.name]=proc.returncode==0
uses=set(re.findall(r"\$\('([^']+)'\)",(web/'studio.js').read_text()))
checks['All editor DOM IDs exist']=uses.issubset(parser.ids)
script=(web/'hidden-entry.js').read_text()
checks['Only hidden gear binding']=('settings-tab-btn' in script and 'studio3d/index.html' in script and 'pointerdown' in script)
checks['No paid AI calls in Studio']=all(x not in (web/'studio.js').read_text() for x in ['api.meshy.ai','MESHY_API_KEY','generate3d(', 'submitTask('])
checks['No hardcoded admin bypass']=not any(x in (web/'auth.js').read_text().lower() for x in ['role = "admin"','alwaysadmin','skipauth','allowall'])
checks['SQL RLS declared']=all(x in (base/'supabase/migrations/20261103_drive_studio_v3.sql').read_text() for x in ['enable row level security','drive3d_publish','drive3d_unpublish','storage.buckets','revoke all'])
checks['Original calculator not copied/rewritten']=not (base/'public/calculator.html').exists()
for name in ['index.html','style.css','studio.js','auth.js','viewer.js','showroom.html','hidden-entry.js']:
    try:
        with urllib.request.urlopen('http://127.0.0.1:8765/studio3d/'+name,timeout=4) as f:
            checks['Local HTTP '+name]=f.status==200 and len(f.read())>100
    except Exception: checks['Local HTTP '+name]=False
for title,v in checks.items():print(('PASS' if v else 'FAIL')+' '+title)
print(f'RESULT {sum(checks.values())}/{len(checks)} checks')
sys.exit(0 if all(checks.values()) else 1)