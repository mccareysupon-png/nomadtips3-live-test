from pathlib import Path

SRC=Path('workers/nomadtips3-engine-343/src/index-bulk.js')
WRANGLER=Path('workers/nomadtips3-engine-343/wrangler.toml')
CANARY=Path('workers/nomadtips3-engine-343/wrangler.canary.toml')

s=SRC.read_text()
if "nomad343-engine-v5-best19-referee" in s:
    print('already patched')
else:
    s=s.replace("const VERSION='nomad343-engine-v4-bulk-only';", "const VERSION='nomad343-engine-v5-best19-referee';")
    s=s.replace("const REVISION='343-bulk-snapshot-only-20260915';", "const REVISION='343-best19-referee-20260918';")

    a=s.index('function pickBestPriced(candidates,root,f,settings){')
    b=s.index('function storedFixture(s){',a)
    helpers="""function bookmakerRows(payload){
  const full=payload?.fullOdds??payload?.data?.fullOdds??payload?.data??payload;
  return Array.isArray(full?.bookmakers)?full.bookmakers:[];
}
function bookmakerIdentity(row){
  const slug=String(row?.slug??row?.bookmaker?.slug??row?.name??row?.bookmaker?.name??'').trim();
  const name=String(row?.name??row?.bookmaker?.name??row?.slug??row?.bookmaker?.slug??'').trim();
  return {slug:slug||name||'unknown',name:name||slug||'Unknown'};
}
function bookmakerRoot(row){return row?.odds??row?.markets??row?.data?.odds??row?.data?.markets??null}
function sameProviderLine(a,b){const x=num(a),y=num(b);return x!==null&&y!==null&&Math.abs(x-y)<=0.001}
function offersFor(payload,key,selection,canonicalProviderLine,f,cfg){
  const def=MARKET_RULES[key],lineMarket=def.kind==='AH'||def.kind==='OU',offers=[];
  for(const row of bookmakerRows(payload)){
    const root=bookmakerRoot(row);if(!root)continue;
    const price=priceFor(root,key,selection);if(!price||!(price.odds>0))continue;
    if(lineMarket&&!sameProviderLine(price.providerLine,canonicalProviderLine))continue;
    const id=bookmakerIdentity(row),pass=pricePass(key,cfg,price,f);
    offers.push({bookmaker:id.name,bookmakerSlug:id.slug,price,pass,bookRoot:root});
  }
  offers.sort((x,y)=>y.price.odds-x.price.odds||x.bookmakerSlug.localeCompare(y.bookmakerSlug));
  return offers;
}
function pickBestPriced(candidates,fullPayload,bulkRoot,f,settings){
  const passed=[];
  for(const c of candidates){
    const def=MARKET_RULES[c.market],cfg=settings[c.market],lineMarket=def.kind==='AH'||def.kind==='OU';
    const canonical=priceFor(bulkRoot,c.market,c.selection);
    if(lineMarket&&(canonical?.providerLine===null||canonical?.providerLine===undefined))continue;
    const offers=offersFor(fullPayload,c.market,c.selection,canonical?.providerLine??null,f,cfg);
    const offer=offers.find(x=>x.pass);if(!offer)continue;
    passed.push({...c,price:offer.price,bookmaker:offer.bookmaker,bookmakerSlug:offer.bookmakerSlug,bookRoot:offer.bookRoot,offerCount:offers.length,bookCount:bookmakerRows(fullPayload).length});
  }
  passed.sort((x,y)=>y.strength-x.strength||y.price.odds-x.price.odds||x.bookmakerSlug.localeCompare(y.bookmakerSlug));
  return passed[0]||null;
}
"""
    s=s[:a]+helpers+s[b:]

    old="const histories={},board=[],seen=new Set(signals.filter(s=>s.status==='PENDING').map(s=>`${s.fixtureId}:${s.market}`)),at=Number(hub.fetchedAt||now());"
    new=old+"\n      let refereeRequests=0,externalOddsRequests=0,refereeQueued=0;const refereeErrors=[];"
    if old not in s: raise SystemExit('counter anchor missing')
    s=s.replace(old,new,1)

    a=s.index('          if(marketCandidates.length){')
    b=s.index('        board.push(',a)
    block="""          if(marketCandidates.length){
            refereeQueued++;
            let full=null;
            if(!this.env.FULL_MARKET)refereeErrors.push({fixtureId:id,error:'FULL_MARKET_SERVICE_NOT_BOUND'});
            else{
              try{
                const rr=await this.env.FULL_MARKET.fetch(`https://full-market.internal/fixture-odds?fixtureId=${encodeURIComponent(id)}`),j=await rr.json();
                refereeRequests++;
                if(!rr.ok||j?.ok!==true)throw new Error(j?.error||`FULL_MARKET_HTTP_${rr.status}`);
                full=j;externalOddsRequests+=Math.max(0,num(j.externalRequestsAdded)??0);
              }catch(error){refereeErrors.push({fixtureId:id,error:String(error?.message||error)})}
            }
            if(!full){
              for(const c of marketCandidates)analysis[c.market]={state:'PRICE_REFEREE_UNAVAILABLE'};
            }else{
              const grouped=new Map();for(const c of marketCandidates){if(!grouped.has(c.market))grouped.set(c.market,[]);grouped.get(c.market).push(c)}
              for(const [key,cands] of grouped){
                const best=pickBestPriced(cands,full,root,f,settings);
                if(!best){analysis[key]={state:'NO_MATCHING_LINE_PRICE',priceSource:'BEST_OF_19_INPLAY'};continue}
                const def=MARKET_RULES[key],price=best.price,selectedRoot=best.bookRoot;
                const historyPoint={minute:num(f.minute),odds:price.odds,line:price.line,providerLine:price.providerLine,bookmaker:best.bookmaker,bookmakerSlug:best.bookmakerSlug,observedAt:at};
                const sig={id:`${id}-${key}-${now().toString(36)}`,fixtureId:id,league:clone(f.league),home:clone(f.home),away:clone(f.away),market:key,marketLabel:def.label,providerMarket:def.provider,period:def.period,selection:best.selection,line:price.line,selectionLine:price.line,providerLine:price.providerLine,providerLineSide:price.providerLineSide??null,odds:price.odds,bookmaker:best.bookmaker,bookmakerSlug:best.bookmakerSlug,priceStage:'inplay',priceSource:'BEST_OF_19_INPLAY',refereeBookCount:best.bookCount,refereeOfferCount:best.offerCount,openingPrice:stageSnapshot(selectedRoot,def,'opening'),closingPrice:stageSnapshot(selectedRoot,def,'closing'),inplayPrice:stageSnapshot(selectedRoot,def,'inplay'),createdAt:now(),entryMinute:num(f.minute),minute:num(f.minute),entryScore:clone(f.goals),scoreAt:clone(f.goals),entryCorners:clone(f.corners),entryCards:clone(f.cards),entryStats:clone(f.statistics),statisticsAtEntry:clone(f.statistics),eventHistory:Array.isArray(f.events)?clone(f.events):[],bookmakerHistory:[historyPoint],evidence:best.evidence,rolling:best.rolling,status:'PENDING',result:null,finalScore:null,finalCorners:null,finalCards:null,settlementBasis:def.basis||'goals',settlementRevision:SETTLEMENT_REVISION,lineGap:def.gap?lineGap(price.line,currentBasisTotal(f,def.basis)):null};
                signals.push(sig);seen.add(`${id}:${key}`);
                analysis[key]={state:'PASS',selection:best.selection,line:price.line,providerLine:price.providerLine,odds:price.odds,bookmaker:best.bookmaker,bookmakerSlug:best.bookmakerSlug,evidence:best.evidence,priceSource:'BEST_OF_19_INPLAY',refereeOfferCount:best.offerCount};
              }
            }
          }
        }
"""
    s=s[:a]+block+s[b:]

    reps={
      "await this.ctx.storage.put('board',{ok:true,version:VERSION,revision:REVISION,dataMode:'BULK_SNAPSHOT_ONLY',hubVersion:hub.version,hubFetchedAt:hub.fetchedAt,hubAgeMs:hub.ageMs,stale:hub.stale,counts:hub.counts,fixtures:board,runState:run,referee:{mode:'BULK_SNAPSHOT_ONLY',externalRequestsAdded:0,requests:0,queued:0,errors:[]}});":"await this.ctx.storage.put('board',{ok:true,version:VERSION,revision:REVISION,dataMode:'BULK_PLUS_BEST19_REFEREE',hubVersion:hub.version,hubFetchedAt:hub.fetchedAt,hubAgeMs:hub.ageMs,stale:hub.stale,counts:hub.counts,fixtures:board,runState:run,referee:{mode:'BEST_OF_19_INPLAY',externalRequestsAdded:externalOddsRequests,requests:refereeRequests,queued:refereeQueued,errors:refereeErrors}});",
      "const meta={ok:true,version:VERSION,revision:REVISION,dataMode:'BULK_SNAPSHOT_ONLY',startedAt,finishedAt:now(),fixtureCount:board.length,liveCount:board.filter(isLive).length,signalCount:capped.filter(s=>s.status==='PENDING').length,unresolvedCount:capped.filter(s=>s.status==='UNRESOLVED').length,reconciled,refereeRequests:0,refereeQueued:0,externalOddsRequests:0,lastError:null};":"const meta={ok:true,version:VERSION,revision:REVISION,dataMode:'BULK_PLUS_BEST19_REFEREE',startedAt,finishedAt:now(),fixtureCount:board.length,liveCount:board.filter(isLive).length,signalCount:capped.filter(s=>s.status==='PENDING').length,unresolvedCount:capped.filter(s=>s.status==='UNRESOLVED').length,reconciled,refereeRequests,refereeQueued,externalOddsRequests,refereeErrors,lastError:null};",
      "}catch(e){const meta={ok:false,version:VERSION,revision:REVISION,dataMode:'BULK_SNAPSHOT_ONLY',startedAt,finishedAt:now(),externalOddsRequests:0,lastError:String(e?.message||e)};await this.ctx.storage.put('lastScan',meta);return meta}":"}catch(e){const meta={ok:false,version:VERSION,revision:REVISION,dataMode:'BULK_PLUS_BEST19_REFEREE',startedAt,finishedAt:now(),externalOddsRequests:0,lastError:String(e?.message||e)};await this.ctx.storage.put('lastScan',meta);return meta}",
      "const u=new URL(request.url);if(!['/settings','/registry','/fixture-odds'].includes(u.pathname))await this.scanIfDue();":"const u=new URL(request.url);if(!['/settings','/registry','/fixture-odds','/referee'].includes(u.pathname))await this.scanIfDue();",
      "if(u.pathname==='/health'){const m=await this.ctx.storage.get('lastScan');return Response.json({ok:Boolean(m?.ok),component:'NOMAD343_ENGINE',version:VERSION,revision:REVISION,dataMode:'BULK_SNAPSHOT_ONLY',externalOddsRequests:0,...m})}":"if(u.pathname==='/health'){const m=await this.ctx.storage.get('lastScan');return Response.json({ok:Boolean(m?.ok),component:'NOMAD343_ENGINE',version:VERSION,revision:REVISION,dataMode:'BULK_PLUS_BEST19_REFEREE',...(m||{})})}",
      "const u=new URL(request.url),allowed=['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history','/fixture-odds'];":"const u=new URL(request.url),allowed=['/health','/registry','/settings','/scan','/board','/signals','/statistics','/history','/fixture-odds','/referee'];"
    }
    for old,new in reps.items():
        if old not in s: raise SystemExit('missing replacement anchor: '+old[:70])
        s=s.replace(old,new,1)

    anchor="    if(u.pathname==='/fixture-odds'&&request.method==='GET'){"
    pos=s.index(anchor)
    diagnostic="""    if(u.pathname==='/referee'&&request.method==='GET'){
      if(String(this.env.CANARY_DIAGNOSTIC||'')!=='1')return Response.json({ok:false,error:'NOT_FOUND'},{status:404});
      const key=String(u.searchParams.get('market')||'ft_ah'),selection=String(u.searchParams.get('selection')||'HOME').toUpperCase();
      if(!MARKET_RULES[key])return Response.json({ok:false,error:'INVALID_MARKET'},{status:400});
      const hr=await this.env.HUB.fetch('https://hub.internal/snapshot'),hub=await hr.json();if(!hub?.ok)return Response.json({ok:false,error:'HUB_NOT_READY'},{status:503});
      let fixtureId=String(u.searchParams.get('fixtureId')||'').trim(),f=fixtureId?(hub.fixtures||[]).find(x=>String(x?.fixtureId??'')===fixtureId):null;
      if(!f){f=(hub.fixtures||[]).find(x=>isLive(x)&&oddsRoot(x.providerOdds));fixtureId=String(f?.fixtureId??'')}
      if(!f)return Response.json({ok:false,error:'NO_LIVE_FIXTURE'},{status:404});
      const bulkRoot=oddsRoot(f.providerOdds),def=MARKET_RULES[key],canonical=priceFor(bulkRoot,key,selection),lineMarket=def.kind==='AH'||def.kind==='OU';
      if(lineMarket&&(canonical?.providerLine===null||canonical?.providerLine===undefined))return Response.json({ok:false,fixtureId,market:key,selection,error:'CANONICAL_BULK_LINE_UNAVAILABLE'},{status:409});
      const rr=await this.env.FULL_MARKET.fetch(`https://full-market.internal/fixture-odds?fixtureId=${encodeURIComponent(fixtureId)}`),full=await rr.json();
      if(!rr.ok||full?.ok!==true)return Response.json({ok:false,fixtureId,error:full?.error||`FULL_MARKET_HTTP_${rr.status}`},{status:rr.status||502});
      const cfg=(await this.readSettings())[key],offers=offersFor(full,key,selection,canonical?.providerLine??null,f,cfg),best=offers.find(x=>x.pass)||null;
      const safeOffers=offers.map(x=>({bookmaker:x.bookmaker,bookmakerSlug:x.bookmakerSlug,odds:x.price.odds,line:x.price.line,providerLine:x.price.providerLine,pass:x.pass}));
      return Response.json({ok:true,version:VERSION,revision:REVISION,fixtureId,market:key,selection,canonicalProviderLine:canonical?.providerLine??null,bookmakerCount:bookmakerRows(full).length,offerCount:safeOffers.length,best:best?{bookmaker:best.bookmaker,bookmakerSlug:best.bookmakerSlug,odds:best.price.odds,line:best.price.line,providerLine:best.price.providerLine}:null,offers:safeOffers,fullMarket:{cached:full.cached,stale:full.stale,externalRequestsAdded:full.externalRequestsAdded}});
    }
"""
    s=s[:pos]+diagnostic+s[pos:]
    SRC.write_text(s)

