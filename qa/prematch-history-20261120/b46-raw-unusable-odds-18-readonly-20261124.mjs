import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const token=process.env.CLOUDFLARE_API_TOKEN, account=process.env.CLOUDFLARE_ACCOUNT_ID;
assert(token&&account,'CLOUDFLARE_CREDS_MISSING');
const name='ball46-prematch-only-test-20261120',
 root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers',
 host='https://'+name+'.mccarey-supon.workers.dev',
 key='Bearer '+crypto.createHmac('sha256',token).update('BALL46_PREMATCH_ONLY_V1').digest('hex');
const protectedNames=['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343','ball46-premium-match-colors-test-20261120'];
async function cf(path,opts={}){
 const r=await fetch(root+path,{...opts,headers:{authorization:'Bearer '+token,...opts.headers},signal:AbortSignal.timeout(50000)});
 const j=await r.json();assert(r.ok&&j.success,'CF_'+path+'_'+r.status);return j.result;
}
const version=async n=>(await cf('/scripts/'+n+'/deployments?per_page=1')).deployments[0].versions[0].version_id;
const before=Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)])));
const oldId=await version(name);
const old=await cf('/workers/'+name+'/versions/'+oldId+'?include=modules');
const set=await cf('/scripts/'+name+'/settings');
const main=old.main_module,modules=Object.fromEntries(old.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
assert(modules[main].includes('BTTS_PROJECT_CLOSED'),'BTTS_CLOSED_MISSING');
assert(modules[main].includes("path==='/ou-fullmarket-cache-audit-test'"),'FIRST_CACHE_AUDIT_MISSING');
const anchor=" if(path==='/ou-fullmarket-cache-audit-test'&&req.method==='GET'){";
assert.equal(modules[main].split(anchor).length,2);
const route="\n if(path==='/ou-raw-expired-odds-18-audit-test'&&req.method==='GET'){\n  const targets=[\n   [204955065,'DK Pharma FC – CFCI'],\n   [204950756,'Newcastle Jets – Kashiwa Reysol'],\n   [204951564,'Chattogram City FC – Brothers Union'],\n   [204948563,'Kyoto Sanga FC – Pohang Steelers'],\n   [204949069,'Daejeon Hana Citizen – Beijing Guoan'],\n   [204952127,'Galatasaray U19 – Aston Villa U19'],\n   [204948573,'Cong An Ha Noi – Vissel Kobe'],\n   [204948580,'Ratchaburi FC – Johor Darul Ta\\'zim'],\n   [204949071,'Shanghai Port – Buriram United'],\n   [204950209,'Moknine – Club Olympique Medenine'],\n   [204950220,'Kalaa Sport – CS Korba'],\n   [204952129,'Arsenal U19 – Borussia Dortmund U19'],\n   [204952131,'Slovan Bratislava U19 – Real Betis U19'],\n   [204952133,'Como U19 – AEK Athens U19'],\n   [204952135,'Man City U19 – Napoli U19'],\n   [204952137,'Real Madrid U19 – PSV U19'],\n   [204952139,'Feyenoord U19 – FC Porto U19'],\n   [204948589,'Shabab Al Ahli Dubai – Al Qadisiya Al Khubar']\n  ];\n  let data=null,problem=null;\n  try{\n   const x=await this.env.FULL_MARKET.fetch('https://full-market.internal/board-cache',\n     {method:'POST',headers:{'content-type':'application/json',accept:'application/json'},\n      body:JSON.stringify({fixtureIds:targets.map(x=>String(x[0]))}),\n      signal:AbortSignal.timeout(18000)});\n   if(!x.ok)problem='CACHE_HTTP_'+x.status;\n   else data=await x.json();\n  }catch(e){problem='CACHE_FETCH_'+String(e?.message??e).slice(0,80)}\n  if(data&&(data.ok!==true||data.externalRequestsAdded!==0||!data.entries||\n    typeof data.entries!=='object')){data=null;problem='UNVERIFIED_CACHE_OR_UNEXPECTED_UPSTREAM'}\n  const rows=targets.map(([id,match])=>{\n   const entry=data?.entries?.[String(id)]??null;\n   const odds=entry?.fullOdds?.data??entry?.fullOdds??null;\n   const books=Array.isArray(odds?.bookmakers)?odds.bookmakers:[];\n   const prices=[];\n   const push=(bookmaker,market,line,stage,v)=>{\n    if(!v||typeof v!=='object'||Array.isArray(v))return;\n    const over=v.over??null,under=v.under??null;\n    if(over===null&&under===null)return;\n    prices.push({bookmaker,market,line:line??v.line??null,stage,over,under});\n   };\n   for(const b of books){\n    const bookmaker=String(b?.name??b?.slug??'unknown'),m=b?.odds??{};\n    if(Array.isArray(m.goal_line_fixed))\n     for(const q of m.goal_line_fixed)\n      for(const stage of ['opening','closing'])\n       push(bookmaker,'goal_line_fixed',q?.line??null,stage,q?.[stage]);\n    const standard=m.goal_line;\n    if(standard&&typeof standard==='object'&&!Array.isArray(standard))\n     for(const stage of ['opening','closing'])\n      push(bookmaker,'goal_line',standard[stage]?.line??null,stage,standard[stage]);\n   }\n   return {fixtureId:id,match,cachePresent:!!entry,\n    stale:entry?.stale??null,cacheAgeSec:Number.isFinite(entry?.fetchedAt)?\n    Math.round((now*1000-entry.fetchedAt)/1000):null,\n    totalBookmakers:books.length,rawPriceCount:prices.length,prices};\n  });\n  return json({code:'B46_RAW_UNUSABLE_ODDS_18_READONLY',checkedUTC:new Date(now*1000).toISOString(),\n   warning:'Raw odds NOT verified current prices; may be stale, invalid, or no cache.',\n   cacheError:problem,cacheVerified:!!data,\n   cachedMatches:rows.filter(r=>r.cachePresent).length,\n   rawPricedMatches:rows.filter(r=>r.rawPriceCount>0).length,\n   totalRawPriceRows:rows.reduce((a,r)=>a+r.rawPriceCount,0),\n   rows,providerCalls:0,pricesUpdated:0,productionWrites:0});\n }\n";
modules[main]=modules[main].replace(anchor,route+'\n'+anchor);
const tmp='/tmp/b46-raw-odds-worker.mjs';
fs.writeFileSync(tmp,modules[main]);execFileSync(process.execPath,['--check',tmp]);
assert.equal(await version(name),oldId,'CONCURRENT_TEST_CHANGE');
const metadata={main_module:main,compatibility_date:old.compatibility_date||'2026-11-20',
 bindings:set.bindings.map(x=>({name:x.name,type:'inherit'})),
 ...(old.compatibility_flags?.length?{compatibility_flags:old.compatibility_flags}:{})};
const form=new FormData();
form.append('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}),'metadata.json');
for(const [n,s] of Object.entries(modules))form.append(n,new Blob([s],{type:'application/javascript+module'}),n);
await cf('/scripts/'+name+'?bindings_inherit=strict',{method:'PUT',body:form});
let newId=null;
for(let i=0;i<48;i++){
 const id=await version(name);
 if(id!==oldId){
  const v=await cf('/workers/'+name+'/versions/'+id+'?include=modules');
  const got=Object.fromEntries(v.modules.map(m=>[m.name,Buffer.from(m.content_base64,'base64').toString()]));
  if(Object.keys(got).length===Object.keys(modules).length&&
    Object.entries(modules).every(([n,s])=>got[n]===s)){newId=id;break}
 }
 await new Promise(ok=>setTimeout(ok,800));
}
assert(newId,'NEW_TEST_VERSION_UNVERIFIED');
await cf('/scripts/'+name+'/deployments',{method:'POST',headers:{'content-type':'application/json'},
 body:JSON.stringify({strategy:'percentage',versions:[{version_id:newId,percentage:100}],
 code_update_strategy:{mode:'immediate'}})});
let report=null;
for(let i=0;i<22;i++){
 await new Promise(ok=>setTimeout(ok,i?1300:2500));
 const r=await fetch(host+'/ou-raw-expired-odds-18-audit-test',{headers:{authorization:key},cache:'no-store',signal:AbortSignal.timeout(35000)});
 if(r.ok){const j=await r.json();if(j.code==='B46_RAW_UNUSABLE_ODDS_18_READONLY'){report=j;break}}
}
assert(report,'RAW_REPORT_NOT_FOUND');
assert(report.providerCalls===0&&!report.pricesUpdated&&report.productionWrites===0);
assert.deepEqual(Object.fromEntries(await Promise.all(protectedNames.map(async n=>[n,await version(n)]))),before);
console.log('B46_RAW_18_SUMMARY '+JSON.stringify({checkedUTC:report.checkedUTC,cacheVerified:report.cacheVerified,cacheError:report.cacheError,
 cachedMatches:report.cachedMatches,rawPricedMatches:report.rawPricedMatches,rawPriceRows:report.totalRawPriceRows,
 originalCount:report.rows.length,providerCalls:report.providerCalls}));
for(const f of report.rows)console.log('B46_RAW_18_FIXTURE '+JSON.stringify(f));
console.log('B46_RAW_18_COMPLETE');
