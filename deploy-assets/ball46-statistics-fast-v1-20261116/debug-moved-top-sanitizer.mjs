import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {removeMovedKpiStripFromMenu} from './remove-moved-kpi-strip.mjs';
const base='https://api.cloudflare.com/client/v4/accounts/62cb0db544160e6591342abd6b4f35cc';
const h={authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN};
const result=async url=>{const r=await fetch(base+url,{headers:h});const x=await r.json();if(!x.success)throw Error(JSON.stringify(x.errors));return x.result};
const d=await result('/workers/scripts/ball46-production/deployments?per_page=1');
const id=d.deployments[0].versions[0].version_id;
const v=await result('/workers/workers/ball46-production/versions/'+id+'?include=modules');
const m=v.modules.find(x=>x.name==='statistics-menu-entry-20261114.mjs');
const code=removeMovedKpiStripFromMenu(Buffer.from(m.content_base64,'base64').toString('utf8')).source;
await writeFile('/tmp/b46-moved-top-sanitizer-compiled.mjs',code);
try{execFileSync(process.execPath,['--check','/tmp/b46-moved-top-sanitizer-compiled.mjs']);
 console.log('B46_TOP_SANITIZER_COMPILES=TRUE')}catch(e){
 console.log('B46_TOP_SANITIZER_COMPILES=FALSE '+e.stderr?.toString()?.slice(0,1500));process.exit(1)}
const index=code.lastIndexOf('const CSS_OLD=');
if(index<0)throw Error('SANITIZER_ENV_NOT_FOUND');
const fn=new Function('html',code.slice(index)+'\nreturn sanitizeStatsPage(html);');
const html=await(await fetch('https://www.ball46.com/?view=statistics')).text();
const old='<style id="b46-statistics-no-old-flash-20261022">test</style>';
const raw=html.replace(/<style id="b46-stats-v1-no-legacy-firstpaint-20261116">[\s\S]*?<\/style>/,old);
console.log('B46_SANITIZER_INPUT='+JSON.stringify({size:raw.length,style:raw.includes(old),
  row:raw.includes('<section class="sp-kpis">'),ready:raw.includes('<script id="b46-statistics-ready-20261022">')}));
for(const [name,body] of [['reconstructed-original',raw],['already-sanitized',html]]){
 try{
  const x=fn(body);
  console.log('B46_SANITIZER_RUN='+JSON.stringify({name,ok:true,len:x.length,hidden:x.includes('data-b46-relocated-source="1"'),style:x.includes('b46-moved-top-kpis-no-flash-20261117')}));
 }catch(e){console.log('B46_SANITIZER_RUN='+JSON.stringify({name,ok:false,error:String(e),stack:e.stack?.slice(0,1600)}))}
}
const u='https://49327f2a-ball46-production.mccarey-supon.workers.dev/?view=statistics';
const live=await fetch(u);
console.log('B46_SANITIZER_CANDIDATE_HTTP='+JSON.stringify({status:live.status,headers:[...live.headers].filter(x=>/cf-|x-/.test(x[0])).slice(0,12),body:(await live.text()).slice(0,350)}));
