import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const input=process.argv[2],output=process.argv[3];
assert(input&&output,'usage: node patch.mjs input.js output.js');
const source=fs.readFileSync(input,'utf8');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
assert.equal(sha(source),'eb4937cb82f438840da33ccbd303c42aa4536ade80dfb9634f56a104d7e41076','SOURCE_CHANGED_RESCOUT');
const a=source.indexOf('function signalMarkers(rows,points,current,w,h,pad){');
const b=source.indexOf('/* EVENT FLOW Mobile V2:',a);
assert(a>=0&&b>a,'RENDERER_ANCHOR_MISSING');
const original=source.slice(a,b);
let patch=original;
const once=(from,to)=>{assert.equal(patch.split(from).length,2,'ANCHOR_NOT_UNIQUE: '+from.slice(0,100));patch=patch.replace(from,to)};
once("const grouped=new Map();for(const s of Array.isArray(rows)?rows:[]){const m=signalMinute(s);if(m===null||m<0||m>current+.75)continue;const key=(Math.round(m*10)/10).toFixed(1);if(!grouped.has(key))grouped.set(key,{minute:m,rows:[]});grouped.get(key).rows.push(s)}",
"const entries=mobileSignalEntries(Array.isArray(rows)?rows:[],current);");
once("const placed=[];let i=0,out='';for(const g of grouped.values()){",
"const placed=[];let i=0,out='';for(const entry of entries){const g={minute:entry.minute,rows:[entry.s]};");
const layoutStart=patch.indexOf('const preferLeft=x>w*.58');
const layoutEnd=patch.indexOf('placed.push({x:boxX,y:boxY,w:boxW,h:boxH});',layoutStart);
assert(layoutStart>=0&&layoutEnd>layoutStart,'LAYOUT_ANCHOR_MISSING');
const layout=String.raw`const preferredLeft=x>w*.58||x+gap+boxW>plotRight;
    const minX=plotLeft,maxX=plotRight-boxW,minY=pad.top+4,maxY=h-pad.bottom-boxH-4;
    const initialX=clamp(preferredLeft?x-gap-boxW:x+gap,minX,maxX);
    let initialY=y-boxH-18;if(initialY<minY)initialY=y+18;initialY=clamp(initialY,minY,maxY);
    let boxX=initialX,boxY=initialY;
    const fits=(cx,cy)=>!placed.some(r=>cx<r.x+r.w+7&&cx+boxW+7>r.x&&cy<r.y+r.h+7&&cy+boxH+7>r.y);
    if(!fits(boxX,boxY)){
      const xs=[initialX,clamp(preferredLeft?x+gap:x-gap-boxW,minX,maxX),minX,maxX];
      const ys=[initialY,minY,maxY];
      for(const r of placed){xs.push(clamp(r.x-boxW-8,minX,maxX),clamp(r.x+r.w+8,minX,maxX));ys.push(clamp(r.y-boxH-8,minY,maxY),clamp(r.y+r.h+8,minY,maxY))}
      let best=null;
      for(const cx of new Set(xs))for(const cy of new Set(ys)){if(!fits(cx,cy))continue;const cost=(cx-initialX)**2+(cy-initialY)**2;if(!best||cost<best.cost)best={cx,cy,cost}}
      if(best){boxX=best.cx;boxY=best.cy}
    }
    const preferLeft=boxX+boxW/2<=x;
    `;
