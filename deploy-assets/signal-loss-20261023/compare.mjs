import{mkdir,writeFile}from'node:fs/promises';
const A=process.env.CLOUDFLARE_ACCOUNT_ID,T=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+A;
async function cf(p){const r=await fetch(root+p,{headers:{authorization:'Bearer '+T},signal:AbortSignal.timeout(40000)}),j=await r.json();if(!r.ok||!j.success)throw Error('CF'+r.status);return j.result;}
const b46=['8867d39d-f381-4261-8d05-5b429926353b','9f0b9a92-6a1f-402e-9ff6-a428ae591080','50f65def-f4a1-4172-8dd4-ac3c7bb82209'];
const codeVariants=[],terms=['function activeSignals','function engineBoardResponse','hiddenPendingSignals','ENGINE_BOARD_LIVE','activeMatches','activeSignals','pathname === "/api/engine/signals"','/api/engine/signals'];
for(const id of b46){
 try{
 const v=await cf('/workers/workers/ball46-production/versions/'+id+'?include=modules');
 const s=Buffer.from(v.modules.find(x=>x.name===v.main_module).content_base64,'base64').toString();
 const matches=[];
 for(const term of terms){let idx=-1,n=0;while((idx=s.indexOf(term,idx+1))>=0&&n++<4)matches.push({term,idx,excerpt:s.slice(Math.max(0,idx-450),Math.min(s.length,idx+2600)).slice(0,3100)})}
 codeVariants.push({id,bytes:s.length,matches});
 }catch(e){codeVariants.push({id,error:String(e)})}
}
const data={time:new Date().toISOString(),codeVariants};
await mkdir('audit',{recursive:true});await writeFile('audit/signal-proxy-diff.json',JSON.stringify(data,null,2));
console.log('B46_SIGNAL_PROXY_DIFF='+JSON.stringify(data).slice(0,52000));
