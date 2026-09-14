from pathlib import Path

p=Path('workers/nomadtips3-engine-343/src/index.js')
s=p.read_text()

if "const REFEREE_BOOKS=Object.freeze([" in s:
    print('10-book referee patch already present')
    raise SystemExit(0)

def rep(old,new,label):
    global s
    if s.count(old)!=1:
        raise SystemExit(f'{label}: expected exactly one match, got {s.count(old)}')
    s=s.replace(old,new,1)

rep("const VERSION='nomad343-engine-v3-settlement-safe';",
    "const VERSION='nomad343-engine-v4-10book-referee';",
    'version')

rep("const SETTLEMENT_REVISION='bet365-rules-v2';\n",
"""const SETTLEMENT_REVISION='bet365-rules-v2';
const REFEREE_BOOKS=Object.freeze([
  {slug:'bet365',name:'Bet365'},
  {slug:'pinnacle',name:'Pinnacle'},
  {slug:'crown',name:'Crown'},
  {slug:'1xbet',name:'1xBet'},
  {slug:'12bet',name:'12Bet'},
  {slug:'interwetten',name:'Interwetten'},
  {slug:'macauslot',name:'Macau Slot'},
  {slug:'18bet',name:'18Bet'},
  {slug:'vcbet',name:'VCBet'},
  {slug:'easybets',name:'Easybets'}
]);
const REFEREE_BOOK_QUERY=REFEREE_BOOKS.map(x=>x.slug).join(',');
""",
    'book registry')

rep("function oddsRoot(payload){\n  const books=payload?.data?.bookmakers??payload?.bookmakers;if(Array.isArray(books)){const b=books.find(x=>String(x?.slug??x?.name??'').toLowerCase().replace(/[\\s_-]/g,'').includes('bet365'));if(b?.odds)return b.odds}\n  return payload?.data?.odds??payload?.odds??payload?.data??null;\n}\n",
"""function normBook(v){return String(v??'').toLowerCase().replace(/[\\s_-]/g,'')}
function bookmakerRows(payload){
  const roots=[payload?.data,payload,payload?.data?.odds,payload?.odds].filter(Boolean);
  for(const root of roots){if(Array.isArray(root?.bookmakers))return root.bookmakers;if(Array.isArray(root))return root}
  return [];
}
function bookmakerKey(row){return normBook(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name)}
function bookmakerOdds(row){const root=row?.odds??row?.bookmaker?.odds??null;return root&&typeof root==='object'?root:null}
function oddsRoot(payload){
  const books=bookmakerRows(payload);if(books.length){const b=books.find(x=>bookmakerKey(x).includes('bet365'));const root=bookmakerOdds(b);if(root)return root}
  return payload?.data?.odds??payload?.odds??payload?.data??null;
}
function refereeBooks(payload){
  const rows=bookmakerRows(payload),out=[];
  for(const def of REFEREE_BOOKS){
    const target=normBook(def.slug),row=rows.find(x=>{const key=bookmakerKey(x);return key===target||key.includes(target)||target.includes(key)}),root=bookmakerOdds(row);
    if(root)out.push({...def,root});
  }
  return out;
}
""",
    'bookmaker parser')

rep("function pricePass(key,cfg,price,f){\n  const def=MARKET_RULES[key];if(!price||price.odds<Number(cfg.oddsMin)||price.odds>Number(cfg.oddsMax))return false;\n  if(def.kind==='AH'){if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;if(num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false}\n  if(def.kind==='OU'){\n    if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;\n    if(def.selection==='UNDER'&&num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false;\n    if(def.gap){const total=currentBasisTotal(f,def.basis);if(!gapPass(price.line,total,cfg.lineGapMax))return false}\n  }\n  return true;\n}\n",
"""function linePass(key,cfg,price,f){
  const def=MARKET_RULES[key];if(!price)return false;
  if(def.kind==='AH'){if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;if(num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false}
  if(def.kind==='OU'){
    if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;
    if(def.selection==='UNDER'&&num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false;
    if(def.gap){const total=currentBasisTotal(f,def.basis);if(!gapPass(price.line,total,cfg.lineGapMax))return false}
  }
  return true;
}
function pricePass(key,cfg,price,f){return linePass(key,cfg,price,f)&&price.odds>=Number(cfg.oddsMin)&&price.odds<=Number(cfg.oddsMax)}
function sameLine(a,b){const x=num(a),y=num(b);if(x===null||y===null)return x===y;return Math.abs(x-y)<1e-9}
""",
    'line gate')

