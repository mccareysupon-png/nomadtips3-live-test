from pathlib import Path

HUB = Path('workers/nomadtips3-5usd-hub-343/src/index-v2.js')
BOARD = Path('nomad-live-343/bet365-board.js')
INDEX = Path('nomad-live-343/index.html')

# 1) HUB: keep every odds container from the batch and merge non-destructively.
s = HUB.read_text()
anchor = "function kickoffUtc(f){return text(f?.kickoff_utc??f?.kickoffUtc??f?.start_time??f?.kickoff??f?.date??null)}\n"
assert anchor in s, 'hub kickoff anchor missing'
helpers = r'''function kickoffUtc(f){return text(f?.kickoff_utc??f?.kickoffUtc??f?.start_time??f?.kickoff??f?.date??null)}
function plainObject(v){return Boolean(v)&&typeof v==='object'&&!Array.isArray(v)}
function deepKeep(base,extra){
  if(extra===null||extra===undefined)return base;
  if(base===null||base===undefined)return extra;
  if(Array.isArray(base)||Array.isArray(extra))return Array.isArray(extra)&&extra.length?extra:base;
  if(plainObject(base)&&plainObject(extra)){const out={...base};for(const [k,v] of Object.entries(extra))out[k]=deepKeep(out[k],v);return out}
  return extra;
}
function bookmakerKey(v,i=0){return String(v?.id??v?.slug??v?.name??v?.bookmaker?.id??v?.bookmaker?.slug??v?.bookmaker?.name??`#${i}`).toLowerCase().replace(/[\s_-]/g,'')}
function mergeBookmakers(base,extra){
  const out=Array.isArray(base)?base.map(x=>plainObject(x)?{...x}:x):[];
  const pos=new Map(out.map((x,i)=>[bookmakerKey(x,i),i]));
  for(const [i,row] of (Array.isArray(extra)?extra:[]).entries()){
    const key=bookmakerKey(row,i),at=pos.get(key);
    if(at===undefined){pos.set(key,out.length);out.push(row)}else out[at]=deepKeep(out[at],row);
  }
  return out;
}
function providerOddsRaw(f){
  const out={};
  if(f?.bookmakers!==undefined&&f?.bookmakers!==null)out.bookmakers=f.bookmakers;
  if(f?.bet365!==undefined&&f?.bet365!==null)out.bet365=f.bet365;
  if(f?.markets!==undefined&&f?.markets!==null)out.markets=f.markets;
  if(f?.odds!==undefined&&f?.odds!==null)out.odds=f.odds;
  return Object.keys(out).length?out:null;
}
function mergeProviderOdds(base,extra){
  if(!base)return extra;if(!extra)return base;
  const out={...base};
  for(const [k,v] of Object.entries(extra)){
    if(v===null||v===undefined)continue;
    out[k]=k==='bookmakers'&&Array.isArray(v)?mergeBookmakers(out[k],v):deepKeep(out[k],v);
  }
  return out;
}
'''
s = s.replace(anchor, helpers, 1)
old = "providerOdds:f?.odds??f?.bookmakers??f?.markets??f?.bet365??null"
new = "providerOdds:providerOddsRaw(f),providerOddsUpdatedAt:providerOddsRaw(f)?now():null"
assert old in s, 'hub normalize odds anchor missing'
s = s.replace(old, new, 1)
old = "events:extra.events??base.events,providerOdds:extra.providerOdds??base.providerOdds"
new = "events:extra.events??base.events,providerOdds:mergeProviderOdds(base.providerOdds,extra.providerOdds),providerOddsUpdatedAt:extra.providerOdds?(extra.providerOddsUpdatedAt??now()):base.providerOddsUpdatedAt"
assert old in s, 'hub merge odds anchor missing'
s = s.replace(old, new, 1)
HUB.write_text(s)

