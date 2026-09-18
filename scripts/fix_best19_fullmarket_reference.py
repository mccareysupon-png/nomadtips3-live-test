from pathlib import Path
p=Path('workers/nomadtips3-engine-343/src/index-bulk.js')
s=p.read_text()
old="""function pickBestPriced(candidates,fullPayload,bulkRoot,f,settings){
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
new="""function referencePrice(payload,key,selection){
  const row=bookmakerRows(payload).find(x=>bookmakerIdentity(x).slug.toLowerCase()==='bet365');
  const root=bookmakerRoot(row);const price=root?priceFor(root,key,selection):null;
  return price?{price,bookmaker:'Bet 365',bookmakerSlug:'bet365',bookRoot:root}:null;
}
function pickBestPriced(candidates,fullPayload,bulkRoot,f,settings){
  const passed=[];
  for(const c of candidates){
    const def=MARKET_RULES[c.market],cfg=settings[c.market],lineMarket=def.kind==='AH'||def.kind==='OU';
    const reference=referencePrice(fullPayload,c.market,c.selection);
    const canonicalLine=reference?.price?.providerLine??null;
    if(lineMarket&&canonicalLine===null)continue;
    const offers=offersFor(fullPayload,c.market,c.selection,canonicalLine,f,cfg);
    const offer=offers.find(x=>x.pass);if(!offer)continue;
    passed.push({...c,price:offer.price,bookmaker:offer.bookmaker,bookmakerSlug:offer.bookmakerSlug,bookRoot:offer.bookRoot,offerCount:offers.length,bookCount:bookmakerRows(fullPayload).length,referenceBookmaker:reference?.bookmaker??null,referenceBookmakerSlug:reference?.bookmakerSlug??null,referenceProviderLine:canonicalLine});
  }
  passed.sort((x,y)=>y.strength-x.strength||y.price.odds-x.price.odds||x.bookmakerSlug.localeCompare(y.bookmakerSlug));
  return passed[0]||null;
}
"""
if old in s:
    s=s.replace(old,new,1)
elif 'function referencePrice(payload,key,selection)' not in s:
    raise SystemExit('pickBestPriced anchor missing')

start=s.index("    if(u.pathname==='/referee'&&request.method==='GET'){")
end=s.index("    if(u.pathname==='/fixture-odds'&&request.method==='GET'){",start)
diag="""    if(u.pathname==='/referee'&&request.method==='GET'){
      if(String(this.env.CANARY_DIAGNOSTIC||'')!=='1')return Response.json({ok:false,error:'NOT_FOUND'},{status:404});
      const key=String(u.searchParams.get('market')||'ft_ah'),selection=String(u.searchParams.get('selection')||'HOME').toUpperCase();
      if(!MARKET_RULES[key])return Response.json({ok:false,error:'INVALID_MARKET'},{status:400});
      const hr=await this.env.HUB.fetch('https://hub.internal/snapshot'),hub=await hr.json();if(!hub?.ok)return Response.json({ok:false,error:'HUB_NOT_READY'},{status:503});
      const requestedId=String(u.searchParams.get('fixtureId')||'').trim();
      const pool=requestedId?(hub.fixtures||[]).filter(x=>String(x?.fixtureId??'')===requestedId):(hub.fixtures||[]).filter(isLive).slice(0,8);
      const def=MARKET_RULES[key],lineMarket=def.kind==='AH'||def.kind==='OU';
      let f=null,fixtureId='',full=null,reference=null;
      for(const candidate of pool){
        const id=String(candidate?.fixtureId??'');if(!id)continue;
        const rr=await this.env.FULL_MARKET.fetch(`https://full-market.internal/fixture-odds?fixtureId=${encodeURIComponent(id)}`),j=await rr.json();
        if(!rr.ok||j?.ok!==true)continue;
        const ref=referencePrice(j,key,selection);
        if(lineMarket&&(ref?.price?.providerLine===null||ref?.price?.providerLine===undefined))continue;
        f=candidate;fixtureId=id;full=j;reference=ref;break;
      }
      if(!f||!full)return Response.json({ok:false,error:lineMarket?'BET365_REFERENCE_LINE_UNAVAILABLE':'NO_LIVE_FIXTURE',market:key,selection},{status:409});
      const canonicalLine=reference?.price?.providerLine??null,cfg=(await this.readSettings())[key];
      const offers=offersFor(full,key,selection,canonicalLine,f,cfg),best=offers.find(x=>x.pass)||null;
      const safeOffers=offers.map(x=>({bookmaker:x.bookmaker,bookmakerSlug:x.bookmakerSlug,odds:x.price.odds,line:x.price.line,providerLine:x.price.providerLine,pass:x.pass}));
      return Response.json({ok:true,version:VERSION,revision:REVISION,fixtureId,market:key,selection,canonicalProviderLine:canonicalLine,canonicalSource:lineMarket?'BET365_FULL_MARKET':'NONE',bookmakerCount:bookmakerRows(full).length,offerCount:safeOffers.length,best:best?{bookmaker:best.bookmaker,bookmakerSlug:best.bookmakerSlug,odds:best.price.odds,line:best.price.line,providerLine:best.price.providerLine}:null,offers:safeOffers,fullMarket:{cached:full.cached,stale:full.stale,externalRequestsAdded:full.externalRequestsAdded}});
    }
"""
s=s[:start]+diag+s[end:]
s=s.replace("priceSource:'BEST_OF_19_INPLAY',refereeBookCount:best.bookCount,refereeOfferCount:best.offerCount", "priceSource:'BEST_OF_19_INPLAY',priceReference:'BET365_FULL_MARKET',referenceProviderLine:best.referenceProviderLine??null,refereeBookCount:best.bookCount,refereeOfferCount:best.offerCount")
s=s.replace("priceSource:'BEST_OF_19_INPLAY',refereeOfferCount:best.offerCount", "priceSource:'BEST_OF_19_INPLAY',priceReference:'BET365_FULL_MARKET',referenceProviderLine:best.referenceProviderLine??null,refereeOfferCount:best.offerCount")
p.write_text(s)
print('Bet365 Full Market reference ready')