old_fetch="""async function fetchFullOdds(fixtureId,env){
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=bet365`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
  if(!r.ok){const e=new Error(`5USD_ODDS_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(r.headers.get('retry-after'));throw e}const root=oddsRoot(j);if(!root)throw new Error('5USD_ODDS_SHAPE');return root;
}
function pickBestPriced(candidates,root,f,settings){
  const passed=[];for(const c of candidates){const price=priceFor(root,c.market,c.selection),cfg=settings[c.market];if(!pricePass(c.market,cfg,price,f))continue;passed.push({...c,price})}
  passed.sort((a,b)=>b.strength-a.strength||a.price.odds-b.price.odds);return passed[0]||null;
}
"""
new_fetch="""async function fetchFullOdds(fixtureId,env){
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=bet365`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
  if(!r.ok){const e=new Error(`5USD_ODDS_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(r.headers.get('retry-after'));throw e}const root=oddsRoot(j);if(!root)throw new Error('5USD_ODDS_SHAPE');return root;
}
async function fetchRefereeOdds(fixtureId,env){
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=${encodeURIComponent(REFEREE_BOOK_QUERY)}`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
  if(!r.ok){const e=new Error(`5USD_ODDS_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(r.headers.get('retry-after'));throw e}
  const books=refereeBooks(j),bet365=books.find(x=>x.slug==='bet365'),bet365Root=bet365?.root??oddsRoot(j);if(!bet365Root)throw new Error('5USD_ODDS_SHAPE');
  return {bet365Root,books:books.length?books:[{slug:'bet365',name:'Bet365',root:bet365Root}]};
}
function bestBookPriceForCandidate(c,referee,f,settings){
  const cfg=settings[c.market],authority=priceFor(referee.bet365Root,c.market,c.selection);if(!linePass(c.market,cfg,authority,f))return null;
  const def=MARKET_RULES[c.market],choices=[];
  for(const book of referee.books){
    const price=priceFor(book.root,c.market,c.selection);if(!price)continue;
    if((def.kind==='AH'||def.kind==='OU')&&!sameLine(price.line,authority.line))continue;
    if(!pricePass(c.market,cfg,price,f))continue;
    choices.push({bookmaker:book.name,bookmakerSlug:book.slug,price,priceRoot:book.root});
  }
  choices.sort((a,b)=>b.price.odds-a.price.odds);return choices[0]||null;
}
function pickBestPriced(candidates,referee,f,settings){
  const passed=[];for(const c of candidates){const chosen=bestBookPriceForCandidate(c,referee,f,settings);if(!chosen)continue;passed.push({...c,...chosen})}
  passed.sort((a,b)=>b.strength-a.strength);return passed[0]||null;
}
"""
rep(old_fetch,new_fetch,'referee fetch and selector')

