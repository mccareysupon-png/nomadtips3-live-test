#!/usr/bin/env bash
set -euo pipefail

BALL46_URL="${BALL46_URL:-https://ball46.com}"
EXPECTED_PROD_VERSION="${EXPECTED_PROD_VERSION:-4ffb5681-89aa-47b3-b2b3-75c25dfb231c}"
EXPECTED_ENGINE="${EXPECTED_ENGINE:-nomad343-engine-v6.2-viewer-readonly-cron-referee-lock-v1}"
EXPECTED_HUB="${EXPECTED_HUB:-nomad343-5usd-hub-v6-viewer-cache-only}"
EXPECTED_FULLMARKET="${EXPECTED_FULLMARKET:-nomad343-ball46-full-market-v6-server-prewarm-cache}"
CANONICAL_BRANCH="${CANONICAL_BRANCH:-work/ball46-viewer-readonly-lock-v1-20260920}"
PATCH_JS=live-summary-full-odds-343.js
CFG=workers/nomadtips3-343-preview/wrangler.ball46.jsonc
RUN_ID="${GITHUB_RUN_ID:-manual}"

mkdir -p /tmp/fo/prod /tmp/fo/before /tmp/fo/after /tmp/fo/names /tmp/fo/patch

active_version(){
  local out="$1"
  npx --yes wrangler@4.92.0 deployments list --config "$CFG" --json > "$out"
  node -e "const r=require('$out'); const x=r[r.length-1]; console.log(x?.versions?.find(v=>Number(v.percentage)===100)?.version_id||'')"
}

rollback(){
  echo "VERIFY_FAILED_ROLLBACK_TO=$EXPECTED_PROD_VERSION"
  npx --yes wrangler@4.92.0 rollback "$EXPECTED_PROD_VERSION" --config "$CFG" || true
}

# 1) Exact production + public assets snapshot
current=$(active_version /tmp/fo/deployments-before.json)
echo "CURRENT_PROD_VERSION=$current"
[ "$current" = "$EXPECTED_PROD_VERSION" ] || { echo "PRODUCTION_MOVED:$current"; exit 1; }
printf '%s' "$current" > /tmp/fo/prod-version

for page in index.html signal.html statistics.html; do
  curl -fsS -L --retry 5 --retry-all-errors --retry-delay 1 --max-time 30 "$BALL46_URL/$page?fo3-before=$RUN_ID" -o "/tmp/fo/prod/$page"
  test -s "/tmp/fo/prod/$page"
done
curl -fsS -L --max-time 25 "$BALL46_URL/$PATCH_JS?fo3-before=$RUN_ID" -o "/tmp/fo/prod/$PATCH_JS"
grep -Fq BALL46_VIEWER_READONLY_LOCK_V1 "/tmp/fo/prod/$PATCH_JS"
grep -Fq CENTRAL_CACHE_READ_ONLY "/tmp/fo/prod/$PATCH_JS"
cp "nomad-live-343/$PATCH_JS" "/tmp/fo/patch/$PATCH_JS"
grep -Fq BALL46_FULL_ODDS_19BOOK_RESTORE_V1 "/tmp/fo/patch/$PATCH_JS"
grep -Fq "signalFilterPrefetch:false" "/tmp/fo/patch/$PATCH_JS"
! grep -Fq applyRichOdds "/tmp/fo/patch/$PATCH_JS"
node --check "/tmp/fo/patch/$PATCH_JS"

# 2) Runtime identities + old blocked route precondition
for ep in engine hub full-market; do
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 30 "$BALL46_URL/api/$ep/health?fo3-before=$RUN_ID" -o "/tmp/fo/before/$ep.json"
done
ev=$(node -e "console.log(require('/tmp/fo/before/engine.json').version||'')")
hv=$(node -e "console.log(require('/tmp/fo/before/hub.json').version||'')")
fv=$(node -e "console.log(require('/tmp/fo/before/full-market.json').version||'')")
echo "BACKEND_BEFORE engine=$ev hub=$hv fullmarket=$fv"
[ "$ev" = "$EXPECTED_ENGINE" ]
[ "$hv" = "$EXPECTED_HUB" ]
[ "$fv" = "$EXPECTED_FULLMARKET" ]

