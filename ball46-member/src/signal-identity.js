// Presentation-level guard: one canonical pick per fixture + Engine market rule.
// Preserve the entire underlying Ledger; emit audit IDs of suppressed duplicate picks.
export function canonicalMemberSignals(rows){
  const groups=new Map();
  for(const row of rows||[]){
    const fixtureId=String(row?.fixtureId||'');
    const market=String(row?.sourceMarket||row?.market||'');
    const id=String(row?.id||'');
    if(!fixtureId||!market||!id) continue;
    const key=JSON.stringify([fixtureId,market]);
    const a=groups.get(key);
    if(!a){groups.set(key,{keep:row,duplicates:[]});continue;}
    const at=Number(row.createdAt||0),prev=Number(a.keep.createdAt||0);
    // Historical first entry is canonical; a later Engine race cannot become a second bet.
    if(at<prev||(at===prev&&id<String(a.keep.id))){
      a.duplicates.push(a.keep);a.keep=row;
    }else{
      a.duplicates.push(row);
    }
  }
  const canonical=[...groups.values()].map(x=>x.keep).sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  const duplicateSignalIds=[...groups.values()].flatMap(x=>x.duplicates.map(r=>String(r.id))).sort();
  return {canonical,duplicateSignalIds};
}
