import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const ACCOUNT=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN;
if(!ACCOUNT||!TOKEN)throw Error('READONLY_AUDIT_MISSING_CREDENTIALS');
const sha=b=>createHash('sha256').update(b).digest('hex');
const norm=k=>String(k||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const isBtts=k=>/btts|bothteamstoscore|bothteamscore|bothside.*score|goalgoal|bothscore/.test(norm(k))||/both\s+teams\s+to\s+score/i.test(String(k));
const allowed=['/api/engine/health','/api/engine/board','/api/engine/signals','/api/full-market/health','/api/full-market/board','/api/full-market/signals','/api/odds','/api/live','/api/featured'];
const result={audit:'BALL46_BTTS_LIVE_READONLY',at:new Date().toISOString(),workerVersions:[],http:[],summary:[],warnings:[],bttsSamples:[],codeHints:[]};
async function cf(path){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+path,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(35000)});
 const j=await r.json();if(!r.ok||j.success!==true)throw Error('CLOUDFLARE_GET_'+r.status+':'+JSON.stringify(j.errors).slice(0,120));return j.result;
}
for(const w of ['ball46-production','nomadtips3-engine-343','nomadtips3-5usd-hub-343']){
 try{
  const d=(await cf('/workers/scripts/'+w+'/deployments?per_page=1')).deployments?.[0];if(!d)continue;
  const active=d.versions?.find(x=>x.percentage>0)?.version_id;
  result.workerVersions.push({worker:w,active,deployment:d.id,traffic:d.versions});
  if(!active)continue;
  const ver=await cf('/workers/workers/'+w+'/versions/'+active+'?include=modules');
  const main=ver.modules?.find(x=>x.name===ver.main_module);
  const src=main?Buffer.from(main.content_base64,'base64').toString('utf8'):'';
  let matches=[],rx=/BTTS|both[_ -]?teams?[_ -]?(?:to[_ -]?)?score|bothTeamsToScore|both_teams_to_score/gi,m;
  while((m=rx.exec(src))&&matches.length<30){const around=src.slice(Math.max(0,m.index-190),Math.min(src.length,m.index+230));
  // Do not leak token, cookie, or secret values via code context.
   matches.push({offset:m.index,context:around.replace(/(?:api[_-]?key|secret|bearer|token)\s*[:=]\s*['"][^'"]+/gi,'$1=[redacted]').slice(0,430)});
  }
  result.codeHints.push({worker:w,active,sourceSha:sha(Buffer.from(src)),codeBytes:src.length,occurrences:matches.length,contexts:matches.slice(0,9)});
 }catch(e){result.warnings.push({worker:w,error:String(e.message||e).slice(0,160)});}
}
function summarizeJSON(data,url){
 const top=Array.isArray(data)?{type:'array',length:data.length}:{type:typeof data,keys:Object.keys(data||{}).slice(0,36)};
 const stats={url,top,fixtures:0,markets:0,bttsFields:0,bttsRows:0,bttsPricesYes:0,bttsPricesNo:0,signals:0,bttsSignals:0,marketKeys:[],signalMarkets:[],samples:[]};
 const marketKeys=new Map(),sigKeys=new Map();let walked=0,queue=[{x:data,depth:0,path:'$'}];const seen=new WeakSet();
 while(queue.length&&walked<150000){
  const {x,depth,path}=queue.pop();if(!x||typeof x!=='object'||seen.has(x))continue;seen.add(x);walked++;
  if(depth>11)continue;
  if(Array.isArray(x)){if(x.length>15000)stats.truncated=true;for(let i=0;i<Math.min(x.length,15000);i++)if(x[i]&&typeof x[i]==='object')queue.push({x:x[i],depth:depth+1,path:path+'[]'});continue;}
  let ks=Object.keys(x),marketName=x.market||x.marketName||x.market_name||x.betType||x.type||x.marketKey||x.name;
  if(typeof marketName==='string'){const k=marketName.slice(0,75),low=norm(k);marketKeys.set(k,(marketKeys.get(k)||0)+1);
   if(isBtts(k)){stats.bttsRows++;if(stats.samples.length<6)stats.samples.push({path,keys:ks.slice(0,22),marketName:k,yes:x.yes??x.Yes??x.YES??x.home??null,no:x.no??x.No??x.NO??x.away??null,odds:x.odds??null,price:x.price??null,bookmaker:x.bookmaker??null});}
  }
  const sig=x.signal||x.pick||x.selection||x.prediction;
  const indicative=typeof sig==='string'&&('market'in x||'odds'in x||'signalId'in x||'selectionId'in x);
  if(indicative){stats.signals++;const k=String(x.market||x.marketType||x.type||x.betType||'unspecified');sigKeys.set(k,(sigKeys.get(k)||0)+1);if(isBtts(k)||isBtts(sig))stats.bttsSignals++;}
  const pair=x.btts||x.bothTeamsToScore||x.both_teams_to_score||x.bothTeamsScore;
  if(pair!=null){stats.bttsFields++;if(typeof pair==='object'){const y=pair.yes??pair.YES??pair.Yes??pair.home;const n=pair.no??pair.NO??pair.No??pair.away;if(typeof y==='number'&&y>1)stats.bttsPricesYes++;if(typeof n==='number'&&n>1)stats.bttsPricesNo++;if(stats.samples.length<6)stats.samples.push({path,field:'btts',btts:JSON.stringify(pair).slice(0,800)});}}
  if('fixtureId'in x||'fixture_id'in x)stats.fixtures++;
  if('oneXtwo'in x||'asianHandicap'in x||'overUnder'in x)stats.markets++;
  for(const k of ks){if(isBtts(k)&&!['btts','bothTeamsToScore','both_teams_to_score','bothTeamsScore'].includes(k)){stats.bttsFields++;if(stats.samples.length<6)stats.samples.push({path,key:k,value:JSON.stringify(x[k]).slice(0,400)});}
   const child=x[k];if(child&&typeof child==='object')queue.push({x:child,depth:depth+1,path:path+'.'+k});}
 }
 stats.walked=walked;stats.marketKeys=[...marketKeys].sort((a,b)=>b[1]-a[1]).slice(0,38);stats.signalMarkets=[...sigKeys].sort((a,b)=>b[1]-a[1]).slice(0,26);
 return stats;
}
for(const path of allowed){
 const url='https://ball46.com'+path+'?bttsAudit='+Date.now();
 try{
  const r=await fetch(url,{headers:{'cache-control':'no-cache'},redirect:'follow',signal:AbortSignal.timeout(25000)}),body=Buffer.from(await r.arrayBuffer()),type=r.headers.get('content-type')||'';
  result.http.push({path,status:r.status,bytes:body.length,contentType:type,sha:sha(body)});
  if(r.status!==200||!(type.includes('json')||body[0]===123||body[0]===91))continue;
  const data=JSON.parse(body.toString());
  const s=summarizeJSON(data,path);result.summary.push(s);
 }catch(e){result.http.push({path,error:String(e.message||e).slice(0,150)});}
}
await mkdir('audit',{recursive:true});
await writeFile('audit/btts-live-audit.json',JSON.stringify(result,null,2));
console.log('B46_BTTS_AUDIT='+JSON.stringify({at:result.at,workerVersions:result.workerVersions,http:result.http,summary:result.summary.map(s=>({url:s.url,top:s.top,fixtures:s.fixtures,markets:s.markets,bttsFields:s.bttsFields,bttsRows:s.bttsRows,bttsPricesYes:s.bttsPricesYes,bttsPricesNo:s.bttsPricesNo,signals:s.signals,bttsSignals:s.bttsSignals,signalMarkets:s.signalMarkets,marketKeys:s.marketKeys.slice(0,22),samples:s.samples})),codeHints:result.codeHints.map(x=>({worker:x.worker,occurrences:x.occurrences,sourceSha:x.sourceSha,contexts:x.contexts.slice(0,6)})),warnings:result.warnings}).slice(0,46000));