# 2) Public board: display batch odds only. Never spend a per-fixture request just to open a card.
s = BOARD.read_text()
s = s.replace("const FULL_ODDS_API='/api/engine/fixture-odds';\nconst FULL_ODDS_REFRESH_MS=60_000;\n", "", 1)
s = s.replace("const fullOddsBusy=new Set(),fullOddsCache=new Map(),fullOddsRetryAt=new Map();\n", "", 1)
old = """  if(Array.isArray(raw.bookmakers)){
    const b=raw.bookmakers.find(x=>isBet365(x?.slug)||isBet365(x?.name)||isBet365(x?.bookmaker?.slug)||isBet365(x?.bookmaker?.name));
    return b?.odds??b?.markets??null;
  }
"""
new = """  if(Array.isArray(raw.bookmakers)){
    const b=raw.bookmakers.find(x=>isBet365(x?.slug)||isBet365(x?.name)||isBet365(x?.bookmaker?.slug)||isBet365(x?.bookmaker?.name));
    const x=b?.odds??b?.markets??null;if(x)return x;
  }
  if(raw.bookmakers&&typeof raw.bookmakers==='object'&&!Array.isArray(raw.bookmakers)){const x=oddsRoot(raw.bookmakers);if(x)return x}
"""
assert old in s, 'board bookmaker parser anchor missing'
s = s.replace(old, new, 1)
start = s.index("function oddsPanel(f,snapshot,signalRows=[]){")
end = s.index("function snapshotFixture", start)
assert start >= 0 and end > start, 'board oddsPanel bounds missing'
panel = r'''function oddsPanel(f,snapshot,signalRows=[]){
  const state=classify(f),root=oddsRoot(f?.providerOdds??f?.odds),title=state==='live'?'BET365 · LIVE MARKETS':state==='scheduled'?'BET365 · PRE-MATCH MARKETS':'BET365 · MARKET SNAPSHOT';
  const rows=marketRows(root,f,state),fetchedAt=num(f?.providerOddsUpdatedAt),age=fetchedAt===null?Math.max(0,Math.round(Number(snapshot?.hubAgeMs||0)/1000)):Math.max(0,Math.round((Date.now()-fetchedAt)/1000)),source='5USD batch · round feed',sub=`${teamName(f,'home')} vs ${teamName(f,'away')} · ${source} · ${age}s`,signalHtml=signalEntries(signalRows,f);
  if(!rows.length)return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>${esc(sub)}</small></div><span class="b365-count muted">ODDS —</span></div>${signalHtml}<div class="b365-empty">Odds unavailable in current batch for this fixture</div></section>`;
  const body=rows.map(([,html])=>html).join('');
  return `<section class="b365-board"><div class="b365-head"><div><b>${title}</b><small>${esc(sub)}</small></div><span class="b365-count">${rows.length} MARKETS</span></div>${signalHtml}<div class="b365-grid">${body}</div></section>`;
}
'''
s = s[:start] + panel + s[end:]
start = s.index("function snapshotFixture")
end = s.index("function signalsForFixture", start)
assert start >= 0 and end > start, 'board full-odds block bounds missing'
s = s[:start] + s[end:]
old = "placeAddon(details,wrap);if(card.getAttribute('aria-expanded')==='true')ensureFullOdds(id);"
assert old in s, 'board decorate full odds anchor missing'
s = s.replace(old, "placeAddon(details,wrap);", 1)
start = s.index("function start(){")
end = s.index("if(document.readyState", start)
assert start >= 0 and end > start, 'board start bounds missing'
start_fn = "function start(){injectStyle();mo.observe(document.body,{childList:true,subtree:true});load();setInterval(load,POLL_MS);window.NOMAD343_BET365={version:VERSION,reload:load}}\n"
s = s[:start] + start_fn + s[end:]
assert 'FULL_ODDS_API' not in s and 'ensureFullOdds' not in s and 'fixture-odds' not in s, 'per-fixture public odds call still present'
BOARD.write_text(s)

# 3) UI copy/cache bust.
s = INDEX.read_text()
old_note = 'กดคู่เพื่อดูรายละเอียด · ระบบโหลดราคา Bet365 แบบเต็มเฉพาะคู่ที่เปิด และ cache แยกจาก Engine board เพื่อไม่ให้ราคาหายตอนรอบสแกนใหม่'
new_note = 'กดคู่เพื่อดูรายละเอียด · ราคา PRE-MATCH และราคาไหลใช้ 5USD batch ตามรอบเดียวกับ feed โดยไม่เรียก odds รายคู่เพื่อการแสดงผล'
assert old_note in s, 'index note anchor missing'
s = s.replace(old_note, new_note, 1)
assert 'fix=oddspersist3' in s, 'index cache anchor missing'
s = s.replace('fix=oddspersist3', 'fix=oddsbatch1', 1)
INDEX.write_text(s)
