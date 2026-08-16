import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const FEED_URL='https://free.goaloo188.com/free/freesoccer';
const MAX_ANALYSIS=Number(process.env.MAX_ANALYSIS||500);
const MIN_ODDS=1.70;
const MIN_CONFIDENCE=58;
const MIN_LEAD_MINUTES=45;
const MIN_STRENGTH=0.62;
const MIN_OVERALL_PPG_EDGE=0.30;
const MIN_VENUE_PPG_EDGE=0.40;
const MIN_SAMPLE=5;
const PICK_LIMIT=10;
const OVERALL_N=6;
const VENUE_N=5;
const TZ='Asia/Bangkok';
const now=new Date();
const clean=s=>String(s||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const round4=n=>Math.round(n*10000)/10000;
const clamp=(n,min=0,max=100)=>Math.min(max,Math.max(min,n));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function bangkokParts(date){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
}
function localDateString(date){
  const p=bangkokParts(date);return `${p.year}-${p.month}-${p.day}`;
}
function nextCutoffUtc(date){
  const p=bangkokParts(date);
  return new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day)+1,1,0,0));
}
const localDate=localDateString(now);

function marketRow(block,company){
  const esc=company.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const line='([+\\-]?[0-9./]+)';
  const num='([0-9.]+)';
  const rx=new RegExp(`${esc}\\s+Initial\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${line}\\s+${num}\\s+${num}\\s+${line}\\s+${num}([\\s\\S]{0,300}?)\\bLive\\s+${num}\\s+${num}\\s+${num}\\s+${num}\\s+${line}\\s+${num}\\s+${num}\\s+${line}\\s+${num}`,'i');
  const m=block.match(rx);if(!m)return null;
  return {
    company,
    opening:{oneX2:{home:+m[1],draw:+m[2],away:+m[3]},totals:{over:+m[4],line:m[5],under:+m[6]},asian:{home:+m[7],line:m[8],away:+m[9]}},
    current:{oneX2:{home:+m[11],draw:+m[12],away:+m[13]},totals:{over:+m[14],line:m[15],under:+m[16]},asian:{home:+m[17],line:m[18],away:+m[19]}}
  };
}
function parseMarket(text){
  const t=String(text||'');
  const block=t.match(/Live Odds Comparison([\s\S]{0,4500})/i)?.[1]||t.slice(0,6000);
  for(const c of ['Bet365','Crown','Sbobet']){const row=marketRow(block,c);if(row)return row;}
  const m=block.match(/Bet365\s+Initial\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)([\s\S]{0,500}?)\bLive\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if(m)return {company:'Bet365',opening:{oneX2:{home:+m[1],draw:+m[2],away:+m[3]}},current:{oneX2:{home:+m[5],draw:+m[6],away:+m[7]}}};
  const i=block.match(/(?:Bet365|Crown|Sbobet)\s+Initial\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
  if(i)return {company:'market',opening:{oneX2:{home:+i[1],draw:+i[2],away:+i[3]}},current:{oneX2:{home:+i[1],draw:+i[2],away:+i[3]}}};
  return null;
}
function extractStrengthComparison(text){
  const lines=String(text||'').split(/\r?\n/).map(clean).filter(Boolean);
  const i=lines.findIndex(x=>/^Strength Comparison$/i.test(x));if(i<0)return null;
  const nums=[];
  for(let j=i+1;j<Math.min(lines.length,i+10);j++)if(/^\d{1,3}%?$/.test(lines[j]))nums.push(Number(lines[j].replace('%','')));
  if(nums.length<2)return null;
  return {home:clamp(nums[0]),away:clamp(nums[1])};
}
function extractH2H(text){
  const t=String(text||'');
  const block=t.match(/H2H Comparison([\s\S]{0,1800}?)(?:Who will win\?|Head to Head Statistics)/i)?.[1]||'';
  const m=block.match(/Record\s+All\s+(\d+)W\s+(\d+)D\s+(\d+)L\s+(\d+)W\s+(\d+)D\s+(\d+)L/i);
  if(!m)return null;
  return {home:{win:+m[1],draw:+m[2],loss:+m[3]},away:{win:+m[4],draw:+m[5],loss:+m[6]}};
}
function tableRows(lines,start,end){
  const out=[];
  for(let i=start;i<end;i++){
    const raw=lines[i];if(!/\t/.test(raw))continue;
    const p=raw.split('\t').map(x=>clean(x));
    if(p.length<5||!/^\d{2}-\d{2}-\d{4}$/.test(p[1]||''))continue;
    const sm=(p[3]||'').match(/^(\d+)\s*-\s*(\d+)/);if(!sm)continue;
    out.push({league:p[0],date:p[1],home:p[2],homeGoals:+sm[1],awayGoals:+sm[2],away:p[4]});
  }
  return out;
}
function extractRecent(text,home,away){
  const lines=String(text||'').split(/\r?\n/).map(x=>x.replace(/\u00a0/g,' ').trim()).filter(Boolean);
  const prev=lines.findIndex(x=>/Previous Scores Statistics/i.test(x));if(prev<0)return null;
  const h=lines.findIndex((x,i)=>i>prev&&clean(x).startsWith(home)&&/Home/i.test(x));
  const a=lines.findIndex((x,i)=>i>(h>=0?h:prev)&&clean(x).startsWith(away)&&/Away/i.test(x));
  if(h<0||a<0)return null;
  return {homeRows:tableRows(lines,h+1,a),awayRows:tableRows(lines,a+1,lines.length)};
}
function metrics(rows,team,venue){
  const usable=[];
  for(const r of rows){
    const isHome=clean(r.home)===clean(team),isAway=clean(r.away)===clean(team);if(!isHome&&!isAway)continue;
    if(venue==='home'&&!isHome)continue;if(venue==='away'&&!isAway)continue;
    const gf=isHome?r.homeGoals:r.awayGoals,ga=isHome?r.awayGoals:r.homeGoals;
    usable.push({gf,ga,points:gf>ga?3:gf===ga?1:0});if(usable.length>=(venue?VENUE_N:OVERALL_N))break;
  }
  if(!usable.length)return null;
  const n=usable.length,pts=usable.reduce((s,x)=>s+x.points,0),gf=usable.reduce((s,x)=>s+x.gf,0),ga=usable.reduce((s,x)=>s+x.ga,0);
  return {sample:n,ppg:round4(pts/n),gfpg:round4(gf/n),gapg:round4(ga/n),gdpg:round4((gf-ga)/n),winRate:round4(usable.filter(x=>x.points===3).length/n)};
}
function formString(rows,team,n=6){
  const out=[];for(const r of rows){const isHome=clean(r.home)===clean(team),isAway=clean(r.away)===clean(team);if(!isHome&&!isAway)continue;const gf=isHome?r.homeGoals:r.awayGoals,ga=isHome?r.awayGoals:r.homeGoals;out.push(gf>ga?'W':gf===ga?'D':'L');if(out.length>=n)break;}return out.join(' ');
}
function predictedScore(side,homeVenue,awayVenue){
  const selected=side==='home'?homeVenue:awayVenue,opponent=side==='home'?awayVenue:homeVenue;
  const sg=Math.max(.4,(selected.gfpg+opponent.gapg)/2),og=Math.max(.2,(opponent.gfpg+selected.gapg)/2);
  let s=Math.min(4,Math.max(1,Math.round(sg))),o=Math.min(3,Math.max(0,Math.round(og)));if(s<=o)s=Math.min(4,o+1);return side==='home'?`${s}-${o}`:`${o}-${s}`;
}
function h2hScore(h2h,side){
  const r=side==='home'?h2h?.home:h2h?.away;if(!r)return null;const n=r.win+r.draw+r.loss;if(!n)return null;return clamp(Math.round(((r.win*3+r.draw)/(n*3))*100));
}
function marketSupport(market,side){
  const key=side==='home'?'home':'away',o=market?.opening?.oneX2?.[key],c=market?.current?.oneX2?.[key];if(!Number.isFinite(o)||!Number.isFinite(c)||o<=0)return null;
  const pct=((o-c)/o)*100;return {score:clamp(Math.round(50+pct*5)),movementPct:round4(pct),opening:o,current:c};
}
function momentumContext({side,ho,ao,hv,av,h2h,market,strengthComparison}){
  const overall=side==='home'?ho:ao,venue=side==='home'?hv:av;
  const form=clamp(Math.round((overall.ppg/3)*100));
  const venueScore=clamp(Math.round((venue.ppg/3)*100));
  const h2hValue=h2hScore(h2h,side);
  const marketValue=marketSupport(market,side);
  const parts=[['form',form,.40],['venue',venueScore,.25],['h2h',h2hValue,.15],['market',marketValue?.score??null,.20]];
  let sum=0,w=0;for(const [,v,wt] of parts)if(Number.isFinite(v)){sum+=v*wt;w+=wt;}
  const score=w?Math.round(sum/w):null;
  const externalLean=strengthComparison?(strengthComparison.home===strengthComparison.away?'neutral':strengthComparison.home>strengthComparison.away?'home':'away'):null;
  const alignment=!externalLean||externalLean==='neutral'?'MIXED':externalLean===side?'ALIGNED':'CONFLICT';
  const totals=market?.current?.totals;
  const goalsLean=totals&&Number.isFinite(totals.over)&&Number.isFinite(totals.under)?(totals.over<totals.under?'OVER':totals.under<totals.over?'UNDER':'NEUTRAL'):null;
  return {score,level:score==null?'N/A':score>=75?'STRONG':score>=60?'GOOD':score>=40?'NEUTRAL':'WEAK',components:{form,venue:venueScore,h2h:h2hValue,market:marketValue?.score??null},marketMovementPct:marketValue?.movementPct??null,externalLean,alignment,goalsLean};
}

async function main(){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({locale:'en-US',timezoneId:TZ,viewport:{width:1365,height:900},userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36 NOMADTIPS3'});
  const feed=await context.newPage();const resp=await feed.goto(FEED_URL,{waitUntil:'domcontentloaded',timeout:60000});if(!resp||resp.status()>=400)throw new Error(`feed HTTP ${resp?.status()}`);await feed.waitForTimeout(5000);
  const matches=await feed.evaluate(()=>[...document.querySelectorAll('tr[id^="tr1_"]')].map(tr=>{const id=(tr.id.match(/(\d+)$/)||[])[1];if(!id)return null;const cells=[...tr.querySelectorAll('td')],time=cells[2];return {id,leagueShort:(cells[1]?.innerText||'').trim(),league:(cells[1]?.getAttribute('title')||cells[1]?.innerText||'').trim(),kickoffRaw:time?.getAttribute('data-t')||'',time:(time?.innerText||'').trim(),status:(cells[3]?.innerText||'').trim(),home:(tr.querySelector(`#team1_${id}`)?.textContent||cells[5]?.innerText||'').trim(),score:(cells[6]?.innerText||'').trim(),away:(tr.querySelector(`#team2_${id}`)?.textContent||cells[7]?.innerText||'').trim()};}).filter(Boolean));await feed.close();
  const threshold=Date.now()+MIN_LEAD_MINUTES*60*1000,cutoff=nextCutoffUtc(now).getTime();
  const upcoming=matches.map(m=>({...m,kickoffUtc:m.kickoffRaw?new Date(m.kickoffRaw.replace(' ','T')+'Z').toISOString():null})).filter(m=>m.home&&m.away&&m.kickoffUtc&&new Date(m.kickoffUtc).getTime()>=threshold&&new Date(m.kickoffUtc).getTime()<=cutoff&&!/\d+\s*-\s*\d+/.test(m.score)&&!/^\d+'?$/.test(m.status)).sort((a,b)=>new Date(a.kickoffUtc)-new Date(b.kickoffUtc)).slice(0,MAX_ANALYSIS);
  const results=[];let cursor=0;
  async function worker(){
    const page=await context.newPage();
    while(true){
      const idx=cursor++;if(idx>=upcoming.length)break;const m=upcoming[idx];
      try{
        const r=await page.goto(`https://www.goaloo.com/analysis/${m.id}`,{waitUntil:'domcontentloaded',timeout:35000});if(!r||r.status()>=400)continue;await page.waitForTimeout(650);
        const text=await page.locator('body').innerText();if(/captcha|access denied|cloudflare/i.test(text.slice(0,1000)))continue;
        const market=parseMarket(text);const odds=market?.current?.oneX2;if(!odds)continue;
        const recent=extractRecent(text,m.home,m.away);if(!recent)continue;
        const ho=metrics(recent.homeRows,m.home,null),ao=metrics(recent.awayRows,m.away,null),hv=metrics(recent.homeRows,m.home,'home'),av=metrics(recent.awayRows,m.away,'away');if(!ho||!ao||!hv||!av||Math.min(ho.sample,ao.sample,hv.sample,av.sample)<MIN_SAMPLE)continue;
        const strength=(ho.ppg-ao.ppg)*.34+(hv.ppg-av.ppg)*.36+(ho.gdpg-ao.gdpg)*.18,side=strength>0?'home':'away',absStrength=Math.abs(strength),overallEdge=side==='home'?ho.ppg-ao.ppg:ao.ppg-ho.ppg,venueEdge=side==='home'?hv.ppg-av.ppg:av.ppg-hv.ppg;
        if(absStrength<MIN_STRENGTH||overallEdge<MIN_OVERALL_PPG_EDGE||venueEdge<MIN_VENUE_PPG_EDGE)continue;
        const confidence=Math.min(100,Math.max(50,Math.round(50+absStrength*15))),selectedOdds=side==='home'?odds.home:odds.away;if(!Number.isFinite(selectedOdds)||selectedOdds<MIN_ODDS||confidence<MIN_CONFIDENCE)continue;
        const selected=side==='home'?m.home:m.away,opp=side==='home'?m.away:m.home,h2h=extractH2H(text),strengthComparison=extractStrengthComparison(text),momentum=momentumContext({side,ho,ao,hv,av,h2h,market,strengthComparison});
        results.push({fixtureId:m.id,league:m.league||m.leagueShort,home:m.home,away:m.away,kickoffUtc:m.kickoffUtc,pick:`${selected} Win`,pickSide:side,odds:round4(selectedOdds),confidence,predictedScore:predictedScore(side,hv,av),analysis:{strengthScore:round4(strength),absoluteStrength:round4(absStrength),overallPpgEdge:round4(overallEdge),venuePpgEdge:round4(venueEdge),homeOverall:ho,awayOverall:ao,homeVenue:hv,awayVenue:av,homeForm:formString(recent.homeRows,m.home),awayForm:formString(recent.awayRows,m.away),standingsApplied:false},context:{strengthComparison,h2h,market,momentum,prediction:{oneX2Lean:momentum.externalLean,score:predictedScore(side,hv,av),asianLine:market?.current?.asian?.line??null,goalsLine:market?.current?.totals?.line??null,goalsLean:momentum.goalsLean,bttsLean:null,alignment:momentum.alignment}},reason:`Recent form: ${selected} has the stronger weighted profile against ${opp}.`,status:'PENDING'});
      }catch(e){console.log(`skip ${m.id}: ${e.message}`)}await sleep(250);
    }await page.close();
  }
  await Promise.all(Array.from({length:Math.min(4,upcoming.length||1)},()=>worker()));await browser.close();
  results.sort((a,b)=>b.confidence-a.confidence||b.analysis.absoluteStrength-a.analysis.absoluteStrength||new Date(a.kickoffUtc)-new Date(b.kickoffUtc));
  const selected=results.slice(0,PICK_LIMIT);
  const payload={selectionDate:localDate,generatedAtUtc:new Date().toISOString(),windowEndUtc:new Date(cutoff).toISOString(),status:'ONLINE',scan:{feedMatches:matches.length,eligibleUpcoming:upcoming.length,qualified:results.length,published:selected.length},rules:{market:'1X2',minimumOdds:MIN_ODDS,minimumConfidence:MIN_CONFIDENCE,minimumLeadMinutes:MIN_LEAD_MINUTES,minimumStrengthScore:MIN_STRENGTH,minimumOverallPpgEdge:MIN_OVERALL_PPG_EDGE,minimumVenuePpgEdge:MIN_VENUE_PPG_EDGE,maximumSelections:PICK_LIMIT,overallSample:OVERALL_N,venueSample:VENUE_N,minimumSample:MIN_SAMPLE,scanAllCompetitions:true},matches:selected};
  await fs.mkdir('car1-1/data',{recursive:true});await fs.writeFile('car1-1/data/public-selections.json',JSON.stringify(payload,null,2)+'\n');
  console.log(`cycle ${localDate}: feed=${matches.length} upcoming=${upcoming.length} qualified=${results.length} published=${selected.length}`);selected.forEach((x,i)=>console.log(`${i+1}. ${x.pick} @ ${x.odds} confidence=${x.confidence}% momentum=${x.context?.momentum?.score??'N/A'} alignment=${x.context?.prediction?.alignment??'N/A'} (${x.home} vs ${x.away})`));
}
main().catch(e=>{console.error(e);process.exit(1)});
