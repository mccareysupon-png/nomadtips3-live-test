#!/usr/bin/env bash
set -euo pipefail
OUT="audit/ball46-jersey-slot-readonly-20261004"
mkdir -p "$OUT/assets"
ORIGIN="https://ball46-production.mccarey-supon.workers.dev"
FILES=(index.html dashboard-v2-stage3.js team-kits-343.js team-sides-343.js expanded-match-343.js ui-sync-fixes-343-v2.js)
for f in "${FILES[@]}"; do
  code=$(curl -L -sS -o "$OUT/assets/$f" -w '%{http_code}' "$ORIGIN/$f")
  printf '%s\t%s\t%s\n' "$f" "$code" "$(sha256sum "$OUT/assets/$f" | awk '{print $1}')" >> "$OUT/fetch.tsv"
  test "$code" = "200"
done
{
  echo '# Ball46 current Production jersey insertion audit'
  date -u '+audited_utc=%Y-%m-%dT%H:%M:%SZ'
  echo "origin=$ORIGIN"
  echo
  for f in "${FILES[@]}"; do
    echo "===== $f ====="
    grep -nEi -C 3 'team-name|home.?team|away.?team|data-k=.home|data-k=.away|match-card|team-kits|jersey|shirt|kit|homeName|awayName|home\.name|away\.name' "$OUT/assets/$f" || true
    echo
  done
} > "$OUT/snippets.txt"
node <<'NODE'
const fs=require('fs');
const dir='audit/ball46-jersey-slot-readonly-20261004/assets';
const files=['index.html','dashboard-v2-stage3.js','team-kits-343.js','team-sides-343.js','expanded-match-343.js','ui-sync-fixes-343-v2.js'];
const patterns=[/team-name/ig,/match-card/ig,/homeJersey/ig,/awayJersey/ig,/homeTeam/ig,/awayTeam/ig,/jersey/ig,/shirt/ig,/team-kits/ig];
const summary={};
for(const f of files){
  const text=fs.readFileSync(`${dir}/${f}`,'utf8');
  const lines=text.split(/\r?\n/);
  summary[f]={lines:lines.length,matches:[]};
  lines.forEach((line,i)=>{
    if(patterns.some(re=>{re.lastIndex=0;return re.test(line)})) summary[f].matches.push({line:i+1,text:line.slice(0,500)});
  });
}
fs.writeFileSync('audit/ball46-jersey-slot-readonly-20261004/summary.json',JSON.stringify(summary,null,2));
NODE
