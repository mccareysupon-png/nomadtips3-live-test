import assert from 'node:assert/strict';
export function once(s,needle,replacement){assert.equal(s.split(needle).length,2,'SOURCE_ANCHOR_CHANGED '+needle.slice(0,70));return s.replace(needle,replacement)}
export function patchHub(s){
 s='import {dispatchCentralActor,wrapCentralDefault} from "./central-actor.mjs";\n'+s;
 s=once(s,'  async fetch(request) {\n    const u = new URL(request.url);','  async fetch(request) {\n    if(new URL(request.url).pathname==="/__private/provider/v1")return dispatchCentralActor(this,request);\n    const u = new URL(request.url);');
 s=once(s,'const bulkSpeedV3Default=wrapHub(index_viewer_safe_default);','const bulkSpeedV3Default=wrapCentralDefault(wrapHub(index_viewer_safe_default));');
 // Existing active viewer rich route stays disabled; no change to old live flow.
 return s;
}
export function patchEngine(s){
 const start=s.indexOf('async function fetchVerifiedCornerOnly(');assert(start>=0);
 const end=s.indexOf('\n}',start);assert(end>start);let f=s.slice(start,end+2);
 const lines=f.split('\n');const index=lines.findIndex(l=>l.includes('const response=await fetch(url,'));assert(index>=0&&lines.filter(l=>l.includes('await fetch(')).length===1);
 lines[index]='  const response=await forwardProvider(env,"referee",url);';
 f=lines.join('\n');return 'import {forwardProvider} from "./provider-bridge.mjs";\n'+s.slice(0,start)+f+s.slice(end+2);
}
export function patchMarket(s){
 const start=s.indexOf('async function providerRequest(fixtureId, key) {');assert(start>=0);const end=s.indexOf('\n}',start);assert(end>start);
 let f=s.slice(start,end+2);f=once(f,'async function providerRequest(fixtureId, key) {','async function providerRequest(fixtureId, key, env) {');
 const a=f.indexOf('await fetch(');assert(a>=0);
 let depth=0,quote=null,escaped=false,b=-1;for(let i=a+'await fetch'.length;i<f.length;i++){const c=f[i];if(quote){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote=null;continue}if(c==='"'||c==="'"||c.charCodeAt(0)===96){quote=c;continue}if(c==='(')depth++;else if(c===')'&&--depth===0){b=i+1;break}}
 assert(b>a,'FETCH_EXPRESSION_NOT_LOCATED');f=f.slice(0,a)+'await forwardProvider(env,"fullmarket",url)'+f.slice(b);
 let out=s.slice(0,start)+f+s.slice(end+2);out=once(out,'await providerRequest(fixtureId, this.env.FIVEDOLLAR_API_KEY)','await providerRequest(fixtureId, this.env.FIVEDOLLAR_API_KEY, this.env)');return 'import {forwardProvider} from "./provider-bridge.mjs";\n'+out;
}
