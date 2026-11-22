// BALL46 Pre-Match TEST - FULL CARGO of the existing five cache-import trips.
// Preserve every field in every ALREADY SELECTED fixture object (<=100 per trip).
// HCR V1's immutable ID manifests and result_version calculations stay unchanged.
// No fetch, new cron, extra provider request, odds request, or sixth trip.
const sql=(db,q,...p)=>Array.from(db.exec(q,...p));
const positive=x=>Number.isSafeInteger(Number(x))&&Number(x)>0;
const dayOk=x=>/^20\d\d-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(String(x));
export const FULL_CARGO_CODE='HISTORY-CARGO-FULL-V1';

export function initHistoryFullCargo(db){
 db.exec("CREATE TABLE IF NOT EXISTS prematch_history_full_cargo_round (business_day TEXT NOT NULL,round_no INTEGER NOT NULL,observed INTEGER NOT NULL,source TEXT NOT NULL,snapshot_header_json TEXT NOT NULL,delivered INTEGER NOT NULL,total_bytes INTEGER NOT NULL,schema_version INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(business_day,round_no))");
 db.exec("CREATE TABLE IF NOT EXISTS prematch_history_full_cargo_fixture (business_day TEXT NOT NULL,round_no INTEGER NOT NULL,fixture_id INTEGER NOT NULL,observed INTEGER NOT NULL,raw_json TEXT NOT NULL,PRIMARY KEY(business_day,round_no,fixture_id))");
 db.exec("CREATE INDEX IF NOT EXISTS full_cargo_fixture_lookup ON prematch_history_full_cargo_fixture(fixture_id)");
}
const fieldsOf=o=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o).sort():[];
export function storeHistoryRoundFullCargo(db,{businessDay,roundNo,selected,snapshot,observed}){
 if(!dayOk(businessDay)||!Number.isInteger(roundNo)||roundNo<1||roundNo>5||
    !Number.isSafeInteger(observed)||observed<=0||!Array.isArray(selected)||selected.length>100||
    snapshot?.ok!==true||snapshot?.cacheOnly!==true||!Array.isArray(snapshot.fixtures))throw Error('FULL_CARGO_INVALID_ROUND');
 initHistoryFullCargo(db);
 const byId=new Map();
 for(const raw of snapshot.fixtures){
  const id=Number(raw?.fixtureId);
  if(positive(id)&&!byId.has(id))byId.set(id,raw);
 }
 let totalBytes=0;
 const captured=[];
 for(const row of selected){
  const id=Number(row?.id),raw=byId.get(id);
  if(!positive(id)||!raw||Number(raw.fixtureId)!==id||
    Number(raw.league?.id)!==Number(row.league?.id)||
    Number(raw.home?.id)!==Number(row.teams?.home?.id)||
    Number(raw.away?.id)!==Number(row.teams?.away?.id))throw Error('FULL_CARGO_FIXTURE_IDENTITY_MISMATCH');
  // Raw JSON stringification keeps every original field and nested object
  // supplied in the current HUB cache, not the normalized 9-field FT row.
  const serialized=JSON.stringify(raw);
  if(!serialized||typeof serialized!=='string')throw Error('FULL_CARGO_UNSERIALIZABLE_FIXTURE');
  const bytes=new TextEncoder().encode(serialized).byteLength;
  totalBytes+=bytes;
  captured.push({id,json:serialized});
 }
 const {fixtures, ...originalHeader}=snapshot;
 const header=JSON.stringify(originalHeader);
 if(typeof header!=='string')throw Error('FULL_CARGO_INVALID_SNAPSHOT_HEADER');
 totalBytes+=new TextEncoder().encode(header).byteLength;
 const inserted=sql(db,"INSERT INTO prematch_history_full_cargo_round (business_day,round_no,observed,source,snapshot_header_json,delivered,total_bytes,schema_version) VALUES(?,?,?,?,?,?,?,1) ON CONFLICT DO NOTHING",businessDay,roundNo,observed,'NORMAL_HUB_CACHED_SNAPSHOT',header,captured.length,totalBytes);
 const changes=Number(sql(db,'SELECT changes() AS n')[0]?.n??0);
 if(changes!==1)throw Error('FULL_CARGO_DUPLICATE_ROUND');
 for(const x of captured)db.exec('INSERT INTO prematch_history_full_cargo_fixture (business_day,round_no,fixture_id,observed,raw_json) VALUES(?,?,?,?,?)',businessDay,roundNo,x.id,observed,x.json);
 return {businessDay,roundNo,delivered:captured.length,bytes:totalBytes,source:'NORMAL_HUB_CACHED_SNAPSHOT',providerCalls:0};
}
export function historyFullCargoReport(db,{day=null,roundNo=null,fixtureId=null,includeRaw=false}={}){
 if(!(day===null||dayOk(day))||
    !(roundNo===null||Number.isInteger(roundNo)&&roundNo>=1&&roundNo<=5)||
    !(fixtureId===null||positive(fixtureId))||
    (includeRaw&&!(day!==null&&roundNo!==null&&fixtureId!==null)))throw Error('FULL_CARGO_BAD_QUERY');
 initHistoryFullCargo(db);
 const where=[],args=[];
 if(day!==null){where.push('business_day=?');args.push(day)}
 if(roundNo!==null){where.push('round_no=?');args.push(roundNo)}
 const whereSQL=where.length?' WHERE '+where.join(' AND '):'';
 const rows=sql(db,'SELECT business_day,round_no,observed,source,snapshot_header_json,delivered,total_bytes FROM prematch_history_full_cargo_round'+whereSQL+' ORDER BY business_day DESC,round_no DESC LIMIT 70',...args);
 const rounds=rows.map(r=>{
  const fixtureRows=sql(db,'SELECT fixture_id,raw_json FROM prematch_history_full_cargo_fixture WHERE business_day=? AND round_no=? ORDER BY fixture_id LIMIT 100',r.business_day,r.round_no);
  const nestedPaths=new Set(),topLevel=new Set();
  for(const f of fixtureRows){
   const raw=JSON.parse(f.raw_json);
   for(const k of fieldsOf(raw)){topLevel.add(k);
    for(const second of fieldsOf(raw[k]))nestedPaths.add(k+'.'+second);
   }
  }
  const stored=fixtureRows.length;
  return {businessDay:r.business_day,roundNo:r.round_no,observed:r.observed,source:r.source,
    delivered:r.delivered,stored,complete:stored===r.delivered,
    totalBytes:r.total_bytes,headerKeys:fieldsOf(JSON.parse(r.snapshot_header_json)),
    fixtureFields:[...topLevel].sort(),nestedFields:[...nestedPaths].sort(),
    fixtureIds:fixtureRows.map(x=>x.fixture_id)};
 });
 let raw=null;
 if(includeRaw){
  const result=sql(db,'SELECT raw_json FROM prematch_history_full_cargo_fixture WHERE business_day=? AND round_no=? AND fixture_id=? LIMIT 1',day,roundNo,Number(fixtureId))[0];
  raw=result?JSON.parse(result.raw_json):null;
 }
 return {registry:FULL_CARGO_CODE,mode:'TEST_ONLY',source:'NORMAL_HUB_CACHED_SNAPSHOT',
   sourceNote:'Complete fields visible in the HUB cached snapshot; this cannot restore fields removed upstream before caching.',
   rounds,roundsTracked:rounds.length,fixtureRecords:rounds.reduce((v,r)=>v+r.stored,0),
   providerCalls:0,...(includeRaw?{fixture:raw}: {})};
}
