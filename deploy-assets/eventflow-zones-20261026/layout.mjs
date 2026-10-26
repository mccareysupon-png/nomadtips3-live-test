// Event Flow V2 candidate only. Preserve original graph, 20% air above and below.
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
export function makeLayout({plotWidth,plotHeight,signals,maxMinute=90,cardWidth=128,minGap=7}){
if(!(plotWidth>0&&plotHeight>0&&maxMinute>0)||!Array.isArray(signals))throw Error('INVALID_LAYOUT_INPUT');
const extra=plotHeight*.2,top=extra,bottom=top+plotHeight;
const entries=signals.map((s,i)=>{const type=String(s.type||'').toUpperCase(),minute=Number(s.minute),pressure=s.pressure==null?50:Number(s.pressure);
if(!['HOME','AWAY','OU'].includes(type)||!Number.isFinite(minute)||minute<0||minute>maxMinute||!Number.isFinite(pressure))throw Error('INVALID_SIGNAL');
return {id:s.id??i,type,minute,sourceX:plotWidth*minute/maxMinute,sourceY:type==='OU'?top+plotHeight/2:top+plotHeight*(1-clamp(pressure,0,100)/100),lane:type==='HOME'?'top':type==='AWAY'?'bottom':null};});
const load={top:entries.filter(x=>x.lane==='top').length,bottom:entries.filter(x=>x.lane==='bottom').length};
for(const e of entries.filter(x=>!x.lane)){e.lane=load.top<=load.bottom?'top':'bottom';load[e.lane]++;}
for(const lane of ['top','bottom']){const group=entries.filter(x=>x.lane===lane).sort((a,b)=>a.sourceX-b.sourceX),n=group.length,width=Math.min(cardWidth,(plotWidth-12-Math.max(n-1,0)*minGap)/Math.max(1,n));if(width<48)throw Error('SIGNAL_DENSITY_OVERFLOW');
const pos=group.map(x=>clamp(x.sourceX-width/2,6,plotWidth-width-6));
for(let i=1;i<n;i++)pos[i]=Math.max(pos[i],pos[i-1]+width+minGap);
const overflow=n?Math.max(0,pos[n-1]+width+6-plotWidth):0;
group.forEach((x,i)=>{x.cardLeft=pos[i]-overflow;x.cardWidth=width;x.cardX=x.cardLeft+width/2;x.cardY=lane==='top'?extra*.52:bottom+extra*.48;});}
return {topPadding:extra,bottomPadding:extra,plotTop:top,plotBottom:bottom,totalHeight:plotHeight+extra*2,entries};}
export function connector({cardX,cardY,sourceX,sourceY}){if(![cardX,cardY,sourceX,sourceY].every(Number.isFinite))throw Error('INVALID_COORDINATE');return {x1:cardX,y1:cardY,x2:sourceX,y2:sourceY};}
