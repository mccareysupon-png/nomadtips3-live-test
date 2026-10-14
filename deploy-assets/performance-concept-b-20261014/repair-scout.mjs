import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {parse} from 'acorn';
import {activeVersion,getVersion,api,script,sha,canonical,backend} from '../daily-performance-20261005/production.mjs';
const id=await activeVersion();
const version=await getVersion(id);
const main=version.modules.find(m=>m.name===version.main_module);
const source=Buffer.from(main.content_base64,'base64').toString('utf8');
const tree=parse(source,{ecmaVersion:'latest',sourceType:'module'});
const cuts=[];
function walk(n){if(!n||typeof n!=='object')return;if(n.type==='Literal'&&typeof n.value==='string'&&n.value.length>500)cuts.push(n);for(const [k,c]of Object.entries(n)){if(k==='start'||k==='end')continue;if(Array.isArray(c))c.forEach(walk);else if(c&&typeof c==='object')walk(c)}}
walk(tree);
let concise=source;
for(const n of cuts.sort((a,b)=>b.start-a.start))concise=concise.slice(0,n.start)+JSON.stringify('[OMITTED_LITERAL_'+n.value.length+'_BYTES]')+concise.slice(n.end);
function redact(value){return JSON.parse(JSON.stringify(value,(key,item)=>/token|jwt|secret|password/i.test(key)?'[REDACTED]':item))}
const report={run:process.env.GITHUB_RUN_ID,mode:'READ_ONLY',worker:script,version:id,versionKeys:Object.keys(version),compatibility_date:version.compatibility_date,compatibility_flags:version.compatibility_flags,bindings:redact(version.bindings),assets:redact(version.assets),otherVersionFields:redact(Object.fromEntries(Object.entries(version).filter(([k])=>!['modules','bindings','assets'].includes(k)))),settings:redact(await api('/scripts/'+script+'/settings')),schedules:await api('/scripts/'+script+'/schedules'),backend:await backend(),modules:version.modules.map(m=>({name:m.name,type:m.content_type,size:Buffer.from(m.content_base64,'base64').length,sha:sha(Buffer.from(m.content_base64,'base64'))})),mainConcise:concise};
assert.equal(await activeVersion(),id,'ACTIVE_VERSION_MOVED');
mkdirSync('audit',{recursive:true});writeFileSync('audit/repair-scout.json',JSON.stringify(report,null,2));console.log(JSON.stringify({...report,mainConcise:concise.slice(0,14000)},null,2));
