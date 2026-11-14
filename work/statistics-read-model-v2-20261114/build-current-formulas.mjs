import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export async function buildCurrentFormulas(){
 const base=new URL('./qa/',import.meta.url),html=await readFile(new URL('live-base/index.html',base),'utf8');
 const daily=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes("const CACHE_KEY='b46:daily-performance:shared:v1'"));assert(daily,'DAILY_FORMULAS_MISSING');
 const a=daily.indexOf('function parts('),b=daily.indexOf('function dateLabel(');assert(a>0&&b>a,'DAILY_FORMULA_BOUNDARIES');const pure=daily.slice(a,b);
 assert(!/\b(fetch|document|window|localStorage|eval|Function)\b/.test(pure),'FORMULAS_NOT_PURE');
 const module="const TZ='Europe/London',CUT=6;const sharedFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'});\n"+pure+'\nexport const formulas={aggregate,rate,avgOdds};\n';
 await writeFile(new URL('current-formulas.mjs',base),module);return{sourceSha:createHash('sha256').update(pure).digest('hex'),formulaChanges:0};
}
