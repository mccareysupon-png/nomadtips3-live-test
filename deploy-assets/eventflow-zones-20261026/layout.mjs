// Event Flow V2 layout calculations, independent of Production DOM.
// No mutation of original graph/event coordinates; transparent 20% top and bottom expansion.
export function makeLayout({plotWidth,plotHeight,signals,maxMinute=90}){
 if(!Number.isFinite(plotWidth)||plotWidth<=0||!Number.isFinite(plotHeight)||plotHeight<=0||!Array.isArray(signals))throw Error('INVALID_LAYOUT_INPUT');
 const extra=plotHeight*0.2,top=extra,plotBottom=top+plotHeight,total=plotHeight+extra*2;
 const entries=signals.map((s,i)=>{
  const minute=Number(s.minute),type=String(s.type||'').toUpperCase(),side=String(s.side||'').toLowerCase();
  if(!Number.isFinite(minute)||minute<0||minute>maxMinute||!['HOME','AWAY','OU'].includes(type))throw Error('INVALID_SIGNAL');
  const lane=type==='HOME'?'top':type==='AWAY'?'bottom':(signals.filter(x=>String(x.type).toUpperCase()==='HOME').length<=signals.filter(x=>String(x.type).toUpperCase()==='AWAY').length?'top':'bottom');
  const x=plotWidth*minute/maxMinute;
  // Always preserve a single straight SVG segment between card anchor and source value.
  const sourceY=type==='OU'?top+plotHeight/2:top+plotHeight*(Math.max(0,Math.min(100,Number(s.pressure)||50))/100);
  const endY=lane==='top'?extra*.64:plotBottom+extra*.36;
  return {id:s.id??i,type,side,lane,minute,x,sourceY,endY};
 });
 return {topPadding:extra,bottomPadding:extra,plotTop:top,plotBottom,totalHeight:total,entries};
}
export function connector({cardX,cardY,sourceX,sourceY}){
 for(const n of [cardX,cardY,sourceX,sourceY])if(!Number.isFinite(n))throw Error('INVALID_COORDINATE');
 return {x1:cardX,y1:cardY,x2:sourceX,y2:sourceY}; // EXACTLY one straight SVG line.
}
