import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const WORKER='ball46-production';
export const JS_PATH='/dashboard-v2-stage3-featured-facts-20261013a.js';
export const HTML_PATH='/';
export const VERSION_SUFFIX='-entry-corners-20261024';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const old1="entry=pair(s?.entryScore??s?.scoreAt),live=pair(s?.mirrorScore),lineText=";
const new1="entry=pair(s?.entryScore??s?.scoreAt),cornerEntry=pair(s?.entryCorners),isCornerMarket=/corner/i.test(String(s?.market||s?.providerMarket||s?.marketLabel||'')),live=pair(s?.mirrorScore),lineText=";
const old2="entryScore=entry.home===null||entry.away===null?'—':\`\${show(entry.home)}–\${show(entry.away)}\`,liveScore=";
const new2="entryScore=entry.home===null||entry.away===null?'—':\`\${show(entry.home)}–\${show(entry.away)}\`,entryCornerScore=cornerEntry.home===null||cornerEntry.away===null?'—':\`\${show(cornerEntry.home)}–\${show(cornerEntry.away)}\`,entryText=isCornerMarket?'Corners '+entryCornerScore:entryScore,liveScore=";
const old3='Entry \${esc(entryScore)}',new3='Entry \${esc(entryText)}';
const tagRx=/<script src="(dashboard-v2-stage3-featured-facts-20261013a\.js\?v=[^"]+)" defer><\/script>/g;
const exactOne=(s,old,label)=>{assert.equal(s.split(old).length,2,label+'_ANCHOR_NOT_UNIQUE')};
export function patchJs(s){
 assert(s.includes('function signalDetailsHtml(s)'),'MAIN_FEATURED_SIGNAL_RENDERER_MISSING');
 for(const [o,n,k]of[[old1,new1,'CORNERS_VARIABLE'],[old2,new2,'ENTRY_DISPLAY'],[old3,new3,'HTML_VALUE']]){exactOne(s,o,k);s=s.replace(o,n);}
 assert(s.includes('entryText=isCornerMarket?'),'CORNERS_PATCH_MISSING');
 return s;
}
export function patchHtml(s){
 const found=[...s.matchAll(tagRx)];assert.equal(found.length,1,'SCRIPT_TAG_CHANGED');
 const oldTag=found[0][0];
 assert(!oldTag.includes(VERSION_SUFFIX),'SCRIPT_ALREADY_PATCHED');
 const newTag=oldTag.replace('" defer>',VERSION_SUFFIX+'" defer>');
 exactOne(s,oldTag,'HTML_TAG');
 const html=s.replace(oldTag,newTag);
 assert.equal(html.replace(newTag,oldTag),s,'UNRELATED_HTML_CHANGED');
 return{html,oldTag,newTag};
}
export function patchWorker(s,expectedSha,tag){
 assert.equal(sha(Buffer.from(s)),expectedSha,'ACTIVE_WORKER_SOURCE_DRIFT');
 assert.equal(s.split('export default {').length,2,'WORKER_EXPORT_DRIFT');
 const mappings=[[old1,new1],[old2,new2],[old3,new3]];
 const data=mappings.map(([a,b],i)=>'const __b46CornerOld'+i+'='+JSON.stringify(a)+';\nconst __b46CornerNew'+i+'='+JSON.stringify(b)+';').join('\n');
 const block=[
 '/* BALL46_FEATURED_CORNER_ENTRY_20261024 UI-only wrapper. */',
 'const __b46CornerOldTag='+JSON.stringify(tag.oldTag)+';',
 'const __b46CornerNewTag='+JSON.stringify(tag.newTag)+';',
 data,
 'export default {...__b46CornerBefore20261024,async fetch(request,env,ctx){',
 '  const path=new URL(request.url).pathname;',
 "  const js=request.method==='GET'&&path==='/dashboard-v2-stage3-featured-facts-20261013a.js';",
 "  const html=request.method==='GET'&&(path==='/'||path==='/index.html');",
 '  const response=await __b46CornerBefore20261024.fetch.call(__b46CornerBefore20261024,request,env,ctx);',
 '  if((!js&&!html)||response.status!==200)return response;',
 "  const type=String(response.headers.get('content-type')||'').toLowerCase();",
 "  if(js&&!type.includes('javascript'))throw Error('CORNER_FEATURED_JS_CONTENT_TYPE_CHANGED');",
 "  if(html&&!type.includes('html'))throw Error('CORNER_FEATURED_HTML_CONTENT_TYPE_CHANGED');",
 '  let body=await response.text();',
 '  if(js){',
 '    for(let i=0;i<3;i++){',
 '      const old=[__b46CornerOld0,__b46CornerOld1,__b46CornerOld2][i],',
 '            changed=[__b46CornerNew0,__b46CornerNew1,__b46CornerNew2][i];',
 "      if(body.split(old).length!==2)throw Error('CORNER_FEATURED_JS_ANCHOR_DRIFT_'+i);",
 '      body=body.replace(old,changed);',
 '    }',
 '  }else{',
 "    if(body.split(__b46CornerOldTag).length!==2)throw Error('CORNER_FEATURED_HTML_TAG_DRIFT');",
 '    body=body.replace(__b46CornerOldTag,__b46CornerNewTag);',
 '  }',
 '  const headers=new Headers(response.headers);headers.delete("content-length");headers.delete("etag");',
 '  headers.set("cache-control","no-cache, must-revalidate");',
 '  headers.set("x-b46-corner-entry","entry-corners-20261024");',
 '  return new Response(body,{status:response.status,statusText:response.statusText,headers});',
 '}};'
 ].join('\n');
 const next=s.replace('export default {','const __b46CornerBefore20261024 = {')+'\n'+block;
 assert.equal(next.split('export default {').length,2);
 return next;
}
