/**
 * Immutable-fixture identity registry preparation for BALL46.
 * Read-only reducer: caller owns durable storage and transactions.
 * No network, write, settlement, odds or signal changes.
 */
const norm=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f]+/g," ").trim().replace(/\s+/g," ");
const utc=s=>typeof s==="string"&&/(?:Z|[+-]\d{2}:\d{2})$/i.test(s)&&Number.isFinite(Date.parse(s));
const gap=(a,b)=>Math.abs(Date.parse(a)-Date.parse(b));
const key=v=>String(v??"").trim();
const asIso=s=>new Date(Date.parse(s)).toISOString();
const validName=s=>typeof s==="string"&&norm(s).length>0;
const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const copy=x=>JSON.parse(JSON.stringify(x));
const reject=(reason,extra={})=>({accepted:false,reason,...extra});

/**
 * Register 5USD-discovered fixture metadata, or retain the original.
 * Requires source ID explicitly supplied by the trusted upstream adapter.
 * Existing identity is never silently rewritten.
 */
export function ingestFixtures({ existing = [], snapshots = [], collectedAt } = {}) {
  if (!utc(collectedAt)) throw Error("TRUSTED_COLLECTOR_TIME_REQUIRED");
  const records = new Map(), audit = [], seen = new Map();
  for (const r of existing) {
    const id=key(r.fixtureId);
    if (!id || records.has(id)) throw Error("DUPLICATE_OR_INVALID_STORED_ID");
    records.set(id,copy(r));
  }
  for(const raw of snapshots){
    const id=key(raw?.fixtureId), home=raw?.home,away=raw?.away,league=raw?.league;
    if(!id||!validName(home)||!validName(away)||!validName(league)||!utc(raw?.kickoffUtc)) {
      audit.push(reject("CANONICAL_IDENTITY_INCOMPLETE",{fixtureId:id}));continue;
    }
    const normalized={fixtureId:id,home,away,league,kickoffUtc:asIso(raw.kickoffUtc)};
    const fromProvider=key(raw.sourceFixtureId);
    if(!fromProvider){audit.push(reject("PRIMARY_SOURCE_ID_UNVERIFIED",{fixtureId:id}));continue;}
    const existingRecord=records.get(id);
    if(existingRecord){
      const identitySame=norm(existingRecord.home)===norm(home)&&norm(existingRecord.away)===norm(away)&&
        norm(existingRecord.league)===norm(league)&&utc(existingRecord.kickoffUtc)&&
        gap(existingRecord.kickoffUtc,normalized.kickoffUtc)===0;
      if(!identitySame){
        audit.push(reject("IMMUTABLE_FIXTURE_IDENTITY_CONFLICT",{fixtureId:id}));continue;
      }
      if(existingRecord.sourceIds?.["5usd"] && key(existingRecord.sourceIds["5usd"])!==fromProvider){
        audit.push(reject("PRIMARY_SOURCE_ID_CONFLICT",{fixtureId:id}));continue;
      }
      const sameProviderAlready=seen.get(fromProvider);
      if(sameProviderAlready&&sameProviderAlready!==id){
        audit.push(reject("DUPLICATE_PRIMARY_PROVIDER_ID",{fixtureId:id}));continue;
      }
      existingRecord.sourceIds={...existingRecord.sourceIds,"5usd":fromProvider};
      audit.push({accepted:true,reason:"UNCHANGED_IDENTITY",fixtureId:id});
    }else{
      if(seen.has(fromProvider)&&seen.get(fromProvider)!==id){
        audit.push(reject("DUPLICATE_PRIMARY_PROVIDER_ID",{fixtureId:id}));continue;
      }
      records.set(id,{...normalized,firstSeenAt:asIso(collectedAt),sourceIds:{"5usd":fromProvider},aliases:{}});
      audit.push({accepted:true,reason:"NEW_CANONICAL_FIXTURE",fixtureId:id});
    }
    seen.set(fromProvider,id);
  }
  return {records:[...records.values()],audit,writes:0};
}

/**
 * Provider mapping is approved ONLY when the provider timezone/90min semantics
 * have been separately certified and its source ID, teams, league and UTC match
 * a single immutable canonical fixture. No fuzzy matching.
 */
export function proposeMappings({
  registry=[],claims=[],policies={},leagueAliases={}
}={}){
  const updated=registry.map(copy),audit=[],sourceOwners=new Map();
  for(const r of updated){
    for(const [source,id] of Object.entries(r.sourceIds||{})){
      const mapKey=source+":"+key(id);
      if(sourceOwners.has(mapKey)&&sourceOwners.get(mapKey)!==String(r.fixtureId))
        throw Error("STORED_PROVIDER_ID_COLLISION");
      sourceOwners.set(mapKey,String(r.fixtureId));
    }
  }
  for(const c of claims){
    const source=key(c?.source),sourceId=key(c?.sourceFixtureId),policy=policies[source];
    if(!source||source==="5usd"||!sourceId||!policy?.utcCertified||!policy?.regulationFtCertified){
      audit.push(reject("SOURCE_POLICY_OR_ID_NOT_CERTIFIED",{source,sourceId}));continue;
    }
    if(!validName(c?.home)||!validName(c?.away)||!validName(c?.league)||!utc(c?.kickoffUtc)){
      audit.push(reject("SOURCE_IDENTITY_INCOMPLETE",{source,sourceId}));continue;
    }
    const alias=leagueAliases[source]?.[norm(c.league)];
    const expectedLeague=alias===undefined?c.league:alias;
    const matches=updated.filter(r=>
      norm(r.home)===norm(c.home)&&norm(r.away)===norm(c.away)&&
      norm(r.league)===norm(expectedLeague)&&utc(r.kickoffUtc)&&
      gap(r.kickoffUtc,c.kickoffUtc)<=30*60_000
    );
    if(matches.length!==1){
      audit.push(reject(matches.length?"AMBIGUOUS_FIXTURE_MATCH":"NO_VERIFIED_CANONICAL_MATCH",{source,sourceId,candidates:matches.length}));continue;
    }
    const r=matches[0], owner=sourceOwners.get(source+":"+sourceId);
    if(owner&&owner!==String(r.fixtureId)){
      audit.push(reject("PROVIDER_ID_ALREADY_ASSIGNED",{source,sourceId,fixtureId:r.fixtureId}));continue;
    }
    if(r.sourceIds?.[source] && r.sourceIds[source]!==sourceId){
      audit.push(reject("MAPPING_ALREADY_LOCKED_TO_DIFFERENT_SOURCE_ID",{source,sourceId,fixtureId:r.fixtureId}));continue;
    }
    r.sourceIds={...r.sourceIds,[source]:sourceId};
    sourceOwners.set(source+":"+sourceId,String(r.fixtureId));
    audit.push({accepted:true,reason:"MAPPING_VERIFIED",source,sourceId,fixtureId:r.fixtureId});
  }
  return {records:updated,audit,writes:0};
}
