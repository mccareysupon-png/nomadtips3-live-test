import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const ACC=process.env.CLOUDFLARE_ACCOUNT_ID,TOKEN=process.env.CLOUDFLARE_API_TOKEN,NAME='ball46-member-production';
assert(ACC&&TOKEN,'NO_CLOUDFLARE_CREDENTIALS');
const digest=b=>createHash('sha256').update(b).digest('hex');
const cf=async p=>{
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+ACC+p,{headers:{Authorization:'Bearer '+TOKEN},signal:AbortSignal.timeout(25000)});
 const body=await response.json();assert(response.ok&&body.success===true,'CLOUDFLARE_'+response.status+':'+JSON.stringify(body.errors));
 return body.result;
};
const dep=(await cf('/workers/scripts/'+NAME+'/deployments?per_page=1')).deployments?.[0];
assert(dep?.versions?.length===1&&dep.versions[0].percentage===100,'NOT_SINGLE_100_PERCENT_ACTIVE');
const version=await cf('/workers/workers/'+NAME+'/versions/'+dep.versions[0].version_id+'?include=modules');
const domains=(await cf('/workers/domains')).filter(x=>x.service===NAME).map(x=>x.hostname);
assert(domains.includes('member.ball46.com'),'WRONG_TARGET_DOMAIN');
assert(!domains.includes('ball46.com'),'MAIN_DOMAIN_COLLISION');
const paths=['/','/styles.css','/member.js','/member.html'];
const results={};
mkdirSync('audit/member-scrollbar-before',{recursive:true});
for(const p of paths){
 const response=await fetch('https://member.ball46.com'+p+'?css_readonly='+Date.now(),{redirect:'manual',signal:AbortSignal.timeout(30000)});
 const raw=Buffer.from(await response.arrayBuffer());
 results[p]={http:response.status,size:raw.length,sha256:digest(raw),type:response.headers.get('content-type')};
 if(p==='/styles.css'&&response.ok)writeFileSync('audit/member-scrollbar-before/active-styles.css',raw);
 if(p==='/member.js'&&response.ok)writeFileSync('audit/member-scrollbar-before/active-member.js',raw);
 if(p==='/')writeFileSync('audit/member-scrollbar-before/root.html',raw);
}
const raw=await import('node:fs').then(f=>f.readFileSync('audit/member-scrollbar-before/active-styles.css','utf8'));
const lines=raw.split('\n'),hits=[];
for(let n=0;n<lines.length;n++){
 if(/scrollbar|overflow-y|overflow:\s*(auto|scroll)|MARKETS|market-sidebar|market-rail/i.test(lines[n]))hits.push({line:n+1,around:lines.slice(Math.max(0,n-3),Math.min(lines.length,n+4)).join(' ').slice(0,750)});
}
const report={status:'READ_ONLY',target:NAME,domains,version:dep.versions[0].version_id,deployment:dep.id,mainModule:version.main_module,moduleNames:version.modules.map(x=>x.name),assetConfig:version.assets?.config,bindings:(version.bindings??[]).map(b=>({type:b.type,name:b.name})),paths:results,styleMatches:hits.slice(-115)};
writeFileSync('audit/member-scrollbar-before/summary.json',JSON.stringify(report,null,2));
console.log('MEMBER_SCROLLBAR_READONLY_AUDIT',JSON.stringify(report).slice(0,28000));