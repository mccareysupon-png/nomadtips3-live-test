import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const BASE='638ad4b5-1954-47e2-b2dc-043491926597',MARK='B46_SHARED_KITS_STABLE_20261030';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function mobileReconcile(ordered){
 const host=$('#b46gn-cards');if(!host)return;
 if(!ordered.length){if(!host.querySelector('.b46gn-empty'))host.innerHTML='<div class="b46gn-empty">No matching football fixtures are currently available.<br>Try another category or search.</div>';return;}
 const old=new Map([...host.querySelectorAll(':scope > [data-b46gn-fixture]')].map(n=>[n.dataset.b46gnFixture,n])),nodes=[];
 for(const f of ordered){const template=document.createElement('template');template.innerHTML=cardHtml(f);const desired=template.content.firstElementChild,existing=old.get(String(f.id));if(existing){const current=existing.querySelectorAll('.b46gn-kit'),next=desired.querySelectorAll('.b46gn-kit');for(let i=0;i<next.length;i++)if(current[i]&&current[i].dataset.gnTeamKey===next[i].dataset.gnTeamKey&&current[i].dataset.gnKitVersion===next[i].dataset.gnKitVersion)next[i].replaceWith(current[i]);if(existing.getAttribute('aria-label')!==desired.getAttribute('aria-label'))existing.setAttribute('aria-label',desired.getAttribute('aria-label'));existing.replaceChildren(...desired.childNodes);nodes.push(existing);}else nodes.push(desired);}
 const current=[...host.children];if(current.length!==nodes.length||current.some((n,i)=>n!==nodes[i]))host.replaceChildren(...nodes);
}
export function patchHTML(h){
 if(h.includes('id="b46-shared-kits-release-20261030"'))throw Error('ALREADY_PATCHED');
 if(!h.includes('id="b46-visual-suite-20261030"'))throw Error('BASE_MARKER_MISSING');
 const legacy="$('#b46gn-cards').innerHTML=ordered.length?ordered.map(cardHtml).join(''):'<div class=\"b46gn-empty\">No matching football fixtures are currently available.<br>Try another category or search.</div>'";
 if(h.split(legacy).length!==2)throw Error('MOBILE_RENDER_SOURCE_DRIFT');
 h=h.replace(legacy,'mobileReconcile(ordered)');
 const refresh=' function refresh(){scheduled=false;if(!active||!mq.matches)return;';
 if(h.split(refresh).length!==2)throw Error('MOBILE_REFRESH_SOURCE_DRIFT');
 h=h.replace(refresh,mobileReconcile.toString()+'\n'+refresh);
 const home='${clubMark(f.names[0],f.imgs[0])}',away='${clubMark(f.names[1],f.imgs[1])}';
 if(h.split(home).length!==2||h.split(away).length!==2)throw Error('MOBILE_KIT_SOURCE_DRIFT');
 h=h.replace(home,'${window.B46_TEAM_KITS?window.B46_TEAM_KITS.mobileMark(f.id,\'home\'):clubMark(f.names[0],f.imgs[0])}').replace(away,'${window.B46_TEAM_KITS?window.B46_TEAM_KITS.mobileMark(f.id,\'away\'):clubMark(f.names[1],f.imgs[1])}');
 for(const name of ['team-kits-343.js','dashboard-v2-stage3-featured-facts-20261013a.js']){const r=new RegExp('(<script[^>]+src=["\\\'])(/?)'+name.replaceAll('.','\\.')+'(?:\\?[^"\\\']*)?(["\\\'])','g');let count=0;h=h.replace(r,(_,a,slash,b)=>{count++;return a+slash+name+'?v=b46-shared-kits-20261030'+b;});if(count!==1)throw Error('SCRIPT_SOURCE_DRIFT:'+name);}
 const prediction="s.src='live-prediction-343.js?v=vote-reconnect-v9-20261024';";if(h.split(prediction).length!==2)throw Error('PREDICTION_LOADER_DRIFT');h=h.replace(prediction,"s.src='live-prediction-343.js?v=b46-shared-kits-20261030';");
 return h.replace('<head>','<head><link id="b46-shared-kits-release-20261030" rel="stylesheet" href="/b46-shared-kits-20261030.css"><script src="/b46-shared-kits-20261030.js" defer></script>');
}
export async function assetRecords(){return JSON.parse(await readFile('assets.json','utf8'));}
export function patchMain(source){const token='export default{...__visualSuitePrevious';assert.equal(source.split(token).length,2,'MAIN_EXPORT_DRIFT');return 'import __kitJSON from "./team-kits-assets-20261030.txt";\n'+source.replace(token,'const __teamKitsPrevious={...__visualSuitePrevious')+'\n'+mobileReconcile.toString()+'\n'+patchHTML.toString()+'\nconst __kitFiles=JSON.parse(__kitJSON);\nexport default{...__teamKitsPrevious,async fetch(request,env,ctx){const path=new URL(request.url).pathname,file=__kitFiles.find(f=>f.path===path);if(file&&["GET","HEAD"].includes(request.method)){const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));return new Response(request.method==="HEAD"?null:bytes,{headers:{"content-type":file.type,"cache-control":"public, max-age=86400","x-content-type-options":"nosniff"}});}const r=await __teamKitsPrevious.fetch.call(__teamKitsPrevious,request,env,ctx);if(request.method!=="GET"||!["/","/index.html"].includes(path)||!r.ok||!(r.headers.get("content-type")||"").includes("text/html"))return r;const body=patchHTML(await r.text()),headers=new Headers(r.headers);headers.delete("content-length");headers.delete("etag");headers.set("cache-control","no-cache, must-revalidate");return new Response(body,{status:r.status,statusText:r.statusText,headers});}};\n';}
