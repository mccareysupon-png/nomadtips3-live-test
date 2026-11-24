// BALL46 existing PreMatch O/U TEST Adaptive panel only.
// Embed per-formula 30D/90D graph from persisted daily snapshot, not legacy Total.
const exactly=(src,from,to,name)=>{
 const n=src.split(from).length-1;
 if(n!==1)throw Error('ADAPTIVE_NATIVE_CHART_DRIFT_'+name+'_'+n);
 return src.replace(from,to);
};
export const ADAPTIVE_30_90_CHART_VERSION='B46_ADAPTIVE_NATIVE_CHART_30_90_V3';

const graphCode="\n      // Fixed 30D / 90D equity, scoped to exactly ONE experimental formula.\n      // Source is persisted daily Snapshot only, never a merged portfolio.\n      const graph=document.createElement('section');\n      graph.id='b46-adaptive-research-equity';\n      graph.style.cssText='display:block;position:relative;clear:both;overflow:hidden;width:100%;max-width:100%;padding:16px 0 9px';\n      graph.append(mk('strong','EQUITY · PERSISTED DAILY SNAPSHOT · 1 UNIT PER FORMULA','b46pm-stats-period-title'));\n      const controls=document.createElement('div');\n      controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0 14px';\n      const selector=document.createElement('select');\n      selector.setAttribute('aria-label','Adaptive formula for equity graph');\n      selector.style.cssText='max-width:130px;background:#13251d;border:1px solid #35664b;border-radius:6px;padding:7px 9px;color:inherit';\n      for(const f of formula){\n        const option=document.createElement('option');\n        option.value=f.formula;option.textContent=f.formula;\n        selector.append(option);\n      }\n      const chartFormula=formula.some(f=>f.formula===b46AdaptiveChartFormula)?\n       b46AdaptiveChartFormula:(formula.find(f=>f.settled>0)?.formula??formula[0]?.formula??'A02');\n      selector.value=chartFormula;\n      selector.addEventListener('change',()=>{\n       b46AdaptiveChartFormula=selector.value;b46AdaptivePanel(content);\n      });\n      controls.append(selector);\n      for(const days of [30,90]){\n        const button=mk('button',days+'D','b46pm-period-btn'+(b46AdaptiveChartDays===days?' active':''));\n        button.type='button';\n        button.setAttribute('aria-pressed',String(b46AdaptiveChartDays===days));\n        button.addEventListener('click',()=>{\n          b46AdaptiveChartDays=days;b46AdaptivePanel(content);\n        });\n        controls.append(button);\n      }\n      graph.append(controls);\n      const series=(b46AdaptiveChartDays===30?data.series30?.byFormula:data.series90?.byFormula)?.[chartFormula]??[];\n      if(series.length){\n        const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');\n        svg.setAttribute('viewBox','0 0 720 170');\n        svg.setAttribute('preserveAspectRatio','none');\n        svg.setAttribute('role','img');\n        svg.setAttribute('aria-label',chartFormula+' simulated cumulative units across '+b46AdaptiveChartDays+' days');\n        svg.style.cssText='display:block;width:100%;height:170px;overflow:visible';\n        const values=series.map(r=>Number(r.cumulativeUnits??0));\n        const min=Math.min(0,...values),max=Math.max(0,...values),span=Math.max(1,max-min);\n        const xy=(v,i)=>[(20+(680*i/Math.max(1,values.length-1))),\n          (146-120*(v-min)/span)];\n        const axis=document.createElementNS('http://www.w3.org/2000/svg','line');\n        const y0=xy(0,0)[1];\n        axis.setAttribute('x1','20');axis.setAttribute('x2','700');\n        axis.setAttribute('y1',String(y0));axis.setAttribute('y2',String(y0));\n        axis.setAttribute('stroke','#4b6a5b');axis.setAttribute('stroke-width','1');\n        svg.append(axis);\n        const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');\n        poly.setAttribute('points',values.map((v,i)=>xy(v,i).map(x=>x.toFixed(2)).join(',')).join(' '));\n        poly.setAttribute('fill','none');poly.setAttribute('stroke','#22d78b');\n        poly.setAttribute('stroke-width','1.6');poly.setAttribute('vector-effect','non-scaling-stroke');\n        poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');\n        svg.append(poly);graph.append(svg);\n        const latest=values.at(-1);\n        graph.append(mk('p',chartFormula+' · '+b46AdaptiveChartDays+'D · Cumulative '+latest.toFixed(2)+\n          ' units · '+series[0].date+' to '+series.at(-1).date,\n          'b46pm-stats-cutoff'));\n      }else{\n        graph.append(mk('p','No settled daily Snapshot series for '+chartFormula+' yet.','b46pm-stats-cutoff'));\n      }\n      graph.append(mk('small','Formula observations are simulated, not the BALL46 Total account.','b46pm-stats-cutoff'));\n      panel.append(graph);\n      panel.append(mk('p','EVENT JOURNAL · '+\n        (data.eventJournal?.events??0)+' settled events · '+\n        (data.eventJournal?.revisions??0)+' verified FT revisions',\n        'b46pm-stats-cutoff'));\n";

export function patchAdaptiveNativeChart(client){
 if(typeof client!=='string'||
  !client.includes('B46_ADAPTIVE_RESEARCH_NATIVE_OU_TEST_V1')||
  !client.includes('B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2')||
  !client.includes("panel.className='b46pm-adaptive-research-isolated'"))
  throw Error('EXPECTED_ISOLATED_ADAPTIVE_TEST_PANEL_MISSING');
 if(client.includes(ADAPTIVE_30_90_CHART_VERSION))throw Error('ADAPTIVE_NATIVE_CHART_ALREADY_INSTALLED');
 const slot="  let b46AdaptiveData=null,b46AdaptiveAt=0,b46AdaptiveLoading=null;";
 let out=exactly(client,slot,slot+
  "\n  let b46AdaptiveChartFormula='A02',b46AdaptiveChartDays=30;",
  'CHART_STATE');
 const anchor="      panel.append(mk('p',\n        'History screen: '";
 out=exactly(out,anchor,graphCode+"\n"+anchor,'AFTER_FORMULA_STATS');
 out=exactly(out,'// B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2',
  '// B46_ADAPTIVE_NATIVE_RESEARCH_LAYOUT_FIX_V2\n// '+ADAPTIVE_30_90_CHART_VERSION,'CHART_VERSION');
 return out;
}
export function patchAdaptiveNativeChartWorker(main){
 if(typeof main!=='string'||!main.includes('/__b46_pm_adaptive_research'))
  throw Error('EXPECTED_ORIGINAL_NATIVE_TEST_WORKER');
 const found=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 if(!found)throw Error('NATIVE_CLIENT_EMBED_MISSING');
 const client=patchAdaptiveNativeChart(JSON.parse(found[1]));
 const worker=exactly(main,found[0],'var prematchClientScript = '+JSON.stringify(client)+';',
  'EMBED_CLIENT_ONLY');
 return {worker,client};
}
