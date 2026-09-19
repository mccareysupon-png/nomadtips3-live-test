from pathlib import Path

P=Path('workers/nomadtips3-engine-343/src/index.js')
s=P.read_text(encoding='utf-8')
original=s

def one(old,new,label):
    global s
    n=s.count(old)
    if n!=1:
        raise SystemExit(f'{label}: expected 1 anchor, found {n}')
    s=s.replace(old,new,1)

one("import { MARKET_RULES, MARKET_KEYS, cardPointsPair, gapPass, lineGap, settleMarketSignal } from './market-core.js';\n",
    "import { MARKET_RULES, MARKET_KEYS, cardPointsPair, gapPass, lineGap, settleMarketSignal } from './market-core.js';\nimport { CEO_STRATEGY, CEO_VERSION, CEO_PRICE_SETTINGS, ceoCandidatesForFixture, ceoPostPricePass } from './ceo-condition.js';\n",
    'CEO import')
one("const VERSION='nomad343-engine-v5-multibook-referee-bestprice';",
    "const VERSION='nomad343-engine-v6-ceo-auto-v1';",
    'engine version')
one("function sanitizeRun(raw={}){const src=migrateLegacyRun(raw);return Object.fromEntries(MARKET_KEYS.map(k=>[k,Boolean(src[k]??DEFAULT_RUN[k])]))}\n",
    "function sanitizeRun(raw={}){const src=migrateLegacyRun(raw);return Object.fromEntries(MARKET_KEYS.map(k=>[k,Boolean(src[k]??DEFAULT_RUN[k])]))}\nfunction strategyOf(v){return String(v?.strategy||'OWNER').toUpperCase()===CEO_STRATEGY?CEO_STRATEGY:'OWNER'}\n",
    'strategy helper')
one("const histories={},board=[],seen=new Set(signals.map(s=>`${s.fixtureId}:${s.market}`));const at=Number(hub.fetchedAt||now());",
    "const histories={},board=[],seen=new Set(signals.map(s=>`${s.fixtureId}:${s.market}:${strategyOf(s)}`));const at=Number(hub.fetchedAt||now());",
    'strategy seen')
one("if(seen.has(`${id}:${key}`)){analysis[key]={state:'LOCKED'};continue}",
    "if(seen.has(`${id}:${key}:OWNER`)){analysis[key]={state:'LOCKED'};continue}",
    'owner lock')
one("          if(marketCandidates.length)fixtureCandidates.push({fixture:f,candidates:marketCandidates,maxStrength:Math.max(...marketCandidates.map(c=>c.strength))});\n",
    "          const ceoCandidates=ceoCandidatesForFixture(f,histories[id]||[],MARKET_KEYS).filter(c=>!seen.has(`${id}:${c.market}:${CEO_STRATEGY}`));\n          if(ceoCandidates.length)marketCandidates.push(...ceoCandidates);\n          if(marketCandidates.length){const ownerCandidates=marketCandidates.filter(c=>strategyOf(c)==='OWNER');fixtureCandidates.push({fixture:f,candidates:marketCandidates,hasOwner:ownerCandidates.length>0,ownerStrength:ownerCandidates.length?Math.max(...ownerCandidates.map(c=>c.strength)):-1,maxStrength:Math.max(...marketCandidates.map(c=>c.strength))});}\n",
    'CEO candidate injection')
one("fixtureCandidates.sort((a,b)=>b.maxStrength-a.maxStrength);const backfill=board.filter",
    "fixtureCandidates.sort((a,b)=>Number(b.hasOwner)-Number(a.hasOwner)||(a.hasOwner?b.ownerStrength-a.ownerStrength:b.maxStrength-a.maxStrength));const backfill=board.filter",
    'owner priority')
one("if(b)for(const c of item.candidates)b.analysis[c.market]={state:'QUEUED_PRICE_REFEREE'};",
    "if(b)for(const c of item.candidates)if(strategyOf(c)==='OWNER')b.analysis[c.market]={state:'QUEUED_PRICE_REFEREE'};",
    'queued owner analysis')
one("if(b)for(const c of item.candidates)b.analysis[c.market]={state:'PRICE_REFEREE_ERROR'};continue}",
    "if(b)for(const c of item.candidates)if(strategyOf(c)==='OWNER')b.analysis[c.market]={state:'PRICE_REFEREE_ERROR'};continue}",
    'error owner analysis')
one("        const grouped=new Map();for(const c of item.candidates){if(!grouped.has(c.market))grouped.set(c.market,[]);grouped.get(c.market).push(c)}\n        for(const [key,cands] of grouped){const best=pickBestPriced(cands,root,f,settings);const b=board.find(x=>String(x.fixtureId)===id);if(!best){if(b)b.analysis[key]={state:'NO_PRICE_PASS'};continue}\n",
    "        const grouped=new Map();for(const c of item.candidates){const groupKey=`${strategyOf(c)}:${c.market}`;if(!grouped.has(groupKey))grouped.set(groupKey,[]);grouped.get(groupKey).push(c)}\n        for(const [groupKey,cands] of grouped){const split=groupKey.indexOf(':'),strategy=groupKey.slice(0,split),key=groupKey.slice(split+1),priceSettings=strategy===CEO_STRATEGY?CEO_PRICE_SETTINGS:settings;const best=pickBestPriced(cands,root,f,priceSettings);const b=board.find(x=>String(x.fixtureId)===id);if(!best){if(b&&strategy==='OWNER')b.analysis[key]={state:'NO_PRICE_PASS'};continue}\n          let ceoPriceGate=null;if(strategy===CEO_STRATEGY){ceoPriceGate=ceoPostPricePass(best);if(!ceoPriceGate.pass)continue}\n",
    'strategy referee grouping')
one("const sig={id:`${id}-${key}-${now().toString(36)}`,fixtureId:id,league:f.league,home:f.home,away:f.away,market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,",
    "const sig={id:`${id}-${key}-${strategy.toLowerCase()}-${now().toString(36)}`,fixtureId:id,league:f.league,home:f.home,away:f.away,strategy,strategyVersion:strategy===CEO_STRATEGY?CEO_VERSION:'OWNER_CURRENT',ceoScore:strategy===CEO_STRATEGY?best.ceoScore:null,ceoReasonCodes:strategy===CEO_STRATEGY?(best.reasonCodes||best.evidence?.reasonCodes||[]):[],ceoPriceGate:strategy===CEO_STRATEGY?ceoPriceGate:null,market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,",
    'signal strategy metadata')
one("signals.push(sig);seen.add(`${id}:${key}`);if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,bookmaker:best.bookmaker,referee:best.referee,evidence:best.evidence};",
    "signals.push(sig);seen.add(`${id}:${key}:${strategy}`);if(b&&strategy==='OWNER')b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,bookmaker:best.bookmaker,referee:best.referee,evidence:best.evidence};",
    'signal strategy lock')

if s==original:
    raise SystemExit('no changes')
P.write_text(s,encoding='utf-8')
print('CEO_V1_PATCH_PASS')
