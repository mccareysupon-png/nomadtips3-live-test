// Patch only the embedded TEST pre-match O/U UI script in the active frontend Worker.
// No changes to the 1X2/BTTS/LIVE STATISTICS implementations or source data.
import assert from 'node:assert/strict';
const helper=String.raw\`
function b46AdaptiveLatestBlock(data,place){
 const box=document.createElement('section');
 box.id=place==='statistics'?'b46pm-adaptive-latest-statistics':'b46pm-adaptive-latest-predictions-content';
 box.setAttribute('aria-label','Latest confirmed Adaptive research ledger entries');
 box.style.cssText='width:100%;min-width:0;clear:both;padding:14px 12px;margin:14px 0;border:1px solid #3b6b50;border-radius:12px;background:#101e19;box-sizing:border-box';
 const h=document.createElement('h2');
 h.textContent='LATEST ADAPTIVE O/U 2.5 · RECORDED RESEARCH SELECTIONS';
 h.style.cssText='font-size:15px;margin:0 0 5px;color:#e0f5e9;letter-spacing:.02em';
 box.append(h);
 const rows=(Array.isArray(data?.records)?data.records:[]).slice().sort((a,b)=>
  Number(b.picked_at)-Number(a.picked_at)||Number(b.kickoff)-Number(a.kickoff)||String(a.formula_id||'').localeCompare(String(b.formula_id||'')));
 const last=Number(rows[0]?.picked_at)||0;
 const recent=rows.filter(x=>Number(x.picked_at)===last);
 const when=v=>Number.isFinite(Number(v))&&Number(v)>1000000000?
  new Date(Number(v)*1000).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
 const info=document.createElement('p');
 info.style.cssText='font-size:12px;color:#a4bbaf;margin:0 0 10px';
 info.textContent=recent.length?recent.length+' formula signals · recorded '+when(last)+' (Thailand) · '+(data?.lastRunAt||''):
  'No priced Adaptive research records yet';
 box.append(info);
 const grid=document.createElement('div');
 grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;max-width:100%';
 for(const p of recent){
  const conflict=recent.some(other=>String(other.fixture_id)===String(p.fixture_id)&&other.selection!==p.selection);
  const card=document.createElement('article');card.setAttribute('data-b46-latest-adaptive-fixture',String(p.fixture_id));
  card.setAttribute('data-b46-latest-adaptive-formula',String(p.formula_id));
  card.style.cssText='background:#122b20;border:1px solid #315841;padding:12px;border-radius:10px;min-width:0;overflow-wrap:anywhere;color:#e7f4ec';
  const match=document.createElement('strong');match.textContent=String(p.home||'Home')+' — '+String(p.away||'Away');
  match.style.cssText='display:block;font-size:13px;line-height:1.45';
  const kickoff=document.createElement('small');kickoff.textContent='Fixture #'+p.fixture_id+' · '+when(p.kickoff)+' (Thailand)';
  kickoff.style.cssText='display:block;color:#9fbcae;font-size:11px;margin-top:3px';
  const pick=document.createElement('div');
  pick.style.cssText='display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:800;margin-top:9px';
  const selection=document.createElement('span');selection.textContent=String(p.formula_id)+' · '+String(p.selection)+' '+String(p.line);
  selection.style.color=p.selection==='OVER'?'#62eab1':'#ff9a9b';
  const quote=document.createElement('span');quote.textContent=
   (Number.isFinite(Number(p.odds))?Number(p.odds).toFixed(2):'—')+' · '+String(p.bookmaker||'—');
  pick.append(selection,quote);
  const status=document.createElement('small');status.textContent='STATUS '+String(p.status||'PENDING')+
   (p.hg==null?'':' · FT '+p.hg+'-'+p.ag);
  status.style.cssText='display:block;color:#a2c6b0;font-size:11px;margin-top:7px';
  const provenance=document.createElement('small');
  provenance.textContent=String(p.odds_source||'').includes('HISTORICAL_RESEARCH_ONLY')?
   'HISTORICAL_RESEARCH_ONLY · NOT VERIFIED LIVE ODDS':'Recorded quote at the time of research selection';
  provenance.style.cssText='display:block;color:#edc875;font-size:10px;font-weight:700;margin-top:4px';
  card.append(match,kickoff,pick,status,provenance);
  if(conflict){
   const warn=document.createElement('small');warn.textContent='OPPOSING OVER/UNDER FORMULAS ON SAME FIXTURE';
   warn.style.cssText='display:block;color:#ffb38f;font-size:10px;margin-top:4px;font-weight:700';card.append(warn);
  }
  grid.append(card);
 }
 box.append(grid);
 const foot=document.createElement('small');
 foot.textContent='Adaptive research ledger (simulated 1U per formula). NOT a published bet. Separate from 1X2 / BTTS / portfolio.';
 foot.style.cssText='display:block;color:#8bad9d;font-size:11px;margin-top:10px';
 box.append(foot);
 return box;
}
function b46AdaptiveLatestPredictions(content){
 if(!content||mode!=='ou-predictions')return;
 let target=content.querySelector('#b46pm-adaptive-predictions-latest');
 if(!target){target=document.createElement('section');target.id='b46pm-adaptive-predictions-latest';
  target.style.cssText='display:block;clear:both;width:100%;min-width:0;box-sizing:border-box;margin:16px 0';content.append(target);}
 const render=()=>{
  if(mode!=='ou-predictions'||!content.isConnected)return;
  target.replaceChildren();
  if(b46AdaptiveData?.code==='B46_ADAPTIVE_OU_RESEARCH_V1')target.append(b46AdaptiveLatestBlock(b46AdaptiveData,'predictions'));
  else{const p=document.createElement('p');p.textContent='Reading Adaptive research ledger...';target.append(p);}
 };
 render();
 if(!b46AdaptiveData||Date.now()-b46AdaptiveAt>45000){
  fetch('/__b46_pm_adaptive_research',{cache:'no-store'})
   .then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.json()})
   .then(d=>{if(d?.code!=='B46_ADAPTIVE_OU_RESEARCH_V1'||!Array.isArray(d.records))throw Error('Invalid Adaptive response');
      b46AdaptiveData=d;b46AdaptiveAt=Date.now();render();updateMenu();})
   .catch(e=>{if(mode==='ou-predictions'&&content.isConnected){const p=document.createElement('p');
    p.textContent='Adaptive research data unavailable: '+String(e.message);target.replaceChildren(p);}});
 }
}
\`;
function replaceOnce(source,needle,replacement,reason){
 const n=source.split(needle).length-1;
 assert.equal(n,1,reason+' EXPECTED_ONE_ACTUAL_'+n);
 return source.replace(needle,replacement);
}
export function patchNativeAdaptiveLatest(source){
 assert(source.includes("function b46AdaptivePanel(content)"),'EXPECTED_ADAPTIVE_STATS_BASELINE');
 assert(!source.includes('b46pm-adaptive-latest-predictions-content'),'ALREADY_PATCHED');
 const before="let b46AdaptiveChartFormula='A02',b46AdaptiveChartDays=30;";
 const escaped=JSON.stringify(helper).slice(1,-1);
 source=replaceOnce(source,before,escaped+'\\n  '+before,'NEW_NATIVE_ADAPTIVE_HELPER_ANCHOR');
 const stats="panel.append(board);\\n      panel.append(mk('p'";
 source=replaceOnce(source,stats,"panel.append(board);\\n      panel.append(b46AdaptiveLatestBlock(data,'statistics'));\\n      panel.append(mk('p'",'NEW_ADAPTIVE_STATS_LATEST_ANCHOR');
 const prediction="if(mode==='ou-predictions'){\\n      renderEmptyOuScreen(content,false);\\n      finish();return;\\n    }";
 const next="if(mode==='ou-predictions'){\\n      renderEmptyOuScreen(content,false);\\n      const empty=content.querySelector('.b46pm-empty');\\n      if(empty)empty.textContent='Legacy O/U publication disabled. Latest Adaptive research signals are shown below.';\\n      b46AdaptiveLatestPredictions(content);\\n      finish();return;\\n    }";
 source=replaceOnce(source,prediction,next,'NEW_ADAPTIVE_PREDICTIONS_LATEST_ANCHOR');
 return source;
}
