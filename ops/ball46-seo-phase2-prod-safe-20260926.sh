#!/usr/bin/env bash
set -euo pipefail

BALL46_WORKER="https://ball46-production.mccarey-supon.workers.dev"
ROOT="nomad-live-343"
TMP="/tmp/ball46-seo2"
mkdir -p "$TMP/prod" "$TMP/rollback" "$TMP/verify"

fetch_required(){
  local name="$1" safe code
  safe="${name//\//_}"
  code=$(curl -sS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 \
    -o "$TMP/prod/$safe" -w '%{http_code}' \
    "$BALL46_WORKER/$name?seo2-copy=${GITHUB_RUN_ID:-manual}") || true
  [ "$code" = 200 ] || { echo "PROD_ASSET_HTTP_${code}:$name"; exit 1; }
  test -s "$TMP/prod/$safe" || { echo "PROD_ASSET_EMPTY:$name"; exit 1; }
  mkdir -p "$(dirname "$ROOT/$name")"
  cp "$TMP/prod/$safe" "$ROOT/$name"
}

# Mirror the exact live documents before changing anything.
for f in index.html signal.html statistics.html robots.txt sitemap.xml; do
  fetch_required "$f"
  cp "$ROOT/$f" "$TMP/rollback/$f"
done

# Mirror assets directly referenced by the three indexable pages.
python3 - <<'PY' > /tmp/ball46-seo2-assets.txt
from pathlib import Path
import re
root=Path('nomad-live-343')
found=set()
for page in ('index.html','signal.html','statistics.html'):
    h=(root/page).read_text(errors='ignore')
    for x in re.findall(r'''(?:src|href)=["']([^"']+)["']''',h,re.I):
        x=x.split('?',1)[0].split('#',1)[0].strip().lstrip('./').lstrip('/')
        if not x or '://' in x or '/' in x: continue
        if re.search(r'\.(?:js|css|svg|json|png|webp|jpg|jpeg|ico)$',x,re.I):
            found.add(x)
for x in sorted(found): print(x)
PY
while IFS= read -r name; do [ -n "$name" ] && fetch_required "$name"; done < /tmp/ball46-seo2-assets.txt

# Critical live assets are mirrored explicitly so this deploy cannot revive an older local copy.
protected='dashboard-v2.css dashboard-v2-tune.js v2-shared.css v2-shared.js bulk-odds-compat-343.js expanded-match-343.js full-market-bookmaker-343.js live-summary-full-odds-343.js signal-next.js signal-shared-view-343.css ball46-next.css market-registry-343.js dashboard-v2-stage3.js singlepage-workspace-343.js singlepage-workspace-343.css'
: > "$TMP/protected.sha"
for f in $protected; do
  fetch_required "$f"
  printf '%s  %s\n' "$(sha256sum "$ROOT/$f"|awk '{print $1}')" "$f" >> "$TMP/protected.sha"
done

# Save exact pre-change body hashes. SEO Phase 2 is forbidden from changing page bodies.
python3 - <<'PY'
from pathlib import Path
import hashlib
T=Path('/tmp/ball46-seo2')
R=Path('nomad-live-343')
for page in ('index.html','signal.html','statistics.html'):
    s=(R/page).read_text(errors='strict')
    if '</head>' not in s.lower(): raise SystemExit('HEAD_CLOSE_MISSING:'+page)
    i=s.lower().index('</head>')+len('</head>')
    body=s[i:].encode()
    (T/f'{page}.body.before.sha').write_text(hashlib.sha256(body).hexdigest())
PY

api_check(){
  local prefix="$1"
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/api/engine/board?${prefix}=${GITHUB_RUN_ID:-manual}" -o "$TMP/${prefix}-board.json"
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/api/engine/signals?${prefix}=${GITHUB_RUN_ID:-manual}" -o "$TMP/${prefix}-signals.json"
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 25 "$BALL46_WORKER/api/engine/statistics?${prefix}=${GITHUB_RUN_ID:-manual}" -o "$TMP/${prefix}-statistics.json"
  PREFIX="$prefix" node - <<'NODE'
const fs=require('fs'), p=process.env.PREFIX, T='/tmp/ball46-seo2';
const b=JSON.parse(fs.readFileSync(`${T}/${p}-board.json`));
const s=JSON.parse(fs.readFileSync(`${T}/${p}-signals.json`));
const t=JSON.parse(fs.readFileSync(`${T}/${p}-statistics.json`));
if(b?.ok!==true||!Array.isArray(b?.fixtures)) throw Error('BOARD_UNHEALTHY');
if(!Array.isArray(s?.signals)) throw Error('SIGNALS_UNHEALTHY');
if(t?.ok!==true||!Array.isArray(t?.rows)) throw Error('STATISTICS_UNHEALTHY');
console.log('BALL46_API_OK',p,{fixtures:b.fixtures.length,signals:s.signals.length,settled:t.rows.length});
NODE
}
api_check before

python3 - <<'PY'
from pathlib import Path
import re, json, hashlib
R=Path('nomad-live-343')
T=Path('/tmp/ball46-seo2')
MARK='BALL46 SEO PHASE 2 | 2026-09-26'

