#!/usr/bin/env python3
from pathlib import Path
import urllib.request,re,hashlib,json

BASE='https://www.ball46.com'
OUT=Path('ball46-scorebar-images-candidate-20260929')
OUT.mkdir(exist_ok=True)

def fetch(name):
    req=urllib.request.Request(f'{BASE}/{name}?scorebar_image_build=20260929',headers={'User-Agent':'Ball46-Scorebar-Images-Build/20260929','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=40) as r:return r.read().decode('utf-8','replace')

def strip_edge_beacon(s):
    # Cloudflare may inject analytics into public HTML. Never bake that edge mutation into Worker source.
    s=re.sub(r'<script[^>]*cloudflareinsights[^>]*>.*?</script>','',s,flags=re.I|re.S)
    s=re.sub(r'<script[^>]*static\.cloudflareinsights\.com[^>]*>.*?</script>','',s,flags=re.I|re.S)
    return s

tune=fetch('dashboard-v2-tune.css')
idx=strip_edge_beacon(fetch('index.html'))

marker='BALL46_SCOREBAR_IMAGES_20260929'
if marker in tune: raise SystemExit('STOP: image marker already exists in live tune CSS')

# Only presentation selectors already emitted by the current renderer.
block=r'''
/* BALL46_SCOREBAR_IMAGES_20260929 — presentation only; no data/API/renderer changes. */
@media(min-width:761px){
  .workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-win{
    background-image:linear-gradient(90deg,rgba(3,35,20,.86) 0%,rgba(4,45,27,.67) 48%,rgba(1,18,12,.34) 100%),url("scorebar-win-20260929a.webp")!important;
    background-size:cover!important;background-position:72% center!important;background-repeat:no-repeat!important;
  }
  .workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-loss{
    background-image:linear-gradient(90deg,rgba(58,3,5,.87) 0%,rgba(74,4,7,.67) 48%,rgba(24,0,1,.34) 100%),url("scorebar-loss-20260929a.webp")!important;
    background-size:cover!important;background-position:72% center!important;background-repeat:no-repeat!important;
  }
  .workspace-scorebar-cell.workspace-scorebar-signal-result.outcome-draw{
    background-image:linear-gradient(90deg,rgba(8,21,33,.87) 0%,rgba(15,32,47,.67) 48%,rgba(3,10,17,.34) 100%),url("scorebar-draw-20260929a.webp")!important;
    background-size:cover!important;background-position:72% center!important;background-repeat:no-repeat!important;
  }
  .workspace-scorebar-cell.workspace-scorebar-pending{
    background-image:linear-gradient(90deg,rgba(10,29,18,.88) 0%,rgba(26,43,24,.69) 48%,rgba(8,14,8,.36) 100%),url("scorebar-pending-20260929a.webp")!important;
    background-size:cover!important;background-position:72% center!important;background-repeat:no-repeat!important;
  }
}
'''

tune2=tune.rstrip()+block+'\n'
# Update only the presentation CSS cache buster, whatever current token is.
pat=r'(dashboard-v2-tune\.css\?v=)([^"\']+)'
matches=list(re.finditer(pat,idx))
if len(matches)!=1: raise SystemExit(f'STOP: expected exactly one dashboard-v2-tune.css cache-buster, found {len(matches)}')
idx2=re.sub(pat,r'\g<1>343-scorebar-images-20260929a',idx,count=1)

# Guard: no JS, endpoint, worker, or runtime wiring is part of this candidate.
(OUT/'dashboard-v2-tune.css').write_text(tune2,encoding='utf-8')
(OUT/'index.html').write_text(idx2,encoding='utf-8')
manifest={
 'source_tune_sha256':hashlib.sha256(tune.encode()).hexdigest(),
 'candidate_tune_sha256':hashlib.sha256(tune2.encode()).hexdigest(),
 'source_index_sha256':hashlib.sha256(idx.encode()).hexdigest(),
 'candidate_index_sha256':hashlib.sha256(idx2.encode()).hexdigest(),
 'css_marker_count':tune2.count(marker),
 'cache_ref':'343-scorebar-images-20260929a',
 'assets':['scorebar-win-20260929a.webp','scorebar-loss-20260929a.webp','scorebar-draw-20260929a.webp','scorebar-pending-20260929a.webp']
}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(manifest,indent=2))
print('BUILD_OK presentation-only tune CSS + index cache-buster')
