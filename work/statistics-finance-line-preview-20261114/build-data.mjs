// Offline design input only: exact existing financial functions, no new service.
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {outcome,isSettled,familyOf,dateMs} from '../statistics-read-model-v2-20261114/read-model.mjs';
const base=new URL('../statistics-read-model-v2-20261114/qa/',import.meta.url),out=new URL('./',import.meta.url),input=JSON.parse(await readFile(new URL('live-ledger.json',base),'utf8')),source=await readFile(new URL('live-base/performance.js',base),'utf8'),lines=source.split('\n'),ctx={window:{BALL46_STATISTICS_DATA:{outcome}},Intl,Date},reg={window:{}};
const sha=b=>createHash('sha256').update(b).digest('hex');assert.equal(sha(source),'822f3d9d271a948d6b862eb7732f8797dcedbcc743cd63f3094f217b537b22bf');
vm.runInNewContext([lines[8],lines[9],lines[23],lines[24],lines[27],...lines.slice(50,54),...lines.slice(55,69),'this.api={stats,dailyUnitPoints};'].join('\n'),ctx);
vm.runInNewContext(await readFile(new URL('live-base/registry.js',base),'utf8'),reg);
const now=Date.parse(input.ended),views={},markets=['all','1x2','ah','ou','btts','corners','cards','other'];
function dailyLast(points){const days=new Map(),format=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'});for(const p of points)days.set(format.format(new Date(p.date)),{date:p.date,value:p.value});return[...days.values()]}
for(const market of markets){views[market]={};for(const range of ['all',7,30,90]){const rows=input.rows.filter(r=>isSettled(r)&&(market==='all'||familyOf(r,reg.window.BALL46_MARKET_REGISTRY)===market)&&(range==='all'||dateMs(r.settledAt??r.createdAt)>=now-range*86400000)).sort((a,b)=>dateMs(a.settledAt??a.createdAt)-dateMs(b.settledAt??b.createdAt));const s=ctx.api.stats(rows),units=ctx.api.dailyUnitPoints(s.unitPoints).map(p=>({date:p.lastDate,value:p.close})),roi=dailyLast(s.roiPoints),rate=dailyLast(s.ratePoints);if(units.length)assert(Math.abs(units.at(-1).value-s.net)<1e-7);if(roi.length)assert(Math.abs(roi.at(-1).value-s.roi)<1e-7);const weightedRate=s.wins+s.losses?s.ratePoints.at(-1).value:null;views[market][range]={metrics:{settled:s.rows,net:s.net,roi:s.roi,rate:weightedRate,odds:s.avgOdds,maxDD:s.maxDD,stake:s.stake},points:{units,roi,rate}};}}
const data={recordedAt:input.ended,sourceRows:input.rows.length,formulaSha:sha(source),live:false,views};await writeFile(new URL('data.json',out),JSON.stringify(data));console.log('PREVIEW_DATA',JSON.stringify({sourceRows:input.rows.length,recordedAt:input.ended,formulaChanges:0,views:32,bytes:Buffer.byteLength(JSON.stringify(data))}));