sc=$(curl -sS -L --max-time 25 -o /tmp/fo/before/scan.json -w '%{http_code}' "$BALL46_URL/api/engine/scan?fo3-before=$RUN_ID")
[ "$sc" = 403 ]
grep -Fq VIEWER_ENGINE_TRIGGER_DISABLED /tmp/fo/before/scan.json
ec=$(curl -sS -L --max-time 25 -o /tmp/fo/before/engine-odds.json -w '%{http_code}' "$BALL46_URL/api/engine/fixture-odds?fo3-before=$RUN_ID")
[ "$ec" = 403 ]
fc=$(curl -sS -L --max-time 25 -o /tmp/fo/before/full-odds.json -w '%{http_code}' "$BALL46_URL/api/full-market/fixture-odds?fo3-before=$RUN_ID")
[ "$fc" = 410 ]
grep -Fq VIEWER_PROVIDER_FETCH_DISABLED /tmp/fo/before/full-odds.json
echo PRECHECK_RUNTIME_PASS

# 3) Canonical wrapper + Full Market contract
git fetch origin "$CANONICAL_BRANCH" --no-tags
git show FETCH_HEAD:workers/nomadtips3-343-preview/src/index.js > /tmp/fo/canonical-index.js
git show FETCH_HEAD:workers/nomadtips3-343-preview/wrangler.ball46.jsonc > /tmp/fo/canonical-wrangler.jsonc
git show FETCH_HEAD:workers/nomadtips3-full-market-343-ball46/src/index.js > /tmp/fo/full-market.js
cp /tmp/fo/canonical-index.js workers/nomadtips3-343-preview/src/index.js
cp /tmp/fo/canonical-wrangler.jsonc "$CFG"
python3 -c "from pathlib import Path; p=Path('workers/nomadtips3-343-preview/src/index.js'); s=p.read_text(); old=\"if (path === '/fixture-odds') return Response.json({ok:false,error:'VIEWER_PROVIDER_FETCH_DISABLED',mode:'CENTRAL_CACHE_READ_ONLY',externalRequestsAdded:0,lock:'BALL46_VIEWER_READONLY_LOCK_V1'},{status:410,headers:{'cache-control':'no-store'}});\"; new=\"if (path === '/fixture-odds') return env.FULL_MARKET.fetch(fullMarketRequest(request, '/fixture-odds'));\"; assert s.count(old)==1; p.write_text(s.replace(old,new))"
grep -Fq "if (path === '/fixture-odds') return env.FULL_MARKET.fetch" workers/nomadtips3-343-preview/src/index.js
grep -Fq VIEWER_ENGINE_TRIGGER_DISABLED workers/nomadtips3-343-preview/src/index.js
! grep -Fq VIEWER_PROVIDER_FETCH_DISABLED workers/nomadtips3-343-preview/src/index.js
cmp -s /tmp/fo/canonical-wrangler.jsonc "$CFG"
node --check workers/nomadtips3-343-preview/src/index.js

grep -Fq "BOOKMAKERS.join(',')" /tmp/fo/full-market.js
grep -Fq "url.searchParams.set('bookmakers'" /tmp/fo/full-market.js
for b in bet365 pinnacle williamhill ladbrokes vcbet 1xbet bwin easybets interwetten betfair snai macauslot betsson betathome 18bet 10bet 12bet coral crown; do
  grep -Fq "'$b'" /tmp/fo/full-market.js
done
echo FULL_MARKET_19BOOK_ONE_REQUEST_CONTRACT_PASS

