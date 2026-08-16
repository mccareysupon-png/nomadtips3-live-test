import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const FEED_URL='https://free.goaloo188.com/free/freesoccer';
const MAX_ANALYSIS=Number(process.env.MAX_ANALYSIS||80);
const MIN_ODDS=1.70;
const MIN_CONFIDENCE=58;
const PICK_LIMIT=10;
const OVERALL_N=6;
const VENUE_N=5;
const TZ='Asia/Bangkok';
const now=new Date();
const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const round4=n=>Math.round(n*10000)/10000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function excluded(m){
  const s=`${m.leagueShort} ${m.league} ${m.home} ${m.away}`;
  return /\b(?:U1[5-9]|U2[0-3])\b|Youth|Reserve|Reserves|Women|\(W\)|\bW\b|Friendly|INT CF|INT FRL|\bCup\b|Trophy|Qualification|Qualifi|Playoff|Play-off/i.test(s);
}

function parseOdds(text){
  const t=String(text||'');
  const block=t.match(/Live Odds Comparison([\s\S]{0,3500})/i)?.[1]||t.slice(0,5000);
  const m=block.match(/Bet365\s+Initial\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)([\s\S]{0,500}?)\bLive\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if(m){return {home:+m[5],draw:+m[6],away:+m[7],opening:{home:+m[1],draw:+m[2],away:+m[3]}}}
  const i=block.match(/Bet365\s+Initial\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if(i){return {home:+i[1],draw:+i[2],away:+i[3],opening:{home:+i[1],draw:+i[2],away:+i[3]}}}
  const any=block.match(/(?:Crown|Sbobet)\s+Initial\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)([\s\S]{0,500}?)\bLive\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if(any){return {home:+any[5],draw:+any[6],away:+any[7],opening:{home:+any[1],draw:+any[2],away:+any[3]}}}
  return null;
}

function tableRows(lines,start,end){
  const out=[];
  for(let i=start;i<end;i++){
    const raw=lines[i];
    if(!/\t/.test(raw)) continue;
    const p=raw.split('\t').map(x=>clean(x));
    if(p.length<5 || !/^\d{2}-\d{2}-\d{4}$/.test(p[1]||'')) continue;
    const sm=(p[3]||'').match(/^(\d+)\s*-\s*(\d+)/);
    if(!sm) continue;
    out.push({league:p[0],date:p[1],home:p[2],homeGoals:+sm[1],awayGoals:+sm[2],away:p[4]});
  }
  return out;
}

function extractRecent(text,home,away){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\u00a0/g,' ').trim()).filter(Boolean);
  const prev=lines.findIndex(x=>/Previous Scores Statistics/i.test(x));
  if(prev<0) return null;
  const h=lines.findIndex((x,i)=>i>prev && clean(x).startsWith(home) && /Home/i.test(x));
  const a=lines.findIndex((x,i)=>i>(h>=0?h:prev) && clean(x).startsWith(away) && /Away/i.test(x));
  if(h<0||a<0) return null;
  const homeRows=tableRows(lines,h+1,a);
  const awayRows=tableRows(lines,a+1,lines.length);
  return {homeRows,awayRows};
}

function metrics(rows,team,venue){
  const usable=[];
  for(const r of rows){
    const isHome=clean(r.home)===clean(team), isAway=clean(r.away)===clean(team);
    if(!isHome&&!isAway) continue;
    if(venue==='home'&&!isHome) continue;
    if(venue==='away'&&!isAway) continue;
    const gf=isHome?r.homeGoals:r.awayGoals, ga=isHome?r.awayGoals:r.homeGoals;
    usable.push({gf,ga,points:gf>ga?3:gf===ga?1:0});
    if(usable.length>=(venue?VENUE_N:OVERALL_N)) break;
  }
  if(!usable.length) return null;
  const n=usable.length, pts=usable.reduce((s,x)=>s+x.points,0),gf=usable.reduce((s,x)=>s+x.gf,0),ga=usable.reduce((s,x)=>s+x.ga,0);
  return {sample:n,ppg:round4(pts/n),gfpg:round4(gf/n),gapg:round4(ga/n),gdpg:round4((gf-ga)/n),winRate:round4(usable.filter(x=>x.points===3).length/n)};
}

function formString(rows,team,n=6){
  const out=[];
  for(const r of rows){
    const isHome=clean(r.home)===clean(team),isAway=clean(r.away)===clean(team); if(!isHome&&!isAway) continue;
    const gf=isHome?r.homeGoals:r.awayGoals,ga=isHome?r.awayGoals:r.homeGoals;
    out.push(gf>ga?'W':gf===ga?'D':'L'); if(out.length>=n) break;
  }
  return out.join(' ');
}