def patch(page,title,desc,url,kind):
    p=R/page
    s=p.read_text()
    if s.count('<!-- BALL46 SEO START -->')!=1 or s.count('<!-- BALL46 SEO END -->')!=1:
        raise SystemExit('SEO_MARKER_COUNT:'+page)
    s,n=re.subn(r'<title>.*?</title>',f'<title>{title}</title>',s,count=1,flags=re.S|re.I)
    if n!=1: raise SystemExit('TITLE_COUNT:'+page)
    if kind=='home':
        data={
          '@context':'https://schema.org','@graph':[
            {'@type':'WebSite','@id':'https://www.ball46.com/#website','url':'https://www.ball46.com/','name':'Ball46','description':desc,'inLanguage':'en'},
            {'@type':'Organization','@id':'https://www.ball46.com/#organization','name':'Ball46','url':'https://www.ball46.com/','logo':{'@type':'ImageObject','url':'https://www.ball46.com/ball46-logo.svg'}}
          ]
        }
    else:
        data={'@context':'https://schema.org','@type':'WebPage','@id':url+'#webpage','url':url,'name':title,'description':desc,'inLanguage':'en','isPartOf':{'@id':'https://www.ball46.com/#website'},'about':{'@type':'Thing','name':'Football'}}
    block=(
      '<!-- BALL46 SEO START -->'
      f'<meta name="description" content="{desc}">'
      '<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">'
      f'<link rel="canonical" href="{url}">'
      '<link rel="icon" href="/ball46-logo.svg" type="image/svg+xml">'
      '<meta property="og:type" content="website">'
      '<meta property="og:locale" content="en_US">'
      '<meta property="og:site_name" content="Ball46">'
      f'<meta property="og:title" content="{title}">'
      f'<meta property="og:description" content="{desc}">'
      f'<meta property="og:url" content="{url}">'
      '<meta name="twitter:card" content="summary">'
      f'<meta name="twitter:title" content="{title}">'
      f'<meta name="twitter:description" content="{desc}">'
      f'<script type="application/ld+json">{json.dumps(data,separators=(",",":"),ensure_ascii=False)}</script>'
      f'<!-- {MARK} -->'
      '<!-- BALL46 SEO END -->'
    )
    s,n=re.subn(r'<!-- BALL46 SEO START -->.*?<!-- BALL46 SEO END -->',block,s,count=1,flags=re.S)
    if n!=1: raise SystemExit('SEO_BLOCK_REPLACE:'+page)
    p.write_text(s)

patch('index.html',
      'Live Football Scores, Odds, Event Flow & Match Signals | Ball46',
      'Follow live football scores, soccer odds, event flow, match status, statistics and transparent match signals in one dashboard. See the game before you decide.',
      'https://www.ball46.com/','home')
patch('signal.html',
      'Live Football Signals, Odds & Event Flow | Ball46',
      'Track live football signals with match time, score, market, selection, entry odds and supporting event flow. Review the evidence before you decide.',
      'https://www.ball46.com/signal.html','page')
patch('statistics.html',
      'Football Signal Statistics, Results & Win Rate | Ball46',
      'Review Ball46 football signal statistics, settled results, win/loss totals, win rate, average entry odds and market performance with transparent history.',
      'https://www.ball46.com/statistics.html','page')

# Refresh sitemap dates only; URL inventory stays unchanged.
p=R/'sitemap.xml'; s=p.read_text()
s=re.sub(r'<lastmod>[^<]+</lastmod>','<lastmod>2026-09-26</lastmod>',s)
p.write_text(s)

# Prove all page bodies remain byte-identical.
for page in ('index.html','signal.html','statistics.html'):
    s=(R/page).read_text()
    i=s.lower().index('</head>')+len('</head>')
    after=hashlib.sha256(s[i:].encode()).hexdigest()
    before=(T/f'{page}.body.before.sha').read_text().strip()
    if after!=before: raise SystemExit('BODY_CHANGED:'+page)
    if MARK not in s: raise SystemExit('SEO_PHASE2_MARKER_MISSING:'+page)
    if 'noindex' in s.lower(): raise SystemExit('NOINDEX_FOUND:'+page)
print('BALL46_SEO2_HEAD_ONLY_PATCH_READY')
PY

# robots.txt remains exactly the live version; sitemap keeps the same URL set and only gets fresh lastmod dates.
cmp -s "$ROOT/robots.txt" "$TMP/rollback/robots.txt" || { echo ROBOTS_CHANGED_UNEXPECTEDLY; exit 1; }

grep -Fq 'Sitemap: https://www.ball46.com/sitemap.xml' "$ROOT/robots.txt"
grep -Fq 'https://www.ball46.com/' "$ROOT/sitemap.xml"
grep -Fq 'https://www.ball46.com/signal.html' "$ROOT/sitemap.xml"
grep -Fq 'https://www.ball46.com/statistics.html' "$ROOT/sitemap.xml"

echo BALL46_SEO2_BUILD_OK
