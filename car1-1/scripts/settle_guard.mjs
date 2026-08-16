import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const CURRENT=process.env.CURRENT_PATH||'car1-1/data/public-selections.json';
const HISTORY=process.env.HISTORY_PATH||'car1-1/data/history.json';
const ACTION=process.env.ACTION_PATH||'car1-1/data/cycle-action.txt';
const SOURCE='https://free.goaloo188.com/free/freesoccer';

const readJson=async(p,fallback)=>{try{return JSON.parse(await fs.readFile(p,'utf8'))}catch{return fallback}};
const current=await readJson(CURRENT,null);
if(!current||!Array.isArray(current.matches)||!current.matches.length){await fs.writeFile(ACTION,'SELECT\n');process.exit(0)}

const pending=current.matches.filter(m=>!['WIN','LOSS'].includes(String(m.status||'').toUpperCase()));
if(!pending.length){
  const history=await readJson(HISTORY,[]);
  const key=String(current.selectionDate||current.generatedAtUtc||'');
  if(!history.some(x=>String(x.selectionDate||x.generatedAtUtc||'')===key))history.unshift(current);
  await fs.mkdir(HISTORY.split('/').slice(0,-1).join('/')||'.',{recursive:true});
  await fs.writeFile(HISTORY,JSON.stringify(history.slice(0,365),null,2)+'\n');
  await fs.writeFile(ACTION,'SELECT\n');
  process.exit(0);
}

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({locale:'en-US',timezoneId:'Asia/Bangkok',viewport:{width:1365,height:900}});
const r=await page.goto(SOURCE,{waitUntil:'domcontentloaded',timeout:60000});
if(!r||r.status()>=400)throw new Error(`result feed HTTP ${r?.status()}`);
await page.waitForTimeout(5000);
const rows=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('tr[id^="tr1_"]')].map(tr=>{
 const id=(tr.id.match(/(\d+)$/)||[])[1],td=[...tr.querySelectorAll('td')];
 return [id,{status:(td[3]?.innerText||'').trim(),score:(td[6]?.innerText||'').trim()}];
}).filter(([id])=>id)));
await browser.close();

let changed=false;
for(const m of current.matches){
 if(['WIN','LOSS'].includes(String(m.status||'').toUpperCase()))continue;
 const row=rows[String(m.fixtureId)]; if(!row)continue;
 const final=/\b(?:FT|Finished|Finish|AET|Pen)\b/i.test(row.status||'');
 const sm=String(row.score||'').match(/(\d+)\s*-\s*(\d+)/);
 if(!final||!sm)continue;
 const hg=Number(sm[1]),ag=Number(sm[2]);
 const won=m.pickSide==='home'?hg>ag:ag>hg;
 m.status=won?'WIN':'LOSS';m.finalScore=`${hg}-${ag}`;m.settledAtUtc=new Date().toISOString();changed=true;
}
if(changed){current.updatedAtUtc=new Date().toISOString();await fs.writeFile(CURRENT,JSON.stringify(current,null,2)+'\n')}
const left=current.matches.filter(m=>!['WIN','LOSS'].includes(String(m.status||'').toUpperCase())).length;
if(left>0){await fs.writeFile(ACTION,'HOLD\n');console.log(`hold: ${left} pending`)}else{
 const history=await readJson(HISTORY,[]);const key=String(current.selectionDate||current.generatedAtUtc||'');
 if(!history.some(x=>String(x.selectionDate||x.generatedAtUtc||'')===key))history.unshift(current);
 await fs.writeFile(HISTORY,JSON.stringify(history.slice(0,365),null,2)+'\n');await fs.writeFile(ACTION,'SELECT\n');console.log('all settled: next cycle enabled')
}