async function main(){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'en-US',timezoneId:TZ,viewport:{width:1365,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 NOMADTIPS3'});
  const feed=await context.newPage();
  const resp=await feed.goto(FEED_URL,{waitUntil:'domcontentloaded',timeout:60000});
  if(!resp||resp.status()>=400) throw new Error(`feed HTTP ${resp?.status()}`);
  await feed.waitForTimeout(5000);
  const matches=await feed.evaluate(()=>[...document.querySelectorAll('tr[id^="tr1_"]')].map(tr=>{
    const id=(tr.id.match(/(\d+)$/)||[])[1]; if(!id)return null;
    const cells=[...tr.querySelectorAll('td')];
    const time=cells[2];
    return {id,leagueShort:(cells[1]?.innerText||'').trim(),league:(cells[1]?.getAttribute('title')||cells[1]?.innerText||'').trim(),kickoffRaw:time?.getAttribute('data-t')||'',time:(time?.innerText||'').trim(),status:(cells[3]?.innerText||'').trim(),home:(tr.querySelector(`#team1_${id}`)?.textContent||cells[5]?.innerText||'').trim(),score:(cells[6]?.innerText||'').trim(),away:(tr.querySelector(`#team2_${id}`)?.textContent||cells[7]?.innerText||'').trim()};
  }).filter(Boolean));
  await feed.close();

  const threshold=Date.now()-5*60*1000;
  const upcoming=matches.map(m=>({...m,kickoffUtc:m.kickoffRaw?new Date(m.kickoffRaw.replace(' ','T')+'Z').toISOString():null}))
    .filter(m=>m.home&&m.away&&m.kickoffUtc&&new Date(m.kickoffUtc).getTime()>=threshold&&!excluded(m)&&!/\d+\s*-\s*\d+/.test(m.score)&&!/^\d+'?$/.test(m.status))
    .sort((a,b)=>new Date(a.kickoffUtc)-new Date(b.kickoffUtc))
    .slice(0,MAX_ANALYSIS);

  const results=[]; let cursor=0;
  async function worker(){
    const page=await context.newPage();
    while(true){
      const idx=cursor++; if(idx>=upcoming.length) break;
      const m=upcoming[idx];
      try{
        const r=await page.goto(`https://www.goaloo.com/analysis/${m.id}`,{waitUntil:'domcontentloaded',timeout:35000});
        if(!r||r.status()>=400) continue;
        await page.waitForTimeout(700);
        const text=await page.locator('body').innerText();
        if(/captcha|access denied|cloudflare/i.test(text.slice(0,1000))) continue;
        const odds=parseOdds(text); if(!odds) continue;
        const recent=extractRecent(text,m.home,m.away); if(!recent) continue;
        const ho=metrics(recent.homeRows,m.home,null), ao=metrics(recent.awayRows,m.away,null);
        const hv=metrics(recent.homeRows,m.home,'home'), av=metrics(recent.awayRows,m.away,'away');
        if(!ho||!ao||!hv||!av||ho.sample<5||ao.sample<5||hv.sample<3||av.sample<3) continue;
        const strength=(ho.ppg-ao.ppg)*.34+(hv.ppg-av.ppg)*.36+(ho.gdpg-ao.gdpg)*.18;
        const side=strength>=0?'home':'away';
        const absStrength=Math.abs(strength);
        const confidence=Math.min(100,Math.max(50,Math.round(50+absStrength*15)));
        const selectedOdds=side==='home'?odds.home:odds.away;
        if(!Number.isFinite(selectedOdds)||selectedOdds<MIN_ODDS||confidence<MIN_CONFIDENCE) continue;
        const selected=side==='home'?m.home:m.away;
        const opp=side==='home'?m.away:m.home;
        const predH=Math.max(0,Math.round((ho.gfpg+ao.gapg)/2));
        const predA=Math.max(0,Math.round((ao.gfpg+ho.gapg)/2));
        results.push({
          fixtureId:m.id,league:m.league||m.leagueShort,home:m.home,away:m.away,kickoffUtc:m.kickoffUtc,
          pick:`${selected} Win`,pickSide:side,odds:round4(selectedOdds),confidence,predictedScore:`${predH}-${predA}`,
          analysis:{strengthScore:round4(strength),absoluteStrength:round4(absStrength),homeOverall:ho,awayOverall:ao,homeVenue:hv,awayVenue:av,homeForm:formString(recent.homeRows,m.home),awayForm:formString(recent.awayRows,m.away),standingsApplied:false},
          reason:`Recent form: ${selected} has the stronger weighted profile against ${opp}.`,
          status:'PENDING'
        });
      }catch(e){console.log(`skip ${m.id}: ${e.message}`)}
      await sleep(250);
    }
    await page.close();
  }
  await Promise.all(Array.from({length:Math.min(4,upcoming.length||1)},()=>worker()));
  await browser.close();
  results.sort((a,b)=>b.confidence-a.confidence||b.analysis.absoluteStrength-a.analysis.absoluteStrength||b.odds-a.odds);
  const selected=results.slice(0,PICK_LIMIT);
  const payload={selectionDate:localDate,generatedAtUtc:new Date().toISOString(),status:'ONLINE',scan:{feedMatches:matches.length,eligibleUpcoming:upcoming.length,qualified:results.length,published:selected.length},rules:{market:'1X2',minimumOdds:MIN_ODDS,minimumConfidence:MIN_CONFIDENCE,maximumSelections:PICK_LIMIT,overallSample:OVERALL_N,venueSample:VENUE_N},matches:selected};
  await fs.mkdir('car1-1/data',{recursive:true});
  await fs.writeFile('car1-1/data/public-selections.json',JSON.stringify(payload,null,2)+'\n');
  console.log(`cycle ${localDate}: feed=${matches.length} upcoming=${upcoming.length} qualified=${results.length} published=${selected.length}`);
  selected.forEach((x,i)=>console.log(`${i+1}. ${x.pick} @ ${x.odds} confidence=${x.confidence}% (${x.home} vs ${x.away})`));
}
main().catch(e=>{console.error(e);process.exit(1)});
