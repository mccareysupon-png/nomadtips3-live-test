const fs=require('fs');

const input=process.argv[2];
const output=process.argv[3]||input;
if(!input)throw Error('INPUT_REQUIRED');
let s=fs.readFileSync(input,'utf8');

const NEW_MARKER='B46_EVENTFLOW_SIGNAL_ANNOTATION_20261004';
const OLD_MARKER='B46_EVENTFLOW_SIGNAL_ENTRY_20261002';
if(!s.includes(OLD_MARKER))throw Error('EVENTFLOW_SIGNAL_ENTRY_BASE_MISSING');
if(s.includes(NEW_MARKER))throw Error('ALREADY_PATCHED');

function count(hay,needle){return hay.split(needle).length-1}
function once(from,to,label){const n=count(s,from);if(n!==1)throw Error(`${label}_ANCHOR_COUNT_${n}`);s=s.replace(from,to)}

const beforeFetch=(s.match(/\bfetch\(/g)||[]).length;
once(`const ${OLD_MARKER}=true;`,`const ${OLD_MARKER}=true;\nconst ${NEW_MARKER}=true;`,'ANNOTATION_MARKER');

const start='function signalMarkers(rows,points,current,w,h,pad){';
const end='function renderFlow(f,history,signals=[]){';
const startCount=count(s,start),endCount=count(s,end);
if(startCount!==1||endCount!==1)throw Error(`SIGNAL_MARKER_BLOCK_ANCHOR_${startCount}_${endCount}`);
const a=s.indexOf(start),b=s.indexOf(end,a+start.length);
if(a<0||b<0||b<=a)throw Error('SIGNAL_MARKER_BLOCK_NOT_FOUND');

const replacement=String.raw`function signalAnnotationLines(s){
  const market=signalMarket(s),pick=String(s?.selection||s?.providerLineSide||'').trim().toUpperCase(),line=signalLineText(s),odds=num(s?.odds),book=String(s?.bookmaker||'').trim();
  const choice=[pick,line].filter(Boolean).join(' '),primary=[market,choice].filter(Boolean).join(' · '),secondary=[odds===null?'':'@'+odds.toFixed(2),book].filter(Boolean).join(' · ');
  return [primary||'SIGNAL',secondary].filter(Boolean)
}
function signalMarkers(rows,points,current,w,h,pad){
  const grouped=new Map();for(const s of Array.isArray(rows)?rows:[]){const m=signalMinute(s);if(m===null||m<0||m>current+.75)continue;const key=(Math.round(m*10)/10).toFixed(1);if(!grouped.has(key))grouped.set(key,{minute:m,rows:[]});grouped.get(key).rows.push(s)}
  const placed=[];let i=0,out='';for(const g of grouped.values()){
    const x=xFor(g.minute,w,pad,current),p=pressureAt(points,g.minute),ys=g.rows.map(s=>{const side=signalSide(s);return yFor(side?p[side]:(p.home+p.away)/2,h,pad)}),y=ys.reduce((a,v)=>a+v,0)/Math.max(1,ys.length),count=g.rows.length,label=count>1?'SIGNAL ×'+count:'SIGNAL',details=g.rows.map(signalTitle).join(' | '),fresh=g.rows.some(s=>{const t=num(s?.createdAt);return t!==null&&Date.now()-t>=0&&Date.now()-t<12000});
    let detailLines=[];for(const row of g.rows)detailLines.push(...signalAnnotationLines(row));
    if(detailLines.length>8){const hidden=detailLines.length-7;detailLines=detailLines.slice(0,7).concat('+'+hidden+' more detail line'+(hidden===1?'':'s'))}
    const header=label+' '+Math.round(g.minute)+"'",maxChars=Math.max(header.length,...detailLines.map(v=>String(v).length),12),boxW=clamp(26+maxChars*6.15,174,306),rawH=32+detailLines.length*14,boxH=Math.min(rawH,h-pad.top-pad.bottom-8),gap=18,plotLeft=pad.left+4,plotRight=w-pad.right-4;
    const preferLeft=x>w*.58||x+gap+boxW>plotRight,boxX=clamp(preferLeft?x-gap-boxW:x+gap,plotLeft,plotRight-boxW);
    let boxY=y-boxH-18;if(boxY<pad.top+4)boxY=y+18;boxY=clamp(boxY,pad.top+4,h-pad.bottom-boxH-4);
    for(let attempt=0;attempt<8;attempt++){
      const clash=placed.find(r=>boxX<r.x+r.w+7&&boxX+boxW+7>r.x&&boxY<r.y+r.h+7&&boxY+boxH+7>r.y);
      if(!clash)break;
      const down=clash.y+clash.h+8,up=clash.y-boxH-8,maxY=h-pad.bottom-boxH-4,minY=pad.top+4;
      if(down<=maxY)boxY=down;else if(up>=minY)boxY=up;else boxY=clamp(boxY+(i%2?-(boxH+8):(boxH+8)),minY,maxY)
    }
    placed.push({x:boxX,y:boxY,w:boxW,h:boxH});
    const edgeX=preferLeft?boxX+boxW:boxX,edgeY=clamp(y,boxY+10,boxY+boxH-10),elbowX=x+(edgeX>x?9:-9),textX=boxX+12,headerY=boxY+17;
    const lineText=detailLines.map((line,n)=>'<text x="'+textX.toFixed(1)+'" y="'+(headerY+16+n*14).toFixed(1)+'" font-size="10.5" font-weight="650" fill="#d9f8ea">'+esc(line)+'</text>').join('');
    out+='<g class="b46-eventflow-signal-entry b46-eventflow-signal-annotation" data-signal-minute="'+g.minute.toFixed(2)+'" data-annotation-side="'+(preferLeft?'left':'right')+'" role="group" aria-label="'+esc(details)+'"><title>'+esc(details)+'</title><line x1="'+x.toFixed(1)+'" y1="'+pad.top+'" x2="'+x.toFixed(1)+'" y2="'+(h-pad.bottom)+'" stroke="#0aa86e" stroke-width="1" stroke-dasharray="4 5" opacity=".30" vector-effect="non-scaling-stroke"/><polyline points="'+x.toFixed(1)+','+y.toFixed(1)+' '+elbowX.toFixed(1)+','+y.toFixed(1)+' '+edgeX.toFixed(1)+','+edgeY.toFixed(1)+'" fill="none" stroke="#0acb7c" stroke-width="1.6" opacity=".82" vector-effect="non-scaling-stroke"/><rect x="'+boxX.toFixed(1)+'" y="'+boxY.toFixed(1)+'" width="'+boxW.toFixed(1)+'" height="'+boxH.toFixed(1)+'" rx="7" fill="#071b16" fill-opacity=".93" stroke="#0acb7c" stroke-width="1.2" vector-effect="non-scaling-stroke"/><text x="'+textX.toFixed(1)+'" y="'+headerY.toFixed(1)+'" font-size="11.5" font-weight="850" fill="#61f2b3">'+esc(header)+'</text>'+lineText+'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="5.4" fill="#0acb7c" stroke="#ffffff" stroke-width="2.2" vector-effect="non-scaling-stroke"/>'+(fresh?'<circle cx="'+x.toFixed(1)+'" cy="'+y.toFixed(1)+'" r="7" fill="none" stroke="#0acb7c" stroke-width="1.5" opacity=".65" vector-effect="non-scaling-stroke"><animate attributeName="r" values="7;12;7" dur="1.2s" repeatCount="4"/><animate attributeName="opacity" values=".65;.08;.65" dur="1.2s" repeatCount="4"/></circle>':'')+'</g>';i++
  }return out
}
`;

s=s.slice(0,a)+replacement+s.slice(b);
const afterFetch=(s.match(/\bfetch\(/g)||[]).length;
if(beforeFetch!==afterFetch)throw Error(`FETCH_COUNT_CHANGED_${beforeFetch}_${afterFetch}`);
for(const marker of [OLD_MARKER,NEW_MARKER,'function signalAnnotationLines','b46-eventflow-signal-annotation','data-annotation-side'])if(!s.includes(marker))throw Error('PATCH_MARKER_MISSING_'+marker);
if(count(s,'function signalMarkers(rows,points,current,w,h,pad){')!==1)throw Error('SIGNAL_MARKERS_FUNCTION_COUNT_BAD');
fs.writeFileSync(output,s);
console.log(JSON.stringify({ok:true,beforeFetch,afterFetch,inputBytes:fs.statSync(input).size,outputBytes:Buffer.byteLength(s),marker:NEW_MARKER}));