w=WRANGLER.read_text()
if 'binding = "FULL_MARKET"' not in w:
    anchor='[[services]]\nbinding = "HUB"\nservice = "nomadtips3-5usd-hub-343"\n'
    if anchor not in w: raise SystemExit('wrangler HUB anchor missing')
    w=w.replace(anchor,anchor+'\n[[services]]\nbinding = "FULL_MARKET"\nservice = "nomadtips3-full-market-343-ball46"\n',1)
    WRANGLER.write_text(w)

CANARY.write_text('''name = "nomadtips3-engine-343-best19-canary"\nmain = "src/index-bulk.js"\ncompatibility_date = "2026-09-09"\nworkers_dev = true\n\n[observability]\nenabled = true\n\n[vars]\nCANARY_DIAGNOSTIC = "1"\n\n[[services]]\nbinding = "HUB"\nservice = "nomadtips3-5usd-hub-343"\n\n[[services]]\nbinding = "FULL_MARKET"\nservice = "nomadtips3-full-market-343-ball46"\n\n[[durable_objects.bindings]]\nname = "ENGINE"\nclass_name = "Nomad343Engine"\n\n[[migrations]]\ntag = "v1"\nnew_sqlite_classes = ["Nomad343Engine"]\n''')
print('best19 patch ready')
