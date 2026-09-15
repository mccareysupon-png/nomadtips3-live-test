from pathlib import Path
import re

engine = Path('workers/nomadtips3-engine-343/src/index.js')
s = engine.read_text()

for line in [
    "const API_BASE='https://api.5dollarfootballapi.com/v1';\n",
    "const MAX_ODDS_FIXTURES_PER_SCAN=4;\n",
    "const UI_ODDS_CACHE_MS=60_000;\n",
    "const UI_ODDS_STALE_MS=15*60_000;\n",
]:
    assert line in s, f'missing engine constant: {line!r}'
    s = s.replace(line, '', 1)

s, n = re.subn(
    r"async function fetchFullOdds\(fixtureId,env\)\{.*?\n\}\n(?=function pickBestPriced)",
    "",
    s,
    count=1,
    flags=re.S,
)
assert n == 1, 'fetchFullOdds block not removed'

old_setup = "const settings=await this.readSettings(),run=await this.readRun(),oldHist=await this.ctx.storage.get('histories')||{},signals=await this.ctx.storage.get('signals')||[],prevBoard=await this.ctx.storage.get('board')||{};\n      const prevById=new Map((Array.isArray(prevBoard?.fixtures)?prevBoard.fixtures:[]).map(x=>[String(x?.fixtureId??''),x]));\n      const pendingFixtureIds=new Set(signals.filter(s=>s.status==='PENDING').map(s=>String(s.fixtureId)));"
new_setup = "const settings=await this.readSettings(),run=await this.readRun(),oldHist=await this.ctx.storage.get('histories')||{},signals=await this.ctx.storage.get('signals')||[];"
assert old_setup in s, 'legacy per-fixture scan setup not found'
s = s.replace(old_setup, new_setup, 1)

start = s.index('      const fixtureCandidates=[];')
end = s.index('      let reconciled=0;', start)
replacement = '''      const fixtureCandidates=[];
      for(const f of hub.fixtures||[]){
        const analysis={};if(isLive(f)){
          const id=String(f.fixtureId),marketCandidates=[];
          for(const key of MARKET_KEYS){
            if(!run[key]){analysis[key]={state:'STOP'};continue}
            if(seen.has(`${id}:${key}`)){analysis[key]={state:'LOCKED'};continue}
            const pre=preCandidatesForRule(key,f,histories[id]||[],settings[key]);analysis[key]={state:pre.state};if(pre.candidates.length)marketCandidates.push(...pre.candidates);
          }
          if(marketCandidates.length)fixtureCandidates.push({fixture:f,candidates:marketCandidates,maxStrength:Math.max(...marketCandidates.map(c=>c.strength))});
        }
        board.push({...f,analysis});
      }
      fixtureCandidates.sort((a,b)=>b.maxStrength-a.maxStrength);
      let refereeRequests=0,refereeErrors=[];
      for(const item of fixtureCandidates){
        const f=item.fixture,id=String(f.fixtureId),root=oddsRoot(f?.providerOdds??f?.odds),b=board.find(x=>String(x.fixtureId)===id);
        if(!root){
          refereeErrors.push({fixtureId:id,error:'BATCH_ODDS_UNAVAILABLE',source:'HUB_BATCH_ODDS'});
          if(b)for(const c of item.candidates)b.analysis[c.market]={state:'PRICE_BATCH_UNAVAILABLE'};
          continue;
        }
        if(b){b.fullOdds=clone(root);b.fullOddsFetchedAt=num(f?.providerOddsUpdatedAt)??at;b.fullOddsSource='HUB_BATCH_ODDS'}
        const grouped=new Map();for(const c of item.candidates){if(!grouped.has(c.market))grouped.set(c.market,[]);grouped.get(c.market).push(c)}
        for(const [key,cands] of grouped){const best=pickBestPriced(cands,root,f,settings);if(!best){if(b)b.analysis[key]={state:'NO_PRICE_PASS'};continue}
          const def=MARKET_RULES[key],price=best.price,historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:'Bet365',observedAt:now()};
          const sig={id:`${id}-${key}-${now().toString(36)}`,fixtureId:id,league:f.league,home:f.home,away:f.away,market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,line:price.line,selectionLine:price.line,providerLine:price.providerLine,providerLineSide:price.providerLineSide??null,odds:price.odds,bookmaker:'Bet365',priceStage:'inplay',priceSource:'hub-batch',openingPrice:stageSnapshot(root,def,'opening'),closingPrice:stageSnapshot(root,def,'closing'),inplayPrice:stageSnapshot(root,def,'inplay'),createdAt:now(),entryMinute:num(f.minute),minute:num(f.minute),entryScore:clone(f.goals),scoreAt:clone(f.goals),entryCorners:clone(f.corners),entryCards:clone(f.cards),entryStats:clone(f.statistics),statisticsAtEntry:clone(f.statistics),eventHistory:Array.isArray(f.events)?clone(f.events):[],bookmakerHistory:[historyPoint],evidence:best.evidence,rolling:best.rolling,status:'PENDING',result:null,finalScore:null,finalCorners:null,finalCards:null,settlementBasis:def.basis||'goals',settlementRevision:SETTLEMENT_REVISION,lineGap:def.gap?lineGap(price.line,currentBasisTotal(f,def.basis)):null};
          signals.push(sig);seen.add(`${id}:${key}`);if(b)b.analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,evidence:best.evidence};
        }
      }
'''
s = s[:start] + replacement + s[end:]

