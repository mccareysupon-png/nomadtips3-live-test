import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ORIGIN='https://www.ball46.com';
const OUT='audit/league-flags-readonly';
mkdirSync(OUT,{recursive:true});
const report={startedAt:new Date().toISOString(),origin:ORIGIN,mode:'READ_ONLY',run:process.env.GITHUB_RUN_ID||'local'};
const save=()=>writeFileSync(`${OUT}/report.json`,JSON.stringify(report,null,2));

async function fetchBytes(path){
  const url=new URL(path,ORIGIN);url.searchParams.set('flagAudit',`${report.run}-${Date.now()}`);
  const r=await fetch(url,{headers:{'Cache-Control':'no-cache','User-Agent':'Ball46-League-Flag-ReadOnly-Audit/1.0'},signal:AbortSignal.timeout(60000)});
  const text=await r.text();
  assert(r.ok,`HTTP_${r.status}:${path}`);
  return {text,type:r.headers.get('content-type')||'',url:r.url};
}

function collectSchema(fixtures){
  const topKeys=new Set(),leagueKeys=new Set(),countryPaths=new Map(),leagueSamples=[];
  const add=(path,val)=>{
    if(val===null||val===undefined||typeof val==='object')return;
    const s=String(val).trim();if(!s)return;
    if(!countryPaths.has(path))countryPaths.set(path,new Set());
    const set=countryPaths.get(path);if(set.size<30)set.add(s);
  };
  const walk=(value,path='',depth=0)=>{
    if(depth>5||value===null||value===undefined)return;
    if(Array.isArray(value)){for(const item of value.slice(0,3))walk(item,path+'[]',depth+1);return;}
    if(typeof value!=='object')return;
    for(const [k,v] of Object.entries(value)){
      const p=path?`${path}.${k}`:k;
      if(/country|nation|region|area|territor/i.test(k))add(p,v);
      if(v&&typeof v==='object')walk(v,p,depth+1);
    }
  };
  for(const f of fixtures){
    Object.keys(f||{}).forEach(k=>topKeys.add(k));
    Object.keys(f?.league||{}).forEach(k=>leagueKeys.add(k));
    walk(f);
    if(leagueSamples.length<80){
      leagueSamples.push({
        fixtureId:f?.fixtureId??null,
        league:f?.league??null,
        leagueId:f?.leagueId??f?.competitionId??null,
        competition:f?.competition??null,
        tournament:f?.tournament??null,
        category:f?.category??null
      });
    }
  }
  return {
    topKeys:[...topKeys].sort(),leagueKeys:[...leagueKeys].sort(),
    countryLikePaths:Object.fromEntries([...countryPaths].map(([k,v])=>[k,[...v].sort()])),
    leagueSamples
  };
}

async function main(){
  try{
    const index=await fetchBytes('/index.html');
    const flags=await fetchBytes('/league-flags-343.js');
    report.assets={
      indexBytes:Buffer.byteLength(index.text),
      flagsBytes:Buffer.byteLength(flags.text),
      loaderMatches:[...index.text.matchAll(/league-flags-343\.js[^\"']*/g)].map(m=>m[0]),
      flagVersion:(flags.text.match(/const VERSION='([^']+)'/)||[])[1]||null,
      has143:flags.text.includes('iconCount:ICON_CODES.length'),
      hasMenuSelector:flags.text.includes("'[data-league-filter] > span'")
    };

    const boardRaw=await fetchBytes('/api/engine/board');
    const board=JSON.parse(boardRaw.text);
    assert(board?.ok===true&&Array.isArray(board.fixtures),'BOARD_BAD');
    const fixtures=board.fixtures;
    const labels=[...new Set(fixtures.map(f=>[f?.league?.country,f?.league?.name].filter(Boolean).join(' · ')).filter(Boolean))].sort();
    const countries=[...new Set(fixtures.map(f=>String(f?.league?.country||'').trim()).filter(Boolean))].sort();
    report.board={fixtures:fixtures.length,leagueLabels:labels.length,countries:countries.length,countryNames:countries,labels:labels.slice(0,250),schema:collectSchema(fixtures)};

    const executablePath=process.env.PLAYWRIGHT_EXECUTABLE_PATH;
    assert(executablePath,'PLAYWRIGHT_EXECUTABLE_PATH_MISSING');
    const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
    report.ui=[];
    try{
      for(const vp of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
        const page=await browser.newPage({viewport:{width:vp.width,height:vp.height}});
        const pageErrors=[],failed=[];
        page.on('pageerror',e=>pageErrors.push(e.message));
        page.on('requestfailed',r=>{const u=r.url();if(/league-flags|flag-icons|flagcdn/i.test(u))failed.push({url:u,error:r.failure()?.errorText||'failed'})});
        await page.goto(`${ORIGIN}/index.html?flagAudit=${report.run}-${vp.name}`,{waitUntil:'domcontentloaded',timeout:60000});
        await page.waitForFunction(()=>document.querySelectorAll('[data-league-filter]').length>0,{timeout:60000});
        await page.waitForTimeout(2500);
        const state=await page.evaluate(()=>{
          const api=window.NOMAD_LEAGUE_FLAGS_343||null;
          const buttons=[...document.querySelectorAll('[data-league-filter]')];
          const rows=buttons.map(btn=>{
            const span=btn.querySelector(':scope > span');
            return {
              label:(span?.querySelector('.league-label')?.textContent||span?.textContent||'').trim(),
              code:span?.dataset?.leagueFlagCode||null,
              country:span?.dataset?.leagueCountry||null,
              hasImg:Boolean(span?.querySelector('img.league-flag')),
              hasGlobe:Boolean(span?.querySelector('.league-globe'))
            };
          });
          const countBy=(pred)=>rows.filter(pred).length;
          return {
            api:api?{version:api.version,iconCount:api.iconCount,aliasCount:api.aliasCount,northernIreland:api.codeFor?.('Northern Ireland'),thailand:api.codeFor?.('Thailand')}:null,
            buttons:rows.length,
            decorated:countBy(r=>Boolean(r.code)),
            imageFlags:countBy(r=>r.hasImg),
            globes:countBy(r=>r.hasGlobe),
            unknown:rows.filter(r=>r.code==='unknown'),
            world:rows.filter(r=>r.code==='WORLD'),
            known:rows.filter(r=>r.code&&r.code!=='unknown'&&r.code!=='WORLD'),
            samples:rows.slice(0,80)
          };
        });
        report.ui.push({viewport:vp.name,...state,pageErrors,requestFailures:failed});
        await page.screenshot({path:`${OUT}/${vp.name}.png`,fullPage:true});
        await page.close();
      }
    }finally{await browser.close();}
    report.result='SUCCESS_READ_ONLY';
  }catch(error){report.result='FAIL_READ_ONLY';report.error=error.stack||error.message;process.exitCode=1;}
  report.completedAt=new Date().toISOString();save();
  console.log(JSON.stringify({result:report.result,assets:report.assets,board:report.board&&{fixtures:report.board.fixtures,leagueLabels:report.board.leagueLabels,countries:report.board.countries},ui:report.ui?.map(x=>({viewport:x.viewport,buttons:x.buttons,imageFlags:x.imageFlags,globes:x.globes,unknown:x.unknown?.length,api:x.api}))},null,2));
}
await main();
