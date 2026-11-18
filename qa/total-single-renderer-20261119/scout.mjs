import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
const puppeteer=(await import(pathToFileURL(process.env.PUPPETEER_ENTRY).href)).default;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync('audit',{recursive:true});
const origin='https://ball46.com';
const sourceReport=[];
const pattern=/cumulative units|signal outcomes|b46-statistics-card|statistics-fast-v1|cumulativeUnits|settled signals|statistics-card-ui|win rate/i;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:1440,height:950});await page.setCacheEnabled(false);
 await page.evaluateOnNewDocument(()=>{
  const log=window.__b46TotalTrace=[];
  const match=/cumulative units|signal outcomes|settled signals|cumulative profit|win rate/i;
  const compact=x=>String(x??'').replace(/\s+/g,' ').slice(0,220);
  function note(kind,el,value){
   if(log.length>=1800||!el)return;
   const attrs=String(el.id||'')+' '+String(typeof el.className==='string'?el.className:'');
   const sample=typeof value==='string'?value.slice(0,20000):String(value?.textContent||'').slice(0,10000);
   if(!match.test(sample)&&!(/stat|kpi|performance|summary/i.test(attrs)&&match.test(String(el.textContent||'').slice(0,9000))))return;
   log.push({t:Math.round(performance.now()),kind,target:el.tagName+'#'+attrs,sample:compact(sample),stack:String(new Error().stack||'').split('\n').slice(3,9).join('\n')});
  }
  const prop=(proto,name)=>{const d=Object.getOwnPropertyDescriptor(proto,name);if(!d?.set||!d.configurable)return;Object.defineProperty(proto,name,{...d,set(v){note(name,this,v);return d.set.call(this,v)}})};
  prop(Element.prototype,'innerHTML');prop(Node.prototype,'textContent');
  for(const k of ['appendChild','replaceChild','removeChild','insertBefore']){const f=Node.prototype[k];Node.prototype[k]=function(...args){note(k,this,args[0]);return f.apply(this,args)}}
  for(const k of ['replaceChildren','append','prepend']){const f=Element.prototype[k];if(f)Element.prototype[k]=function(...args){note(k,this,args[0]);return f.apply(this,args)}}
 });
 const pending=[];
 page.on('response',r=>{
  const u=new URL(r.url());if(u.hostname!=='ball46.com')return;
  if(!(/\.js$/.test(u.pathname)||r.request().resourceType()==='document'||(/statistic|summary/.test(u.pathname)&&u.pathname.startsWith('/api/'))))return;
  pending.push((async()=>{try{let body=await r.text();let e={url:r.url(),status:r.status(),hash:sha(body),size:body.length};if(!u.pathname.startsWith('/api/')){const lines=body.split('\n');e.matches=[];for(let i=0;i<lines.length;i++)if(pattern.test(lines[i])){let line=lines[i],at=line.search(pattern);e.matches.push({line:i+1,text:line.slice(Math.max(0,at-100),at+200)});if(e.matches.length>=35)break;}const file=u.pathname.replace(/[^a-zA-Z0-9._-]/g,'_')||'root';fs.writeFileSync('audit/'+file+'.source.txt',body);}else{try{const j=JSON.parse(body);e.keys=Object.keys(j);e.count=Array.isArray(j.rows)?j.rows.length:undefined}catch{}}sourceReport.push(e)}catch(e){sourceReport.push({url:r.url(),error:String(e)})}})());
 });
 const states=[];
 const snapshot=async label=>{const d=await page.evaluate(()=>{const all=[...document.querySelectorAll('body *')];const exact=all.filter(e=>e.children.length===0&&/^(CUMULATIVE UNITS|SIGNAL OUTCOMES|TOTAL|ALL TIME|WIN RATE)$/i.test((e.textContent||'').trim())).slice(0,35).map(e=>{const p=e.closest('section,article,[class*="card"],[class*="kpi"],[id*="stat"]')||e.parentElement;return {text:e.textContent,tag:e.tagName,id:p?.id,cls:p?.className,visible:!!e.getBoundingClientRect().width,parent:p?.outerHTML.slice(0,1200)}});return {t:Math.round(performance.now()),url:location.href,title:document.title,exact,nav:[...document.querySelectorAll('a,button,[role=tab]')].filter(e=>/^(total|ah|1x2|statistics|stats|o\/u|btts)$/i.test((e.textContent||'').trim())).slice(0,45).map(e=>({text:e.textContent.trim(),href:e.getAttribute('href'),id:e.id,cls:e.className,outer:e.outerHTML.slice(0,350)})),scripts:[...document.scripts].map(e=>e.src||'inline').filter(x=>x!=='inline')};});states.push({label,...d});console.log('STATE '+JSON.stringify({label,...d}));};
 const url=origin+'/statistics.html?b46TotalAudit='+Date.now();
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await snapshot('DOMContentLoaded');
 for(const ms of [500,1000,2000,3500,5500,7000]){await new Promise(r=>setTimeout(r,ms));await snapshot('after_'+ms);}
 await page.screenshot({path:'audit/total.png'});
 const click=async label=>page.evaluate(label=>{const e=[...document.querySelectorAll('button,a,[role=tab]')].find(e=>e.getBoundingClientRect().width>0&&(e.textContent||'').trim().toUpperCase()===label);if(e){e.click();return true}return false},label);
 if(await click('AH')){await new Promise(r=>setTimeout(r,1000));await snapshot('AH');if(await click('TOTAL')){await new Promise(r=>setTimeout(r,100));await snapshot('TOTAL_return_100ms');await new Promise(r=>setTimeout(r,4000));await snapshot('TOTAL_return_4s');}}
 const trace=await page.evaluate(()=>window.__b46TotalTrace||[]);fs.writeFileSync('audit/dom-trace.json',JSON.stringify(trace,null,2));console.log('TRACE '+JSON.stringify(trace.slice(-130)));
 await Promise.allSettled(pending);fs.writeFileSync('audit/source-report.json',JSON.stringify(sourceReport,null,2));fs.writeFileSync('audit/states.json',JSON.stringify(states,null,2));console.log('SOURCES '+JSON.stringify(sourceReport.map(s=>({...s,matches:s.matches?.slice(0,12)}))));
}finally{await browser.close()}
