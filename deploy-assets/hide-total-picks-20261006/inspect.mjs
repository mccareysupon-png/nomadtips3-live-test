import { inspect, publicFile, sha } from '../daily-performance-20261005/production.mjs';
const current=await inspect();
const b=await publicFile('/index.html','html');
const html=b.toString('utf8');
const hits=[];
let i=0;
while((i=html.indexOf('TOTAL PICKS',i))>=0){
  hits.push({i,context:html.slice(Math.max(0,i-500),Math.min(html.length,i+700))});
  i+=11;
}
console.log(JSON.stringify({activeVersion:current.restore.version,indexSha:sha(b),count:hits.length,hits},null,2));