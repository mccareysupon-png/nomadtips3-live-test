import assert from 'node:assert/strict';
export const beforeHash='c22c9c5899210fef66b194964bdc62799cb25c25028493747366099320b68d97';
export function patch(source){
 const start=source.indexOf('function renderWorkspaceScorebar(){');
 const end=source.indexOf("\ndocument.addEventListener('ball46:stable-chrome-ready'",start);
 assert(start>=0&&end>start,'RENDERER_ANCHOR_MISSING_STOP');
 const before=source.slice(start,end);
 assert(before.includes('while(a.length<6)')&&before.includes('.slice(0,4)'),'RENDERER_CHANGED_STOP');
 let next=before;
 const once=(a,b)=>{assert.equal(next.split(a).length-1,1,'ANCHOR_CHANGED:'+a);next=next.replace(a,b)};
 once(" const slot=document.querySelector('[data-workspace-scorebar-slot]');if(!slot)return;",` const slot=document.querySelector('[data-workspace-scorebar-slot]');if(!slot)return;
 installWorkspaceScorebarPresentation(slot);
 const width=slot.getBoundingClientRect().width;if(width<=0)return;
 const target=window.innerWidth<=760?3:window.innerWidth<=1180?5:10;
 const capacity=Math.min(target,Math.max(1,Math.floor((width+10)/190)));
 let resultLimit=Math.round(capacity*.6),pendingLimit=capacity-resultLimit;`);
 once("if(r==='PUSH'||r==='DRAW')return{cls:'draw',label:'DRAW'};","if(r==='PUSH'||r==='DRAW')return{cls:'draw',label:r};");
 once('.slice(0,6);',';');
 once("String(x?.status||'').toUpperCase()==='PENDING'","['LIVE','PENDING'].includes(String(x?.status||'').trim().toUpperCase())&&!String(x?.result??'').trim()&&!x?.settledAt");
 once('.slice(0,4);',`;\n if(recent.length&&pending.length){\n  for(let n=capacity;n>=1;n--){const r=Math.round(n*.6),p=n-r;if(r<=recent.length&&p<=pending.length){resultLimit=r;pendingLimit=p;break}}\n }else{resultLimit=recent.length?capacity:0;pendingLimit=pending.length?capacity:0}\n recent.splice(resultLimit);pending.splice(pendingLimit);`);
 const matchMarkup="<span class=\"workspace-scorebar-match\">'+esc(matchText(x))+'</span><span class=\"workspace-scorebar-pick\">";
 assert.equal(next.split(matchMarkup).length-1,2,'MATCH_MARKUP_CHANGED');
 next=next.split(matchMarkup).join("<span class=\"workspace-scorebar-match\">'+esc(matchText(x))+'</span><span class=\"workspace-scorebar-league\">'+esc(league||'—')+'</span><span class=\"workspace-scorebar-pick\">");
 once("clock='PENDING'+", "status=String(x?.status||'').trim().toUpperCase(),clock=status+");
 once('workspace-scorebar-pending\" data-scorebar-pending-signal=', 'workspace-scorebar-pending outcome-'+"'+esc(status==='LIVE'?'live':'pending')+'"+'\" data-scorebar-pending-signal=');
 once(" const a=recent.map(makeSettled),b=pending.map(makePending);"+before.split(" const a=recent.map(makeSettled),b=pending.map(makePending);")[1].split('\n}')[0],` const a=recent.map(makeSettled),b=pending.map(makePending),count=a.length+b.length;
 slot.dataset.scorebarRatio=(a.length===Math.round(count*.6)&&b.length===count-Math.round(count*.6)&&(!count||a.length&&b.length))?'PASS':'EXCEPTION';
 slot.dataset.scorebarSettled=String(a.length);slot.dataset.scorebarWaiting=String(b.length);
 slot.style.setProperty('--b46-scorebar-count',String(Math.max(1,count)));
 const html=a.concat(b).join('');
 let grid=slot.querySelector('.workspace-scorebar-grid');
 if(!grid){grid=document.createElement('div');grid.className='workspace-scorebar-grid';slot.replaceChildren(grid)}
 if(grid.innerHTML!==html){
  const template=document.createElement('template');template.innerHTML=html;
  const old=[...grid.children],used=new Set(),nodes=[];
  for(const fresh of template.content.children){
   const same=old.find(node=>!used.has(node)&&node.outerHTML===fresh.outerHTML);
   if(same)used.add(same);nodes.push(same||fresh);
  }
  for(let i=0;i<nodes.length;i++)if(grid.children[i]!==nodes[i])grid.insertBefore(nodes[i],grid.children[i]||null);
  while(grid.children.length>nodes.length)grid.lastElementChild.remove();
 }
}`);
 assert(next.endsWith('}\n}'),'RENDERER_END_UNEXPECTED');next=next.slice(0,-2);
 // Only this renderer and its local presentation/resize helper are replaced.
 return source.slice(0,start)+helper+'\n'+next+source.slice(end);
}
const helper=`/* B46_SCOREBAR_RESPONSIVE_20261004: existing presentation component, existing data only. */
function installWorkspaceScorebarPresentation(slot){
 if(!document.getElementById('b46-scorebar-responsive-style')){
  const style=document.createElement('style');style.id='b46-scorebar-responsive-style';style.textContent=${JSON.stringify(`