patch=patch.slice(0,layoutStart)+layout+patch.slice(layoutEnd);
once("data-annotation-side=\"'+(preferLeft?'left':'right')+'\" role=\"group\"", "data-annotation-side=\"'+(preferLeft?'left':'right')+'\" data-signal-id=\"'+esc(entry.key)+'\" role=\"group\"");
const candidate=source.slice(0,a)+patch+source.slice(b);
assert.equal((candidate.match(/\bfetch\(/g)||[]).length,(source.match(/\bfetch\(/g)||[]).length,'NETWORK_CALL_COUNT_CHANGED');
assert.equal(candidate.slice(0,a),source.slice(0,a));
assert.equal(candidate.slice(a+patch.length),source.slice(b));
const mobileA=source.indexOf('function mobileSignalEntries('),mobileB=source.indexOf('function mobileFlowStyle(',mobileA);
assert(mobileA>=0&&mobileB>mobileA,'MOBILE_IDENTITY_HELPER_MISSING');
const mobile=source.slice(mobileA,mobileB);
const helpers={
  signalMinute:s=>Number(s.minute), signalSide:s=>s.selection==='HOME'?'home':s.selection==='AWAY'?'away':null,
  signalTitle:s=>[s.market,s.selection,s.line,s.odds,s.bookmaker].join(' '),
  signalAnnotationLines:s=>[[s.market,s.selection,s.line].filter(v=>v!=null).join(' · '),'@'+s.odds.toFixed(2)+' · '+s.bookmaker],
  xFor:(m,w,p,c)=>p.left+(w-p.left-p.right)*m/c,
  yFor:(v,h,p)=>p.top+(h-p.top-p.bottom)*(100-v)/99,
  pressureAt:(_points,m)=>({home:m%2?60:75,away:m%2?40:25}),
  num:v=>v==null?null:Number(v), clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
  esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
};
const compile=block=>new Function(...Object.keys(helpers),mobile+'\n'+block+'\nreturn signalMarkers;')(...Object.values(helpers));
const oldRender=compile(original),render=compile(patch);
const row=(id,minute,market,selection,line,odds,bookmaker)=>({id,fixtureId:'qa-only',minute,market,selection,line,odds,bookmaker});
const rows=[row('home48',48,'1X2','HOME',null,1.4,'Bet 365'),row('away63',63,'AH','AWAY',0,2.1,'Bet 365'),row('over63',63,'O/U','OVER',4.5,2.03,'Vcbet')];
const pad={left:42,right:18,top:14,bottom:30};
const w=1000,h=232,current=83,points=[];
const count=s=>(s.match(/class="b46-eventflow-signal-entry b46-eventflow-signal-annotation"/g)||[]).length;
const rects=s=>Array.from(s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g),m=>({x:+m[1],y:+m[2],w:+m[3],h:+m[4]}));
const overlaps=rs=>rs.some((r,i)=>rs.slice(i+1).some(t=>r.x<t.x+t.w&&r.x+r.w>t.x&&r.y<t.y+t.h&&r.y+r.h>t.y));
const check=(name,signals,expected,width=w,height=h)=>{
 const svg=render(signals,points,current,width,height,pad),rs=rects(svg);
 assert.equal(count(svg),expected,name+' CARD_COUNT');assert.equal(rs.length,expected,name+' RECT_COUNT');
 assert.equal(new Set(Array.from(svg.matchAll(/data-signal-id="([^"]+)"/g),m=>m[1])).size,expected,name+' ID_COUNT');
 assert(!overlaps(rs),name+' OVERLAP');
 for(const r of rs)assert(r.x>=pad.left&&r.y>=pad.top&&r.x+r.w<=width-pad.right+.1&&r.y+r.h<=height-pad.bottom+.1,name+' BOUNDS');
 return {name,cards:expected,overlap:false,rects:rs};
};
assert.equal(count(oldRender(rows,points,current,w,h,pad)),2,'ORIGINAL_BUG_NOT_REPRODUCED');
const result=[check('screenshot 48 / 63 / 63',rows,3),check('three same minute',[...rows.map(s=>({...s,minute:63}))],3),check('four same minute',[...rows.map(s=>({...s,minute:63})),row('under63',63,'O/U','UNDER',4.5,1.85,'Bet 365')],4),check('single',rows.slice(0,1),1),check('future excluded',[...rows,row('future',85,'AH','HOME',0,1.8,'Bet 365')],3),check('desktop narrow logical viewport',rows,3,760,232)];
const svg=render(rows,points,current,w,h,pad);
assert.equal((svg.match(/data-signal-minute="63.00"/g)||[]).length,2);
assert(svg.includes('2.10')&&svg.includes('2.03')&&svg.includes('Vcbet'));
const report={mode:'TEST_ONLY_PUBLIC_ASSET_PATCH',originalHash:sha(source),candidateHash:sha(candidate),oldCards:2,newCards:3,tests:result,limits:'Geometry checked with standalone deterministic fixture; not full live DOM, mobile or high-density layout validation. No deploy.'};
fs.writeFileSync(output,candidate);
fs.writeFileSync(output+'.report.json',JSON.stringify(report,null,2));
fs.writeFileSync(output+'.preview.html','<!doctype html><html><meta charset="utf-8"><title>Event Flow standalone QA</title><body style="background:#071b16;color:#eee;font-family:system-ui"><h2>TEST ONLY · Adana Demirspor / Kastamonuspor</h2><p>48′ — 1X2 HOME; 63′ — AH AWAY and O/U OVER. Replayed fixture; not live.</p><svg viewBox="0 0 1000 232" width="100%" style="max-width:1000px;background:#0c211a">'+svg+'</svg></body></html>');
console.log('EVENTFLOW_SAME_MINUTE_TEST_PASS '+JSON.stringify(report));
