import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const id=process.env.MATCH_ID||'3061003';
const urls=[
 `https://www.goaloo.com/analysis/${id}`,
 `https://www.goaloo.com/football/match/live-${id}`,
 `https://m.goaloo.com/football/match/live-${id}`,
 `https://www.goaloo.com/oddscomp/${id}`,
 `https://www.goaloo.com/detail/${id}`
];
const b=await chromium.launch({headless:true});
const page=await b.newPage({locale:'en-US',timezoneId:'Asia/Bangkok',viewport:{width:1440,height:1200}});
const out=[];
for(const url of urls){
 let status=null,err=null;
 try{const r=await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});status=r?.status()??null;await page.waitForTimeout(6000);}catch(e){err=String(e?.message||e)}
 out.push({requested:url,status,finalUrl:page.url(),title:await page.title().catch(()=>''),bodyText:await page.locator('body').innerText().catch(()=>''),html:(await page.content().catch(()=>'' )).slice(0,20000),error:err});
}
await fs.mkdir('car1-1/data',{recursive:true});
await fs.writeFile('car1-1/data/match-route-probe.json',JSON.stringify(out,null,2)+'\n');
console.log(out.map(x=>`${x.status} ${x.requested} -> ${x.finalUrl}`).join('\n'));
await b.close();
