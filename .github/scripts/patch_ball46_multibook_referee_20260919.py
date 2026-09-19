from pathlib import Path
import re

p=Path('workers/nomadtips3-engine-343/src/index.js')
s=p.read_text()
s=s.replace("const VERSION='nomad343-engine-v4-autonomous-settlement';","const VERSION='nomad343-engine-v5-multibook-referee-bestprice';")

pat=r"function oddsRoot\(payload\)\{.*?\n\}\nfunction storedFixture"
new=r'''const REFEREE_ANCHORS=new Set(['pinnacle','bet365','1xbet']);
function bookKey(row){return String(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??'').toLowerCase().replace(/[\s_-]/g,'')}
function bookName(row){return String(row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??'Bookmaker').trim()||'Bookmaker'}
function extractBookRoots(payload){
  const full=payload?.fullOdds??payload?.data??payload;
  const raw=Array.isArray(full?.bookmakers)?full.bookmakers:Array.isArray(full?.data?.bookmakers)?full.data.bookmakers:[];
  const out=[];
  for(const row of raw){const root=row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??null;if(root&&typeof root==='object'&&!Array.isArray(root))out.push({slug:bookKey(row),name:bookName(row),root})}
  if(out.length)return out;
  const root=full?.odds??full?.markets??full;
  return root&&typeof root==='object'&&!Array.isArray(root)?[{slug:'bet365',name:'Bet365',root}]:[];
}
function findMarket(root,def){if(!root||typeof root!=='object')return null;for(const k of def.aliases||[]){if(root[k]!==undefined&&root[k]!==null)return root[k]}return null}
function stageValue(market,stage){if(!market||typeof market!=='object')return null;return market[stage]??(stage==='inplay'?market.in_play??market.live:null)??null}
function stageSnapshot(root,def,stage){const v=stageValue(findMarket(root,def),stage);return v&&typeof v==='object'?clone(v):v??null}
function priceFor(root,key,selection){
  const def=MARKET_RULES[key],stage=stageValue(findMarket(root,def),'inplay');if(!stage||typeof stage!=='object')return null;
  const sel=String(selection).toUpperCase();
  if(def.kind==='1X2'){const odds=num(stage[sel.toLowerCase()]);return odds===null?null:{line:null,providerLine:null,odds}}
  if(def.kind==='BTTS'){const odds=num(stage[sel.toLowerCase()]);return odds===null?null:{line:null,providerLine:null,odds}}
  const providerLine=num(stage.line);if(providerLine===null)return null;
  if(def.kind==='AH'){
    const odds=num(sel==='HOME'?stage.home:stage.away);if(odds===null)return null;
    return {line:sel==='HOME'?providerLine:-providerLine,providerLine,providerLineSide:'HOME',odds};
  }
  const odds=num(sel==='OVER'?stage.over:stage.under);return odds===null?null:{line:providerLine,providerLine,odds};
}
function pricePass(key,cfg,price,f){
  const def=MARKET_RULES[key];if(!price||price.odds<Number(cfg.oddsMin)||price.odds>Number(cfg.oddsMax))return false;
  if(def.kind==='AH'){if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;if(num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false}
  if(def.kind==='OU'){
    if(price.line===null)return false;if(num(cfg.lineMin)!==null&&price.line<Number(cfg.lineMin))return false;
    if(def.selection==='UNDER'&&num(cfg.lineMax)!==null&&price.line>Number(cfg.lineMax))return false;
    if(def.gap){const total=currentBasisTotal(f,def.basis);if(!gapPass(price.line,total,cfg.lineGapMax))return false}
  }
  return true;
}
async function fetchFullOdds(fixtureId,env){
  if(env.FULL_MARKET){
    try{
      const r=await env.FULL_MARKET.fetch(`https://full-market.internal/fixture-odds?fixtureId=${encodeURIComponent(fixtureId)}`);
      const j=await r.json().catch(()=>null);
      if(r.ok&&j?.ok===true&&j?.fullOdds&&typeof j.fullOdds==='object')return j.fullOdds;
      if(!r.ok){const e=new Error(`FULL_MARKET_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(j?.retryAfterSec??r.headers.get('retry-after'));throw e}
    }catch(e){if(!env.FIVEDOLLAR_API_KEY)throw e}
  }
  if(!env.FIVEDOLLAR_API_KEY)throw new Error('FIVEDOLLAR_API_KEY_MISSING');
  const r=await fetch(`${API_BASE}/fixtures/${encodeURIComponent(fixtureId)}/odds?bookmakers=bet365`,{cache:'no-store',headers:{accept:'application/json',authorization:`Bearer ${env.FIVEDOLLAR_API_KEY}`}});const raw=await r.text();let j=null;try{j=JSON.parse(raw)}catch{}
  if(!r.ok){const e=new Error(`5USD_ODDS_HTTP_${r.status}`);e.status=r.status;e.retryAfter=num(r.headers.get('retry-after'));throw e}
  const full=j?.data??j;if(!full||typeof full!=='object')throw new Error('5USD_ODDS_SHAPE');return full;
}
function dominantLineOffers(offers,def){
  if(def.kind==='1X2'||def.kind==='BTTS')return offers;
  const groups=new Map();
  for(const o of offers){const n=num(o?.price?.line);if(n===null)continue;const k=(Math.round(n*1000)/1000).toFixed(3);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o)}
  const ranked=[...groups.entries()].map(([line,rows])=>({line:Number(line),rows,anchors:rows.filter(x=>REFEREE_ANCHORS.has(x.bookSlug)).length,bestOdds:Math.max(...rows.map(x=>Number(x.price.odds)||0))})).sort((a,b)=>b.rows.length-a.rows.length||b.anchors-a.anchors||b.bestOdds-a.bestOdds);
  return ranked[0]?.rows||[];
}
function pickBestPriced(candidates,fullOdds,f,settings){
  const books=extractBookRoots(fullOdds),passed=[];
  for(const c of candidates){
    const cfg=settings[c.market],def=MARKET_RULES[c.market],offers=[];
    for(const book of books){const price=priceFor(book.root,c.market,c.selection);if(!pricePass(c.market,cfg,price,f))continue;offers.push({bookmaker:book.name,bookSlug:book.slug,bookRoot:book.root,price})}
    if(!offers.length)continue;
    const consensus=dominantLineOffers(offers,def);if(!consensus.length)continue;
    consensus.sort((a,b)=>Number(b.price.odds)-Number(a.price.odds));const chosen=consensus[0];
    const referee={mode:'MULTI_BOOK_BEST_PRICE_SOFT_CONSENSUS',availableBookmakers:books.length,validOffers:offers.length,consensusOffers:consensus.length,agreementPct:offers.length?Math.round(consensus.length/offers.length*1000)/10:0,consensusLine:chosen.price.line,selectedBookmaker:chosen.bookmaker,selectedOdds:chosen.price.odds,offers:offers.map(o=>({bookmaker:o.bookmaker,line:o.price.line,odds:o.price.odds}))};
    passed.push({...c,price:chosen.price,bookmaker:chosen.bookmaker,bookSlug:chosen.bookSlug,bookRoot:chosen.bookRoot,referee});
  }
  passed.sort((a,b)=>b.strength-a.strength||b.referee.consensusOffers-a.referee.consensusOffers||Number(b.price.odds)-Number(a.price.odds));return passed[0]||null;
}
function storedFixture'''
s2,n=re.subn(pat,new,s,flags=re.S)
if n!=1: raise SystemExit(f'REFEREE_BLOCK_REPLACE_FAIL:{n}')
s=s2

