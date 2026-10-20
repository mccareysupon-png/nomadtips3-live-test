import assert from 'node:assert/strict';
export const PATCH_ID='B46_MOBILE_ULTRASOFT_EVENTFLOW_20261020';
export const MOBILE_HELPERS=String.raw\`
function b46MobileSoftPoints20261020(points,key){
  return points.map((p,i)=>{
    let sum=0,weight=0;
    for(let j=0;j<points.length;j++){
      const dt=Math.abs(Number(p.minute)-Number(points[j].minute));
      if(!Number.isFinite(dt)||dt>5)continue;
      const w=6-dt;sum+=Number(points[j][key])*w;weight+=w;
    }
    return {minute:p.minute,value:weight?Math.max(1,Math.min(100,sum/weight)):Number(p[key])};
  });
}
function b46MobileSoftSvg20261020(points,key,w,h,pad,current,fill){
  if(!points.length)return'';
  if(points.length===1)return fill?areaLine(points,key,w,h,pad,current):pathLine(points,key,w,h,pad,current);
  const sm=b46MobileSoftPoints20261020(points,key);
  const pp=sm.map(p=>[xFor(p.minute,w,pad,current),yFor(p.value,h,pad)]);
  const d=pp.slice(1).map((p,i)=>(p[1]-pp[i][1])/(p[0]-pp[i][0]||.00001));
  const t=pp.map((p,i)=>{
    if(i===0)return d[0];if(i===pp.length-1)return d[d.length-1];
    const a=d[i-1],b=d[i];if(a*b<=0)return 0;
    return 2*a*b/(a+b);
  });
  for(let i=0;i<d.length;i++){
    if(Math.abs(d[i])<1e-8){t[i]=0;t[i+1]=0;continue;}
    const a=t[i]/d[i],b=t[i+1]/d[i],q=a*a+b*b;
    if(q>9){const scale=3/Math.sqrt(q);t[i]*=scale;t[i+1]*=scale;}
  }
  const coord=(x,y)=>x.toFixed(2)+' '+y.toFixed(2);
  let path='M '+coord(pp[0][0],pp[0][1]);
  for(let i=0;i<pp.length-1;i++){
    const p=pp[i],q=pp[i+1],dx=(q[0]-p[0])/3;
    path+=' C '+coord(p[0]+dx,p[1]+dx*t[i])+' '+coord(q[0]-dx,q[1]-dx*t[i+1])+' '+coord(q[0],q[1]);
  }
  if(!fill)return path;
  const base=yFor(1,h,pad);
  return 'M '+coord(pp[0][0],base)+' L '+coord(pp[0][0],pp[0][1])+path.slice(path.indexOf(' C '))+' L '+coord(pp[pp.length-1][0],base)+' Z';
}
\`;
export function patchFlowJs(source){
 assert.equal(typeof source,'string','JS_SOURCE_MISSING');
 assert(!source.includes(PATCH_ID),'PREVIOUS_ULTRA_SOFT_PRESENT');
 const fn='function renderMobileFlow(f,history,signals){';
 assert.equal(source.split(fn).length,2,'MOBILE_RENDER_ENTRY_DRIFT');
 const pos=source.indexOf(fn);
 const begin=source.indexOf("  const paths=['home','away'].map(",pos);
 const end=source.indexOf('\n  return head+legend',begin);
 assert(begin>pos&&end>begin&&end-begin<2000,'MOBILE_PATHS_LAYOUT_DRIFT');
 const old=source.slice(begin,end);
 for(const needle of ['pathLine(points,key,w,h,pad,current)','areaLine(points,key,w,h,pad,current)','class="expand-flow-line '+'' ]){assert(old.includes(needle)||needle.includes('class="'),'ORIGINAL_CHART_PATH_MISSING '+needle);}
 const replacement=String.raw\`  /* B46_MOBILE_ULTRASOFT_EVENTFLOW_20261020: display-only 11-min trend, raw data and signals stay unchanged */
  const glow='<defs><filter id="b46-mf-soft-'+safe+'" x="-25%" y="-80%" width="150%" height="260%"><feGaussianBlur stdDeviation="1.7"/></filter></defs>';
  const paths=['home','away'].map((key,i)=>{
    const d=b46MobileSoftSvg20261020(points,key,w,h,pad,current,false);
    const area=b46MobileSoftSvg20261020(points,key,w,h,pad,current,true);
    const color=i?'#edcb69':'#4ce0a0',size=i?'0.95':'1.05';
    return '<path d="'+area+'" fill="url(#e'+(i?'a':'h')+'-'+safe+')" class="expand-flow-area" opacity=".45"/>'
      +'<path d="'+d+'" fill="none" stroke="'+color+'" stroke-width="3.2" stroke-opacity=".29" filter="url(#b46-mf-soft-'+safe+')" stroke-linejoin="round" stroke-linecap="round" pointer-events="none"/>'
      +'<path d="'+d+'" class="expand-flow-line '+key+'" fill="none" style="stroke:'+color+';stroke-width:'+size+'px;stroke-linecap:round;stroke-linejoin:round" />';
  }).join('');\`;
 let out=source.slice(0,begin)+replacement+source.slice(end);
 const returnAnchor="+'<div class=\"expand-flow-chart b46-mf-chart\"><svg";
 const anchor="+'</svg></div>'+mobileFlowPanel(entries,selected);";
 assert(out.includes(anchor),'MOBILE_SVG_RETURN_DRIFT');
 const sequence='+defs+mobileFlowGrid(w,h,pad,current)+paths+mobileFlowMarkers(';
 assert.equal(out.split(sequence).length,2,'MOBILE_SVG_DEF_GRID_DRIFT');
 out=out.replace(sequence,'+defs+glow+mobileFlowGrid(w,h,pad,current)+paths+mobileFlowMarkers(');
 out=out.replace(fn,MOBILE_HELPERS+'\n'+fn);
 assert.equal(out.split(PATCH_ID).length,2,'PATCH_MARKER_INVALID');
 assert(out.includes('function renderFlow(f,history,signals=[]){')&&out.includes('if(mobileFlowQuery.matches)return renderMobileFlow('),'DESKTOP_PATH_DRIFT');
 return out;
}
export function verifySoftCurve(){
 const xFor=(m,w,p,c)=>p.left+m/c*(w-p.left-p.right);
 const yFor=(v,h,p)=>p.top+(100-v)/99*(h-p.top-p.bottom);
 const pathLine=(pts,k,w,h,p,c)=>pts.map((v,i)=>(i?'L':'M')+xFor(v.minute,w,p,c)+' '+yFor(v[k],h,p)).join(' ');
 const areaLine=(pts,k,w,h,p,c)=>pathLine(pts,k,w,h,p,c)+' Z';
 const make=new Function('xFor','yFor','areaLine','pathLine',MOBILE_HELPERS+'\nreturn {b46MobileSoftPoints20261020,b46MobileSoftSvg20261020};');
 const {b46MobileSoftPoints20261020:smooth,b46MobileSoftSvg20261020:svg}=make(xFor,yFor,areaLine,pathLine);
 const raw=Array.from({length:81},(_,i)=>({minute:i,home:50+(i%2?39:-39),away:50+(i%2?-28:28)}));
 const baseline=JSON.stringify(raw),values=smooth(raw,'home'),pad={left:36,right:20,top:22,bottom:30};
 assert.equal(JSON.stringify(raw),baseline,'RAW_PRESSURE_MUTATED');
 const amplitude=Math.max(...values.map(v=>v.value))-Math.min(...values.map(v=>v.value));
 assert(amplitude<28,'ELEVEN_MINUTE_SMOOTHING_TOO_WEAK');
 const stroke=svg(raw,'home',360,300,pad,80,false),area=svg(raw,'home',360,300,pad,80,true);
 assert(stroke.startsWith('M ')&&stroke.includes(' C ')&&!stroke.includes('NaN'),'CURVE_INVALID');
 assert(area.startsWith('M ')&&area.endsWith(' Z')&&area.includes(' C '),'AREA_INVALID');
 assert.equal(svg(raw.slice(0,1),'away',360,300,pad,80,false).includes(' C '),false,'ONE_POINT_CHANGED');
 return {rawCount:raw.length,svgCommands:(stroke.match(/ C /g)||[]).length,range:+amplitude.toFixed(2),rawDataPreserved:true};
}