[data-workspace-scorebar-slot]{display:block!important;box-sizing:border-box!important;width:100%!important;height:262px!important;min-height:262px!important;max-height:262px!important;padding:5px 0!important;background:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;overflow:visible!important;isolation:auto!important}
[data-workspace-scorebar-slot]::before,[data-workspace-scorebar-slot]::after{content:none!important;display:none!important}
[data-workspace-scorebar-slot] .workspace-scorebar-grid{display:grid!important;grid-template-columns:repeat(var(--b46-scorebar-count,1),minmax(0,240px))!important;grid-template-rows:252px!important;gap:10px!important;align-items:stretch!important;justify-content:start!important;height:252px!important;min-height:252px!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:visible!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell{--b46-status:#cbd5e1;--b46-glow:rgba(203,213,225,.18);--b46-pill:#4b5563;box-sizing:border-box!important;display:flex!important;flex-direction:column!important;gap:8px!important;min-width:0!important;width:100%!important;height:252px!important;min-height:252px!important;max-height:252px!important;padding:12px!important;border:1px solid var(--b46-status)!important;border-radius:10px!important;background:#101720!important;background-image:none!important;box-shadow:0 0 3px 0 var(--b46-glow)!important;color:#f1f5f9!important;transform:none!important;transition:none!important;animation:none!important;text-shadow:none!important;overflow:visible!important;filter:none!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell::before,[data-workspace-scorebar-slot] .workspace-scorebar-cell::after{content:none!important;display:none!important}
[data-workspace-scorebar-slot] .outcome-win{--b46-status:#22c55e;--b46-glow:rgba(34,197,94,.2);--b46-pill:#176b3a}
[data-workspace-scorebar-slot] .outcome-loss{--b46-status:#ef4444;--b46-glow:rgba(239,68,68,.2);--b46-pill:#a5242b}
[data-workspace-scorebar-slot] .outcome-live{--b46-status:#38bdf8;--b46-glow:rgba(56,189,248,.2);--b46-pill:#075985}
[data-workspace-scorebar-slot] .outcome-pending{--b46-status:#eab308;--b46-glow:rgba(234,179,8,.2);--b46-pill:#806000}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-meta{display:flex!important;flex:0 0 auto!important;align-items:center!important;justify-content:space-between!important;gap:6px!important;margin:0!important;line-height:1.4!important;white-space:normal!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-meta i{display:inline-block!important;padding:3px 7px!important;border-radius:5px!important;background:var(--b46-pill)!important;color:#fff!important;font-size:12px!important;font-weight:650!important;font-style:normal!important;line-height:1.4!important;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;letter-spacing:0!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-meta b{color:#e2e8f0!important;font-size:14px!important;font-weight:650!important;line-height:1.4!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-match{display:block!important;flex:1 1 auto!important;margin:0!important;color:#f8fafc!important;font-size:14px!important;font-weight:700!important;line-height:1.4!important;white-space:normal!important;overflow:visible!important;overflow-wrap:anywhere!important;text-overflow:clip!important;letter-spacing:0!important;text-shadow:none!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-league{display:block!important;flex:0 0 auto!important;color:#94a3b8!important;font-size:11px!important;font-weight:500!important;line-height:1.4!important;white-space:normal!important;overflow:visible!important;overflow-wrap:anywhere!important;text-overflow:clip!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-pick{display:flex!important;flex:0 0 auto!important;flex-direction:column!important;align-items:flex-start!important;gap:3px!important;margin:0!important;line-height:1.4!important;min-width:0!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-pick strong,[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-pick em{flex:0 0 auto!important;font-size:12px!important;font-weight:500!important;font-style:normal!important;color:#b8c4d4!important;line-height:1.4!important;white-space:normal!important;overflow:visible!important;overflow-wrap:anywhere!important;text-overflow:clip!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-details{display:grid!important;flex:0 0 auto!important;grid-template-columns:minmax(0,1fr) 28px minmax(0,1fr)!important;gap:5px!important;margin:0!important;padding-top:7px!important;border-top:1px solid #273240!important;font-size:11px!important;line-height:1.4!important;white-space:normal!important;color:#94a3b8!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-details>span{overflow:visible!important;text-overflow:clip!important;white-space:normal!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-details i{font-size:10px!important;font-weight:600!important;font-style:normal!important;opacity:1!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-details b{font-size:11px!important;font-weight:600!important;line-height:1.4!important;color:#cbd5e1!important;overflow:visible!important;text-overflow:clip!important;white-space:normal!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-detail-minute{font-size:11px!important;font-weight:500!important;line-height:1.4!important;color:#94a3b8!important}
`)}.replaceAll('[data-workspace-scorebar-slot]','[data-workspace-scorebar-slot][data-workspace-scorebar-slot][data-workspace-scorebar-slot]');document.head.appendChild(style);
 }
 if(renderWorkspaceScorebar.observedSlot!==slot){
  renderWorkspaceScorebar.observer?.disconnect();renderWorkspaceScorebar.observedSlot=slot;
  let lastWidth=-1;
  const resize=()=>{const width=Math.floor(slot.getBoundingClientRect().width);if(width!==lastWidth){lastWidth=width;renderWorkspaceScorebar()}};
  if(typeof ResizeObserver!=='undefined'){renderWorkspaceScorebar.observer=new ResizeObserver(resize);renderWorkspaceScorebar.observer.observe(slot)}
 }
 if(!renderWorkspaceScorebar.resizeBound){renderWorkspaceScorebar.resizeBound=true;let frame;
  window.addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(renderWorkspaceScorebar)},{passive:true});
 }
}
`;