s=s.replace("const def=MARKET_RULES[key],price=best.price,historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:'Bet365',observedAt:now()};",
            "const def=MARKET_RULES[key],price=best.price,historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:best.bookmaker,observedAt:now()};")
s=s.replace("odds:price.odds,bookmaker:'Bet365',priceStage:'inplay',priceSource:'fixture-odds',openingPrice:stageSnapshot(root,def,'opening'),closingPrice:stageSnapshot(root,def,'closing'),inplayPrice:stageSnapshot(root,def,'inplay'),",
            "odds:price.odds,bookmaker:best.bookmaker,priceStage:'inplay',priceSource:'multi-book-referee',openingPrice:stageSnapshot(best.bookRoot,def,'opening'),closingPrice:stageSnapshot(best.bookRoot,def,'closing'),inplayPrice:stageSnapshot(best.bookRoot,def,'inplay'),referee:best.referee,")
s=s.replace("if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,evidence:best.evidence};",
            "if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,bookmaker:best.bookmaker,referee:best.referee,evidence:best.evidence};")
s=s.replace("fullOddsSource:keepFullOdds?'ENGINE_REFEREE':null","fullOddsSource:keepFullOdds?'ENGINE_MULTI_BOOK_REFEREE':null")
s=s.replace("b.fullOddsSource='ENGINE_REFEREE_BACKFILL'","b.fullOddsSource='ENGINE_MULTI_BOOK_REFEREE_BACKFILL'")
s=s.replace("fullOddsBoardRow.fullOddsSource='ENGINE_REFEREE'","fullOddsBoardRow.fullOddsSource='ENGINE_MULTI_BOOK_REFEREE'")

required=["nomad343-engine-v5-multibook-referee-bestprice","MULTI_BOOK_BEST_PRICE_SOFT_CONSENSUS","best.bookmaker","best.bookRoot","env.FULL_MARKET"]
for token in required:
  if token not in s: raise SystemExit('MISSING:'+token)
p.write_text(s)

w=Path('workers/nomadtips3-engine-343/wrangler.toml')
ws=w.read_text()
block='''\n[[services]]\nbinding = "FULL_MARKET"\nservice = "nomadtips3-full-market-343-ball46"\n'''
if 'binding = "FULL_MARKET"' not in ws:
  anchor='''[[services]]\nbinding = "HUB"\nservice = "nomadtips3-5usd-hub-343"\n'''
  if anchor not in ws: raise SystemExit('HUB_BINDING_ANCHOR_MISSING')
  ws=ws.replace(anchor,anchor+block)
w.write_text(ws)
print('MULTIBOOK_REFEREE_PATCH_PASS')