# 4) Mirror live production assets, then overlay exactly one client asset
mv nomad-live-343 /tmp/fo/repo-assets
mkdir -p nomad-live-343
find /tmp/fo/repo-assets -maxdepth 1 -type f -printf '%f\n' > /tmp/fo/names/workspace.txt
git ls-tree -r --name-only FETCH_HEAD nomad-live-343/ | sed 's#^nomad-live-343/##' | awk 'index($0,"/")==0' > /tmp/fo/names/canonical.txt
cat /tmp/fo/names/workspace.txt /tmp/fo/names/canonical.txt | sort -u > /tmp/fo/names/all.txt
while IFS= read -r name; do
  [ -n "$name" ] || continue
  [ "$name" = "$PATCH_JS" ] && continue
  case "$name" in
    *.html|*.js|*.css|*.svg|*.json|*.txt|*.xml|*.png|*.webp|*.jpg|*.jpeg|*.ico|*.woff|*.woff2) ;;
    *) continue ;;
  esac
  tmp="/tmp/fo/live-${name//\//_}"
  code=$(curl -sS -L --retry 3 --retry-all-errors --retry-delay 1 --max-time 20 -o "$tmp" -w '%{http_code}' "$BALL46_URL/$name?fo3-mirror=$RUN_ID") || code=000
  if [ "$code" = 200 ] && [ -s "$tmp" ]; then cp "$tmp" "nomad-live-343/$name"; fi
done < /tmp/fo/names/all.txt
cp /tmp/fo/prod/index.html nomad-live-343/index.html
cp /tmp/fo/prod/signal.html nomad-live-343/signal.html
cp /tmp/fo/prod/statistics.html nomad-live-343/statistics.html
count=$(find nomad-live-343 -maxdepth 1 -type f | wc -l)
echo "PRODUCTION_STAGING_FILES=$count"
[ "$count" -ge 100 ]
cp -a nomad-live-343 /tmp/fo/assets-before
cp "/tmp/fo/patch/$PATCH_JS" "nomad-live-343/$PATCH_JS"
node --check "nomad-live-343/$PATCH_JS"
diff -qr /tmp/fo/assets-before nomad-live-343 > /tmp/fo/assets.diff || true
cat /tmp/fo/assets.diff
[ "$(wc -l < /tmp/fo/assets.diff)" -eq 1 ]
grep -Fq "$PATCH_JS" /tmp/fo/assets.diff
cmp -s /tmp/fo/prod/index.html nomad-live-343/index.html
cmp -s /tmp/fo/prod/signal.html nomad-live-343/signal.html
cmp -s /tmp/fo/prod/statistics.html nomad-live-343/statistics.html
echo ASSET_SCOPE_PASS

# 5) Race guard + dry run
race=$(active_version /tmp/fo/deployments-race.json)
echo "RACE_GUARD=$current:$race"
[ "$race" = "$current" ] || { echo "PRODUCTION_MOVED_DURING_BUILD:$race"; exit 1; }
npx --yes wrangler@4.92.0 deploy --dry-run --config "$CFG"

# 6) Deploy
npx --yes wrangler@4.92.0 deploy --config "$CFG"
trap rollback ERR

# 7) Post-deploy integrity
for page in index.html signal.html statistics.html; do
  curl -fsS -L --retry 5 --retry-all-errors --retry-delay 1 --max-time 30 "$BALL46_URL/$page?fo3-after=$RUN_ID" -o "/tmp/fo/after/$page"
  cmp -s "/tmp/fo/prod/$page" "/tmp/fo/after/$page"
done
curl -fsS -L --max-time 25 "$BALL46_URL/$PATCH_JS?fo3-after=$RUN_ID" -o "/tmp/fo/after/$PATCH_JS"
grep -Fq BALL46_FULL_ODDS_19BOOK_RESTORE_V1 "/tmp/fo/after/$PATCH_JS"
grep -Fq "signalFilterPrefetch:false" "/tmp/fo/after/$PATCH_JS"
grep -Fq 'match-row>.market-cell b' "/tmp/fo/after/$PATCH_JS"
! grep -Fq applyRichOdds "/tmp/fo/after/$PATCH_JS"

sc=$(curl -sS -L --max-time 25 -o /tmp/fo/after/scan.json -w '%{http_code}' "$BALL46_URL/api/engine/scan?fo3-after=$RUN_ID")
[ "$sc" = 403 ]
ec=$(curl -sS -L --max-time 25 -o /tmp/fo/after/engine-odds.json -w '%{http_code}' "$BALL46_URL/api/engine/fixture-odds?fo3-after=$RUN_ID")
[ "$ec" = 403 ]
fc=$(curl -sS -L --max-time 25 -o /tmp/fo/after/full-empty.json -w '%{http_code}' "$BALL46_URL/api/full-market/fixture-odds?fo3-after=$RUN_ID")
[ "$fc" = 400 ]
grep -Fq INVALID_FIXTURE_ID /tmp/fo/after/full-empty.json