old_store = "referee:{maxFixturesPerScan:MAX_ODDS_FIXTURES_PER_SCAN,requests:refereeRequests,queued:Math.max(0,fixtureCandidates.length-selected.length),errors:refereeErrors}"
new_store = "referee:{mode:'HUB_BATCH_ODDS',externalRequests:0,requests:refereeRequests,processed:fixtureCandidates.length,queued:0,errors:refereeErrors}"
assert old_store in s, 'old referee metadata not found'
s = s.replace(old_store, new_store, 1)
old_meta = "refereeRequests,refereeQueued:Math.max(0,fixtureCandidates.length-selected.length),lastError:null"
new_meta = "refereeRequests,refereeQueued:0,lastError:null"
assert old_meta in s, 'old referee meta queue not found'
s = s.replace(old_meta, new_meta, 1)

route_pattern = re.compile(
    r"    const u=new URL\(request\.url\);if\(!\['/settings','/registry','/fixture-odds'\]\.includes\(u\.pathname\)\)await this\.scanIfDue\(\);\n"
    r"    if\(u\.pathname==='/fixture-odds'&&request\.method==='GET'\)\{.*?\n    \}\n"
    r"    if\(u\.pathname==='/health'\)",
    re.S,
)
s, n = route_pattern.subn(
    "    const u=new URL(request.url);if(!['/settings','/registry'].includes(u.pathname))await this.scanIfDue();\n    if(u.pathname==='/health')",
    s,
    count=1,
)
assert n == 1, 'fixture-odds route not removed'
old_whitelist = "'/health','/registry','/settings','/scan','/board','/signals','/statistics','/history','/fixture-odds'"
new_whitelist = "'/health','/registry','/settings','/scan','/board','/signals','/statistics','/history'"
assert old_whitelist in s, 'engine route whitelist anchor missing'
s = s.replace(old_whitelist, new_whitelist, 1)

for token in [
    'fetchFullOdds', '/fixture-odds', 'FIVEDOLLAR_API_KEY', 'API_BASE',
    'MAX_ODDS_FIXTURES_PER_SCAN', 'UI_ODDS_CACHE_MS', 'UI_ODDS_STALE_MS',
    '/fixtures/${encodeURIComponent(fixtureId)}/odds'
]:
    assert token not in s, f'forbidden engine token remains: {token}'
assert "priceSource:'hub-batch'" in s
assert "externalRequests:0" in s
engine.write_text(s)

preview = Path('workers/nomadtips3-343-preview/src/index.js')
p = preview.read_text()
p, n = re.subn(r"\nfunction fullMarketRequest\(request, path\) \{.*?\n\}\n", "\n", p, count=1, flags=re.S)
assert n == 1, 'fullMarketRequest helper not removed'
p, n = re.subn(r"\n    if \(url\.pathname\.startsWith\('/api/full-market/'\)\) \{.*?\n    \}", "", p, count=1, flags=re.S)
assert n == 1, 'full market preview route not removed'
p = p.replace(" || path === '/full-odds-main-343.js'", "")
p = p.replace("'343-live-full-market-v1'", "'343-live-flow-v3'")
assert '/api/full-market/' not in p and 'fullMarketRequest' not in p and 'full-odds-main-343.js' not in p
preview.write_text(p)

wrangler = Path('workers/nomadtips3-343-preview/wrangler.jsonc')
w = wrangler.read_text()
old = '    { "binding": "ENGINE", "service": "nomadtips3-engine-343" },\n    { "binding": "FULL_MARKET", "service": "nomadtips3-343-full-market" }'
new = '    { "binding": "ENGINE", "service": "nomadtips3-engine-343" }'
assert old in w, 'FULL_MARKET binding anchor missing'
w = w.replace(old, new, 1)
assert 'FULL_MARKET' not in w and 'nomadtips3-343-full-market' not in w
wrangler.write_text(w)

deploy = Path('.github/workflows/deploy-343-preview.yml')
d = deploy.read_text()
d, n = re.subn(
    r"\n      - name: Bind 5USD API key to Engine referee\n        working-directory: workers/nomadtips3-engine-343\n        run: .*?\n(?=\n      - name: Dry-run 3\.43 preview)",
    "\n",
    d,
    count=1,
)
assert n == 1, 'Engine direct API key deploy step not removed'
deploy.write_text(d)
