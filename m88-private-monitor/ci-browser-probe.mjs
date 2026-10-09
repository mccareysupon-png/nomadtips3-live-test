import { chromium } from 'playwright';
import fs from 'node:fs';

const URL='https://msports.m88.com/app/v2/';
const out={startedAt:new Date().toISOString(),url:URL,page:null,title:null,error:null,responses:[],websockets:[]};
const interesting=u=>/(api|sport|event|match|odds|market|live|fixture|feed)/i.test(u);
const seen=new Set();

function summarize(v,depth=0){
  if(depth>3)return typeof v;
  if(Array.isArray(v))return {type:'array',length:v.length,sample:v.length?summarize(v[0],depth+1):null};
  if(v&&typeof v==='object'){
    const keys=Object.keys(v).slice(0,30);const sample={};
    for(const k of keys.slice(0,12))sample[k]=summarize(v[k],depth+1);
    return {type:'object',keys,sample};
  }
  return typeof v==='string'?v.slice(0,100):v;
}

let browser;
try{
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'en-US',timezoneId:'Asia/Bangkok',userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36'});
  const page=await context.newPage();
  page.on('response',async r=>{
    const u=r.url();const ct=(r.headers()['content-type']||'').toLowerCase();
    if(!interesting(u)&&!ct.includes('json'))return;
    const key=`${r.status()}|${u}`;if(seen.has(key)||out.responses.length>=250)return;seen.add(key);
    const row={url:u,status:r.status(),contentType:ct};
    if(ct.includes('json')){try{const body=await r.json();row.json=summarize(body)}catch{}}
    out.responses.push(row);
  });
  page.on('websocket',ws=>{if(out.websockets.length<50)out.websockets.push({url:ws.url()});});
  const response=await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
  out.page={status:response?.status()??null,url:page.url()};
  await page.waitForTimeout(25000);
  out.title=await page.title().catch(()=>null);
  out.finishedAt=new Date().toISOString();
  await context.close();
}catch(e){out.error=String(e?.stack||e);out.finishedAt=new Date().toISOString();}
finally{if(browser)await browser.close().catch(()=>{});fs.writeFileSync('browser-probe-latest.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));}
