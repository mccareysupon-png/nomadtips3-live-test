import assert from 'node:assert/strict';
export const beforeHash='dc92feebce8b4c4a55bfeab7f36c9b39eee29dd708ecec83a635a6c6dce91d55';
export function patch(source){
 const anchor="const style=document.createElement('style');style.id='b46-scorebar-responsive-style';style.textContent=";
 const start=source.indexOf(anchor)+anchor.length,end=source.indexOf(".replaceAll('[data-workspace-scorebar-slot]'",start);
 assert(start>=anchor.length&&end>start,'CURRENT_PRESENTATION_STYLE_MISSING_STOP');
 let css=JSON.parse(source.slice(start,end));
 const rule=(selector,changes)=>{
  const prefix=selector+'{',at=css.indexOf(prefix);assert(at>=0,'STYLE_RULE_MOVED:'+selector);
  const from=at+prefix.length,to=css.indexOf('}',from),old=css.slice(from,to);
  let next=old.endsWith(';')?old:old+';';
  for(const [property,value] of Object.entries(changes)){
   const re=new RegExp('(^|;)'+property.replaceAll('-','\\-')+':[^;]+;');
   if(re.test(next))next=next.replace(re,(_,separator)=>separator+property+':'+value+'!important;');
   else next+=property+':'+value+'!important;';
  }
  css=css.slice(0,from)+next+css.slice(to);
 };
 const slot='[data-workspace-scorebar-slot]',cell=slot+' .workspace-scorebar-cell';
 rule(slot,{height:'190px','min-height':'190px','max-height':'190px'});
 rule(slot+' .workspace-scorebar-grid',{'grid-template-rows':'180px',height:'180px','min-height':'180px'});
 rule(cell,{height:'180px','min-height':'180px','max-height':'180px',padding:'8px 10px',gap:'3px','border-radius':'8px'});
 rule(cell+' .workspace-scorebar-meta',{height:'20px','min-height':'20px','max-height':'20px','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-meta i',{'font-size':'10.5px','font-weight':'650','line-height':'1.25',padding:'2px 5px','border-radius':'4px'});
 rule(cell+' .workspace-scorebar-meta b',{'font-size':'12px','font-weight':'550','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-match',{flex:'0 0 auto','font-size':'12px','font-weight':'600','line-height':'1.28'});
 rule(cell+' .workspace-scorebar-league',{'font-size':'10px','font-weight':'450','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-pick',{gap:'1px','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-pick strong,'+cell+' .workspace-scorebar-pick em',{'font-size':'10.5px','font-weight':'450','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-details',{'margin-top':'auto','padding-top':'5px','font-size':'9.5px','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-details i',{'font-size':'9px','font-weight':'500','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-details b',{'font-size':'9.5px','font-weight':'500','line-height':'1.25'});
 rule(cell+' .workspace-scorebar-detail-minute',{'font-size':'9.5px','font-weight':'450','line-height':'1.25'});
 assert(css.includes('height:190px')&&css.includes('font-size:12px'),'BALANCE_PATCH_INCOMPLETE');
 return source.slice(0,start)+JSON.stringify(css)+source.slice(end);
}
