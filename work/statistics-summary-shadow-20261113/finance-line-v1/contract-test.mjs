import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {Script,createContext} from 'node:vm';
const D='work/statistics-summary-shadow-20261113';
const old=await readFile(D+'/reference/longterm-performance-343.js','utf8');
const code=await readFile(D+'/finance-line-v1/chart.js','utf8');
new Script(code,{filename:'finance-line-v1.js'});
const section=(t,a,b)=>{const i=t.indexOf(a),j=t.indexOf(b,i+a.length);assert(i>=0&&j>i,'MISSING_SECTION_'+a);return t.slice(i,j)};
for(const [a,b] of [
 ['const RANGE_DAYS','let rowsCache'],
 ['function marketDef','function yScale'],
 ['function bangkokDayKey','function unitViewFor'],
 ['function tipMarkup','function bindChart']
])assert.equal(section(code,a,b==='function unitViewFor'?'function financeSamples':b),section(old,a,b),'DATA_FORMULA_OR_DETAIL_DRIFT:'+a);
for(const x of ['data-b46-chart-type','b46-perf-unit-nav','unitCandlesSvg(','addEventListener(\'wheel\'','beginDrag(','data-b46-hover-hline','data-b46-perf-ybadge','data-b46-perf-xbadge'])assert(!code.includes(x),'OLD_INTERACTION_PRESENT:'+x);
for(const x of ['data-b46-finance-line','financeSamples(','requestAnimationFrame(paint)','tipMarkup(p,idx','b46-perf-line','b46-perf-area','AVG ODDS','MAX DRAWDOWN','WIN RATE','ROI','STAKE'])assert(code.includes(x),'NEW_LINE_OR_KPI_MISSING:'+x);
const run=t=>{
 const script=t.replace(/\}\)\(\);\s*$/, "window.__test={stats,chartHtml,financeSamples:typeof financeSamples==='function'?financeSamples:null,setMetric:v=>metric=v};})();");
 assert.notEqual(script,t,'END_OF_SOURCE_DRIFT');
 const window={innerWidth:390,addEventListener(){},BALL46_STATISTICS_DATA:{outcome:r=>r.result},BALL46_MARKET_REGISTRY:{resolve:()=>null}};
 const document={readyState:'loading',addEventListener(){}};
 const ctx=createContext({window,document,navigator:{language:'en-GB'},Intl,Date,URLSearchParams,console});
 new Script(script).runInContext(ctx);
 assert(window.__test,'TEST_EXPORT_MISSING');return window.__test;
};
const base=run(old),candidate=run(code);
const cases=['WIN','LOSS','PUSH','HALF_WIN','HALF_LOSS'];
const rows=Array.from({length:15003},(_,i)=>({id:'QA'+i,result:cases[i%5],status:'SETTLED',market:['1x2','ah','ou','corners','cards','btts','other'][i%7],createdAt:Date.UTC(2024,0,1)+i*46000,settledAt:Date.UTC(2024,0,1)+i*46000,odds:i%31===0?null:1.8+(i%9)/10,selection:'HOME',home:{name:'Home FC'},away:{name:'Away FC'}}));
const flat=o=>JSON.parse(JSON.stringify(o));
const before=flat(base.stats(rows)),after=flat(candidate.stats(rows));
assert.deepEqual(after,before,'FINANCIAL_KPI_PARITY');
const res=[];
for(const mode of ['units','roi','rate']){
 candidate.setMetric(mode);
 const html=candidate.chartHtml(after);
 assert(html.includes('data-b46-finance-line="1"'),'NOT_LINE_'+mode);
 assert(!html.includes('data-b46-candle'),'CANDLE_RENDERED');
 const plot=Number(html.match(/data-b46-plot-points="(\d+)"/)?.[1]);
 const full=Number(html.match(/data-b46-source-points="(\d+)"/)?.[1]);
 assert(plot>0&&plot<=480,'OVERDRAW_'+mode+':'+plot);
 assert(full>=plot,'POINT_COUNT_'+mode);
 res.push({metric:mode,sourcePoints:full,renderPoints:plot});
}
const series=Array.from({length:15003},(_,i)=>({value:100*Math.sin(i/37)+(i%7===0?40:0),date:i}));
const samples=candidate.financeSamples(series,480);
assert(samples.length<=480,'DECIMATION_BUDGET');
assert.equal(samples[0].sourceIndex,0);
assert.equal(samples.at(-1).sourceIndex,series.length-1);
assert.deepEqual([...samples].map(p=>p.sourceIndex).sort((a,b)=>a-b),samples.map(p=>p.sourceIndex),'SAMPLE_ORDER');
assert(samples.some(p=>p.value===Math.min(...series.map(p=>p.value))),'GLOBAL_MIN_LOST');
assert(samples.some(p=>p.value===Math.max(...series.map(p=>p.value))),'GLOBAL_MAX_LOST');
const output={ok:true,rows:rows.length,modes:res,statisticalFormulasIdentical:true,fullFinancialParity:true,sourceBytes:Buffer.byteLength(old),candidateBytes:Buffer.byteLength(code),sourceGzip:gzipSync(old).length,candidateGzip:gzipSync(code).length,scope:'TEST_SOURCE_ONLY',productionWrites:0,providerRequests:0};
await mkdir(D+'/qa/finance-line-v1',{recursive:true});
await writeFile(D+'/qa/finance-line-v1/contract.json',JSON.stringify(output,null,2));
console.log('FINANCE_LINE_QA '+JSON.stringify(output));

// Trigger deterministic TEST-only formula and browser verification.