rep("const f=item.fixture,id=String(f.fixtureId);let root=null;try{root=await fetchFullOdds(id,this.env);refereeRequests++}catch(e){refereeErrors.push({fixtureId:id,error:String(e?.message||e)});const b=board.find(x=>String(x.fixtureId)===id);if(b)for(const c of item.candidates)b.analysis[c.market]={state:'PRICE_REFEREE_ERROR'};continue}\n        const fullOddsBoardRow=board.find(x=>String(x.fixtureId)===id);if(fullOddsBoardRow){fullOddsBoardRow.fullOdds=clone(root);fullOddsBoardRow.fullOddsFetchedAt=now();fullOddsBoardRow.fullOddsSource='ENGINE_REFEREE'}\n        const grouped=new Map();for(const c of item.candidates){if(!grouped.has(c.market))grouped.set(c.market,[]);grouped.get(c.market).push(c)}\n        for(const [key,cands] of grouped){const best=pickBestPriced(cands,root,f,settings);",
"const f=item.fixture,id=String(f.fixtureId);let referee=null;try{referee=await fetchRefereeOdds(id,this.env);refereeRequests++}catch(e){refereeErrors.push({fixtureId:id,error:String(e?.message||e)});const b=board.find(x=>String(x.fixtureId)===id);if(b)for(const c of item.candidates)b.analysis[c.market]={state:'PRICE_REFEREE_ERROR'};continue}\n        const fullOddsBoardRow=board.find(x=>String(x.fixtureId)===id);if(fullOddsBoardRow){fullOddsBoardRow.fullOdds=clone(referee.bet365Root);fullOddsBoardRow.fullOddsFetchedAt=now();fullOddsBoardRow.fullOddsSource='ENGINE_REFEREE'}\n        const grouped=new Map();for(const c of item.candidates){if(!grouped.has(c.market))grouped.set(c.market,[]);grouped.get(c.market).push(c)}\n        for(const [key,cands] of grouped){const best=pickBestPriced(cands,referee,f,settings);",
    'selected referee call')

rep("const def=MARKET_RULES[key],price=best.price,historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:'Bet365',observedAt:now()};\n          const sig={id:`${id}-${key}-${now().toString(36)}`,fixtureId:id,league:f.league,home:f.home,away:f.away,market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,line:price.line,selectionLine:price.line,providerLine:price.providerLine,providerLineSide:price.providerLineSide??null,odds:price.odds,bookmaker:'Bet365',priceStage:'inplay',priceSource:'fixture-odds',openingPrice:stageSnapshot(root,def,'opening'),closingPrice:stageSnapshot(root,def,'closing'),inplayPrice:stageSnapshot(root,def,'inplay'),createdAt:now(),",
"const def=MARKET_RULES[key],price=best.price,historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:best.bookmaker,observedAt:now()};\n          const sig={id:`${id}-${key}-${now().toString(36)}`,fixtureId:id,league:f.league,home:f.home,away:f.away,market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,line:price.line,selectionLine:price.line,providerLine:price.providerLine,providerLineSide:price.providerLineSide??null,odds:price.odds,bookmaker:best.bookmaker,priceStage:'inplay',priceSource:'fixture-odds',openingPrice:stageSnapshot(best.priceRoot,def,'opening'),closingPrice:stageSnapshot(best.priceRoot,def,'closing'),inplayPrice:stageSnapshot(best.priceRoot,def,'inplay'),createdAt:now(),",
    'signal bookmaker')

rep("if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,evidence:best.evidence};",
    "if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,bookmaker:best.bookmaker,evidence:best.evidence};",
    'analysis bookmaker')

rep("referee:{maxFixturesPerScan:MAX_ODDS_FIXTURES_PER_SCAN,requests:refereeRequests,queued:Math.max(0,fixtureCandidates.length-selected.length),errors:refereeErrors}",
    "referee:{bookmakersRequested:REFEREE_BOOKS.length,canonicalBookmakers:REFEREE_BOOKS.map(x=>x.name),maxFixturesPerScan:MAX_ODDS_FIXTURES_PER_SCAN,requests:refereeRequests,queued:Math.max(0,fixtureCandidates.length-selected.length),errors:refereeErrors}",
    'referee telemetry')

assert "const MAX_ODDS_FIXTURES_PER_SCAN=4;" in s
assert "const MIN_SCAN_GAP_MS=60_000;" in s
assert "bookmakers=${encodeURIComponent(REFEREE_BOOK_QUERY)}" in s
assert "passed.sort((a,b)=>b.strength-a.strength);" in s
assert "bookmaker:best.bookmaker" in s

p.write_text(s)
print('patched',p)
