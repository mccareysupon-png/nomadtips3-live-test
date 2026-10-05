import assert from 'node:assert/strict';
export const beforeHash='dc92feebce8b4c4a55bfeab7f36c9b39eee29dd708ecec83a635a6c6dce91d55';
export function patch(source){
 const anchor="const style=document.createElement('style');style.id='b46-scorebar-responsive-style';style.textContent=";
 const start=source.indexOf(anchor)+anchor.length,end=source.indexOf(".replaceAll('[data-workspace-scorebar-slot]'",start);
 assert(start>=anchor.length&&end>start,'CURRENT_PRESENTATION_STYLE_MISSING_STOP');
 let css=JSON.parse(source.slice(start,end));
 const layout=`
[data-workspace-scorebar-slot]{height:auto!important;min-height:0!important;max-height:none!important;padding:0!important;background:transparent!important;background-image:none!important;border:0!important;box-shadow:none!important;overflow:visible!important}
[data-workspace-scorebar-slot] .workspace-scorebar-grid{display:grid!important;grid-template-columns:repeat(10,minmax(0,1fr))!important;grid-template-rows:none!important;grid-auto-rows:180px!important;gap:10px!important;align-items:stretch!important;justify-content:stretch!important;height:auto!important;min-height:0!important;padding:0!important;margin:0!important;background:transparent!important;border:0!important;box-shadow:none!important;overflow:visible!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell{box-sizing:border-box!important;width:auto!important;min-width:0!important;height:180px!important;min-height:180px!important;max-height:180px!important;padding:8px 10px!important;gap:3px!important;border-radius:8px!important}
[data-workspace-scorebar-slot] .workspace-scorebar-cell .workspace-scorebar-meta i{color:#fff!important;font-weight:700!important}
@media (max-width:1180px){[data-workspace-scorebar-slot] .workspace-scorebar-grid{grid-template-columns:repeat(5,minmax(0,1fr))!important}}
@media (max-width:760px){[data-workspace-scorebar-slot] .workspace-scorebar-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
`;
 assert(!css.includes('grid-template-columns:repeat(10,minmax(0,1fr))'),'TEN_CARD_LAYOUT_ALREADY_PRESENT_STOP');
 css+=layout;
 let out=source.slice(0,start)+JSON.stringify(css)+source.slice(end);
 const oldCapacity=" const target=window.innerWidth<=760?3:window.innerWidth<=1180?5:10;\n const capacity=Math.min(target,Math.max(1,Math.floor((width+10)/190)));\n let resultLimit=Math.round(capacity*.6),pendingLimit=capacity-resultLimit;";
 const newCapacity=" const capacity=10;\n let resultLimit=6,pendingLimit=4;";
 assert(out.includes(oldCapacity),'CURRENT_CARD_CAPACITY_LOGIC_MOVED_STOP');
 out=out.replace(oldCapacity,newCapacity);
 assert(out.includes('const capacity=10;')&&out.includes('grid-template-columns:repeat(10,minmax(0,1fr))')&&out.includes('color:#fff!important;font-weight:700!important'),'TEN_CARD_PATCH_INCOMPLETE');
 return out;
}