for ep in engine hub full-market; do
  curl -fsS -L --retry 4 --retry-all-errors --retry-delay 1 --max-time 30 "$BALL46_URL/api/$ep/health?fo3-after=$RUN_ID" -o "/tmp/fo/after/$ep.json"
done
ev2=$(node -e "console.log(require('/tmp/fo/after/engine.json').version||'')")
hv2=$(node -e "console.log(require('/tmp/fo/after/hub.json').version||'')")
fv2=$(node -e "console.log(require('/tmp/fo/after/full-market.json').version||'')")
[ "$ev2" = "$EXPECTED_ENGINE" ]
[ "$hv2" = "$EXPECTED_HUB" ]
[ "$fv2" = "$EXPECTED_FULLMARKET" ]
echo "BACKEND_AFTER engine=$ev2 hub=$hv2 fullmarket=$fv2"

# 8) Prove a real fixture endpoint requests the 19-book set.
curl -fsS -L --max-time 30 "$BALL46_URL/api/engine/board?fo3-smoke=$RUN_ID" -o /tmp/fo/after/board.json
node -e "const fs=require('fs'); const j=require('/tmp/fo/after/board.json'); const a=Array.isArray(j.fixtures)?j.fixtures:[]; const live=a.filter(x=>String(x.boardState||x.status||'').toLowerCase().includes('live')); const ids=[...new Set([...live,...a].map(x=>String(x.fixtureId||'').trim()).filter(Boolean))].slice(0,12); fs.writeFileSync('/tmp/fo/fixture-ids',ids.join('\\n')); console.log('SMOKE_CANDIDATES='+ids.join(','));"

# Prefer a server-prewarmed/cache-hit fixture so verification does not deliberately fan out.
ids_json=$(node -e "const fs=require('fs'); const ids=fs.readFileSync('/tmp/fo/fixture-ids','utf8').split(/\\n/).filter(Boolean); process.stdout.write(JSON.stringify({fixtureIds:ids}))")
curl -fsS -L --max-time 25 -H 'content-type: application/json' -d "$ids_json" "$BALL46_URL/api/full-market/board-cache?fo3-cache=$RUN_ID" -o /tmp/fo/after/cache-board.json
cached_id=$(node -e "const j=require('/tmp/fo/after/cache-board.json'); const e=j.entries||{}; const id=Object.keys(e).find(k=>e[k]&&e[k].fullOdds); console.log(id||'')")
if [ -n "$cached_id" ]; then fid="$cached_id"; else fid=$(head -n 1 /tmp/fo/fixture-ids); fi
echo "FULL_ODDS_SMOKE_FIXTURE=$fid"
[ -n "$fid" ]
fullcode=$(curl -sS -L --max-time 40 -o /tmp/fo/after/full.json -w '%{http_code}' "$BALL46_URL/api/full-market/fixture-odds?fixtureId=$fid&fo3-smoke=$RUN_ID")
echo "FULL_ODDS_SMOKE_STATUS=$fullcode"
[ "$fullcode" = 200 ]
requested=$(node -e "const j=require('/tmp/fo/after/full.json'); console.log(Array.isArray(j.requestedBookmakers)?j.requestedBookmakers.length:0)")
returned=$(node -e "const j=require('/tmp/fo/after/full.json'); console.log(Number(j.bookmakerCount||0))")
cached=$(node -e "const j=require('/tmp/fo/after/full.json'); console.log(Boolean(j.cached))")
echo "FULL_ODDS_REQUESTED_BOOKS=$requested"
echo "FULL_ODDS_RETURNED_BOOKS=$returned"
echo "FULL_ODDS_CACHE_HIT=$cached"
[ "$requested" -eq 19 ]
[ "$returned" -ge 1 ]

newv=$(active_version /tmp/fo/deployments-after.json)
echo "NEW_PROD_VERSION=$newv"
[ -n "$newv" ]
trap - ERR
echo BALL46_FULL_ODDS_19BOOK_RESTORE_PASS
