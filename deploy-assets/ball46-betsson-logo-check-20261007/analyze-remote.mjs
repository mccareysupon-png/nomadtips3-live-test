import {writeFileSync,mkdirSync} from 'node:fs';
import {PNG} from 'pngjs';

const url='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/ops/ball46-betsson-affiliate-20261005/assets/affiliate/betsson-logo.png';
mkdirSync('audit',{recursive:true});
const r=await fetch(url,{cache:'no-store'});
if(!r.ok) throw new Error('REMOTE_HTTP:'+r.status);
const buf=Buffer.from(await r.arrayBuffer());
const png=PNG.sync.read(buf);
let minX=png.width,minY=png.height,maxX=-1,maxY=-1,visible=0;
for(let y=0;y<png.height;y++)for(let x=0;x<png.width;x++){
  const i=(y*png.width+x)*4,a=png.data[i+3];
  if(a>8){visible++; if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}
}
const bbox=maxX>=0?{x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}:null;
const report={url,http:r.status,bytes:buf.length,width:png.width,height:png.height,bbox,visiblePixels:visible,
  bboxWidthPct:bbox?+(bbox.w/png.width*100).toFixed(2):0,
  bboxHeightPct:bbox?+(bbox.h/png.height*100).toFixed(2):0};
writeFileSync('audit/betsson-remote.png',buf);
writeFileSync('audit/remote-analysis.json',JSON.stringify(report,null,2));
console.log('BALL46_BETSSON_REMOTE_ANALYSIS',JSON.stringify(report));
