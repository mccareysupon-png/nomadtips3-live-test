from pathlib import Path
import re

# 1) Expose the already-loaded central board snapshot to presentation-only addons.
bet = Path('nomad-live-343/bet365-board.js')
s = bet.read_text()
old = "    lastSnapshot=j;lastSignals=signals;decorate(j,signals);"
new = "    lastSnapshot=j;lastSignals=signals;decorate(j,signals);\n    window.NOMAD343_BATCH_STATE={snapshot:j,signals};\n    document.dispatchEvent(new CustomEvent('nomad343:batch-board',{detail:window.NOMAD343_BATCH_STATE}));"
assert old in s, 'bet365 board publish anchor missing'
s = s.replace(old, new, 1)
old_start = "function start(){injectStyle();mo.observe(document.body,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_BET365={version:VERSION,reload:load}}"
new_start = "function start(){injectStyle();mo.observe(document.body,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_BET365={version:VERSION,reload:load,get snapshot(){return lastSnapshot},get signals(){return lastSignals}}}"
assert old_start in s, 'bet365 start anchor missing'
s = s.replace(old_start, new_start, 1)
bet.write_text(s)

# 2) Convert the restored Full Market card to a presentation-only consumer of the shared batch.
fom = Path('nomad-live-343/full-odds-main-343.js')
f = fom.read_text()
f = f.replace("const VERSION='343-full-odds-main-v5-ultra-10book';", "const VERSION='343-full-odds-main-v6-shared-batch';", 1)
for line in [
    "const API='/api/full-market/fixture-odds';\n",
    "const FALLBACK_API='/api/engine/fixture-odds';\n",
    "const POLL_MS=15_000;\n",
    "const CACHE_MS=12_000;\n",
]:
    assert line in f, f'missing Full Market constant: {line!r}'
    f = f.replace(line, '', 1)
assert "const cache=new Map(),busy=new Set(),liveSnapshots=new Map();" in f
f = f.replace("const cache=new Map(),busy=new Set(),liveSnapshots=new Map();", "const liveSnapshots=new Map();", 1)

old_source = "function sourceText(payload,books){if(payload?.fallbackOnly)return'BET365 FALLBACK';if(payload?.stale)return`${books.length}/10 BOOKS · STALE CACHE`;return`${books.length}/10 BOOKS · LIVE FEED`}"
new_source = "function sourceText(_payload,books){return`${books.length}/10 BOOKS · SHARED BATCH`}"
assert old_source in f, 'Full Market sourceText anchor missing'
f = f.replace(old_source, new_source, 1)
f = f.replace('Fixed sides: home left · away right · LIVE prices refresh while expanded', 'Fixed sides: home left · away right · shared batch feed · zero per-match API calls')

start = f.index('function loading(card)')
end = f.index('function injectStyle()', start)
replacement = r'''function batchSnapshot(){return window.NOMAD343_BATCH_STATE?.snapshot??window.NOMAD343_BET365?.snapshot??null}
function fixtureFromSnapshot(id){const snap=batchSnapshot(),rows=Array.isArray(snap?.fixtures)?snap.fixtures:[];return rows.find(x=>String(x?.fixtureId??'')===String(id))??null}
function renderFromBatch(card){
  const id=String(card?.dataset?.matchId||'');if(!id)return;
  const fixture=fixtureFromSnapshot(id),host=ensureHost(card);
  if(!host)return;
  if(!fixture){host.innerHTML='<section class="fom-board"><div class="fom-head"><div><b>FULL MARKET · 10 BOOKS</b><small>Waiting for shared batch snapshot</small></div><span class="fom-count muted">ODDS —</span></div></section>';return}
  const payload=fixture?.providerOdds??fixture?.odds??null;
  render(card,payload||{});
}
function afterToggle(card){setTimeout(()=>{if(card?.getAttribute('aria-expanded')==='true')renderFromBatch(card)},0)}
function hydrateAdded(node){if(node?.nodeType!==1)return;if(node.matches?.('.match-card[data-match-id][aria-expanded="true"]'))renderFromBatch(node);node.querySelectorAll?.('.match-card[data-match-id][aria-expanded="true"]').forEach(renderFromBatch)}
function refreshExpanded(){document.querySelectorAll('.match-card[data-match-id][aria-expanded="true"]').forEach(renderFromBatch)}
'''
f = f[:start] + replacement + f[end:]

old_start_block = re.compile(r"function start\(\)\{.*?\n\}\nif\(document\.readyState==='loading'\)", re.S)
new_start_block = r'''function start(){
  injectStyle();
  document.addEventListener('click',e=>{const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const card=e.target.closest('.match-card[data-match-id]');if(card)afterToggle(card)});
  document.addEventListener('nomad343:batch-board',refreshExpanded);
  const mo=new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)hydrateAdded(n)});
  document.querySelectorAll('.match-stack').forEach(root=>mo.observe(root,{childList:true,subtree:true}));
  refreshExpanded();
  window.NOMAD343_FULL_ODDS_MAIN={version:VERSION,books:BOOKS.map(x=>({...x})),reload:id=>{const card=document.querySelector(`.match-card[data-match-id="${CSS.escape(String(id))}"]`);if(card)renderFromBatch(card)},refresh:refreshExpanded};
}
if(document.readyState==='loading')'''
f, n = old_start_block.subn(new_start_block, f, count=1)
assert n == 1, 'Full Market start block not replaced'

for token in ["/api/full-market/", "/fixture-odds", "fetchPayload(", "setInterval(pollExpanded", "visibilitychange", "const API=", "FALLBACK_API"]:
    assert token not in f, f'forbidden Full Market token remains: {token}'
assert 'fetch(' not in f, 'Full Market presentation script must not fetch anything'
assert 'SHARED BATCH' in f and 'zero per-match API calls' in f
fom.write_text(f)

# 3) Put the Full Market card back on Live without restoring any per-fixture backend.
index = Path('nomad-live-343/index.html')
i = index.read_text()
needle = '<script src="bet365-board.js?v=343-b365-v4-market-language&fix=batchrestore2" defer></script>'
insert = needle + '<script src="full-odds-main-343.js?v=343-full-odds-batch-v1" defer></script>'
assert needle in i, 'index bet365 script anchor missing'
assert 'full-odds-main-343.js' not in i, 'Full Market script already present unexpectedly'
i = i.replace(needle, insert, 1)
index.write_text(i)
