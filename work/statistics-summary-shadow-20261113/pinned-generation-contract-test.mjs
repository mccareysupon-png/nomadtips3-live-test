import assert from 'node:assert/strict';

function pageLimit(raw){const n=Number(raw);return Number.isSafeInteger(n)&&n>=100&&n<=2000?n:500}
async function readPage(storage,{cursor='stat:v2:row:\uffff',limit=2000,generation=null}={}){
 const before=await storage.get('stat:v2:meta');
 if(generation!=null&&String(before.updatedAt)!==String(generation))return {status:409,error:'STATISTICS_GENERATION_CHANGED'};
 const found=await storage.list({prefix:'stat:v2:row:',reverse:true,limit:limit+1,end:cursor});
 const entries=[...found.entries()],more=entries.length>limit,included=more?entries.slice(0,limit):entries;
 const after=await storage.get('stat:v2:meta');
 if(String(after.updatedAt)!==String(before.updatedAt))return {status:409,error:'STATISTICS_GENERATION_CHANGED'};
 return {status:200,generation:before.updatedAt,rows:included.map(([,v])=>v),nextCursor:more?included[included.length-1][0]:null};
}
function model(n){const rows=[];for(let i=0;i<n;i++){const k='stat:v2:row:'+String(1700000000000+i).padStart(13,'0')+':'+i;rows.push([k,{id:String(i)}])}return rows.reverse()}
async function run(n,flipAtList=null){
 const entries=model(n);let generation=10,lists=0;
 const storage={
  async get(k){assert.equal(k,'stat:v2:meta');return {updatedAt:generation}},
  async list(o){lists++;const a=entries.filter(([k])=>k<o.end).slice(0,o.limit);if(flipAtList===lists)generation++;return new Map(structuredClone(a))}
 };
 let cursor='stat:v2:row:\uffff',gen=null,total=0,pages=0;
 for(;;){const r=await readPage(storage,{cursor,limit:pageLimit(2000),generation:gen});pages++;if(r.status===409)return {conflict:true,pages,total};assert.equal(r.status,200);gen??=r.generation;assert.equal(r.generation,gen);total+=r.rows.length;if(!r.nextCursor)break;cursor=r.nextCursor}
 return {conflict:false,pages,total}
}
for(const n of [0,1,500,2000,2001,15003]){const r=await run(n);assert.equal(r.conflict,false);assert.equal(r.total,n);assert.equal(r.pages,Math.max(1,Math.ceil(n/2000)))}
const conflict=await run(15003,3);assert.equal(conflict.conflict,true);assert(conflict.pages<=3);
assert.equal(pageLimit('999999'),500);assert.equal(pageLimit('2000'),2000);
console.log(JSON.stringify({ok:true,rows:15003,pagesAt2000:Math.ceil(15003/2000),conflictDetected:true,productionWrites:0}));
