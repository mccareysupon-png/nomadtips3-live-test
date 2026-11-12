import assert from 'node:assert/strict';
const SCRIPT='ball46-production';
const GOOD='a9025e59-1028-4502-bcc0-6cb062a87ac4';
const BAD='627f9819-da0a-4a50-98d2-bf12be7ebaec';
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const root='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers';
async function api(path){const r=await fetch(root+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(60000)});const j=await r.json();assert(r.ok&&j.success===true,'CF_ERROR');return j.result}
async function ver(id){return api('/workers/'+SCRIPT+'/versions/'+id+'?include=modules')}
const [g,b]=await Promise.all([ver(GOOD),ver(BAD)]);
console.log('GOOD_MAIN='+g.main_module);console.log('BAD_MAIN='+b.main_module);
console.log('GOOD_MODULES='+g.modules.length);console.log('BAD_MODULES='+b.modules.length);
for(const name of ['assets/index.html']){
 const gm=g.modules.find(m=>m.name===name),bm=b.modules.find(m=>m.name===name);assert(gm&&bm);
 const gs=Buffer.from(gm.content_base64,'base64').toString('utf8');
 const bs=Buffer.from(bm.content_base64,'base64').toString('utf8');
 console.log('GOOD_LEN='+gs.length);console.log('BAD_LEN='+bs.length);
 let p=0;while(p<gs.length&&p<bs.length&&gs[p]===bs[p])p++;
 let sg=gs.length-1,sb=bs.length-1;while(sg>=p&&sb>=p&&gs[sg]===bs[sb]){sg--;sb--}
 console.log('DIFF_START='+p);console.log('GOOD_DIFF_END='+sg);console.log('BAD_DIFF_END='+sb);
 console.log('GOOD_CONTEXT='+JSON.stringify(gs.slice(Math.max(0,p-1200),Math.min(gs.length,sg+1200))));
 console.log('BAD_CONTEXT='+JSON.stringify(bs.slice(Math.max(0,p-1200),Math.min(bs.length,sb+1200))));
 console.log('MARKER_COUNT_GOOD='+(gs.match(/B46_ANDROID_DOWNLOAD_FOOTER_20261112/g)||[]).length);
 console.log('MARKER_COUNT_BAD='+(bs.match(/B46_ANDROID_DOWNLOAD_FOOTER_20261112/g)||[]).length);
 console.log('STYLE_OPEN_GOOD='+(gs.match(/<style/gi)||[]).length+' STYLE_CLOSE_GOOD='+(gs.match(/<\/style>/gi)||[]).length);
 console.log('STYLE_OPEN_BAD='+(bs.match(/<style/gi)||[]).length+' STYLE_CLOSE_BAD='+(bs.match(/<\/style>/gi)||[]).length);
 console.log('SCRIPT_OPEN_GOOD='+(gs.match(/<script/gi)||[]).length+' SCRIPT_CLOSE_GOOD='+(gs.match(/<\/script>/gi)||[]).length);
 console.log('SCRIPT_OPEN_BAD='+(bs.match(/<script/gi)||[]).length+' SCRIPT_CLOSE_BAD='+(bs.match(/<\/script>/gi)||[]).length);
 console.log('FOOTER_OPEN_GOOD='+(gs.match(/<footer/gi)||[]).length+' FOOTER_CLOSE_GOOD='+(gs.match(/<\/footer>/gi)||[]).length);
 console.log('FOOTER_OPEN_BAD='+(bs.match(/<footer/gi)||[]).length+' FOOTER_CLOSE_BAD='+(bs.match(/<\/footer>/gi)||[]).length);
}
