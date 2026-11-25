export const PATCH_MARK='B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125';
const graph=String.raw`
      // B46_ADAPTIVE_EQUITY_RANGE_NO_FLICKER_20261125
      // Keep the native chart and table DOM fixed; change only the SVG data and labels.
      const graph=document.createElement('section');
      graph.id='b46-adaptive-research-equity';
      graph.style.cssText='display:block;position:relative;clear:both;overflow:hidden;width:100%;max-width:100%;min-height:257px;padding:16px 0 9px';
      graph.append(mk('strong','EQUITY · PERSISTED DAILY SNAPSHOT · 1 UNIT PER FORMULA','b46pm-stats-period-title'));
      const controls=document.createElement('div');
      controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0 14px';
      const selector=document.createElement('select');
      selector.setAttribute('aria-label','Adaptive formula for equity graph');
      selector.style.cssText='max-width:130px;background:#13251d;border:1px solid #35664b;border-radius:6px;padding:7px 9px;color:inherit';
      for(const f of formula){
        const option=document.createElement('option');
        option.value=f.formula;option.textContent=f.formula;
        selector.append(option);
      }
      const chartFormula=formula.some(f=>f.formula===b46AdaptiveChartFormula)?
        b46AdaptiveChartFormula:(formula.find(f=>f.settled>0)?.formula??formula[0]?.formula??'A02');
      selector.value=chartFormula;
      controls.append(selector);
      const buttons=new Map();
      for(const days of [7,30,90]){
        const button=mk('button',days+'D','b46pm-period-btn');
        button.type='button';
        button.dataset.rangeDays=String(days);
        controls.append(button);
        buttons.set(days,button);
      }
      graph.append(controls);
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 720 170');
      svg.setAttribute('preserveAspectRatio','none');
      svg.setAttribute('role','img');
      svg.style.cssText='display:block;width:100%;height:170px;overflow:visible';
      const axis=document.createElementNS('http://www.w3.org/2000/svg','line');
      axis.setAttribute('x1','20');axis.setAttribute('x2','700');
      axis.setAttribute('stroke','#4b6a5b');axis.setAttribute('stroke-width','1');
      svg.append(axis);
      const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');
      poly.setAttribute('fill','none');poly.setAttribute('stroke','#22d78b');
      poly.setAttribute('stroke-width','1.6');poly.setAttribute('vector-effect','non-scaling-stroke');
      poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');
      svg.append(poly);
      graph.append(svg);
      const caption=mk('p','','b46pm-stats-cutoff');
      caption.setAttribute('aria-live','polite');
      graph.append(caption);
      graph.append(mk('small','Formula observations are simulated, not the BALL46 Total account.','b46pm-stats-cutoff'));
      function paintEquity(){
        const chosen=selector.value;
        const days=b46AdaptiveChartDays;
        const all=(days===90?data.series90?.byFormula:data.series30?.byFormula)?.[chosen]??[];
        let series=Array.isArray(all)?all:[];
        if(days===7){
          // Seven calendar days derived from the stored 30D Snapshot, not synthetic data.
          const today=new Date();
          const cutoff=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()-6))
            .toISOString().slice(0,10);
          series=series.filter(r=>typeof r.date==='string'&&r.date.slice(0,10)>=cutoff);
        }
        for(const [range,button] of buttons){
          const active=range===days;
          button.classList.toggle('active',active);
          button.setAttribute('aria-pressed',String(active));
        }
        svg.setAttribute('aria-label',chosen+' simulated cumulative units across '+days+' days');
        const values=series.map(r=>Number(r.cumulativeUnits??0));
        if(!values.length||!values.every(Number.isFinite)){
          poly.setAttribute('points','');
          axis.setAttribute('y1','146');axis.setAttribute('y2','146');
          caption.textContent='No settled daily Snapshot series for '+chosen+' in '+days+'D yet.';
          return;
        }
        const min=Math.min(0,...values),max=Math.max(0,...values),span=Math.max(1,max-min);
        const xy=(v,i)=>[(20+(680*i/Math.max(1,values.length-1))),
          (146-120*(v-min)/span)];
        const y0=xy(0,0)[1];
        axis.setAttribute('y1',String(y0));axis.setAttribute('y2',String(y0));
        poly.setAttribute('points',values.map((v,i)=>xy(v,i).map(x=>x.toFixed(2)).join(',')).join(' '));
        caption.textContent=chosen+' · '+days+'D · Cumulative '+values.at(-1).toFixed(2)+
          ' units · '+series[0].date+' to '+series.at(-1).date;
      }
      selector.addEventListener('change',()=>{
        b46AdaptiveChartFormula=selector.value;
        paintEquity();
      });
      for(const [days,button] of buttons){
        button.addEventListener('click',()=>{
          b46AdaptiveChartDays=days;
          paintEquity();
        });
      }
      paintEquity();
      panel.append(graph);`;
function exactlyOnce(source,oldValue,replacement,label){
 const matches=source.split(oldValue).length-1;
 if(matches!==1)throw Error('PATCH_DRIFT_'+label+'_'+matches);
 return source.replace(oldValue,replacement);
}
export function patchAdaptiveClient(client){
 if(!client.includes('B46_ADAPTIVE_NATIVE_CHART_30_90_V3')||
    !client.includes('function b46AdaptivePanel(content)')||
    !client.includes('panel.replaceChildren();'))throw Error('ADAPTIVE_SOURCE_NOT_MATCHED');
 if(client.includes(PATCH_MARK))throw Error('PATCH_ALREADY_INSTALLED');
 const start="const graph=document.createElement('section');";
 const stop='panel.append(graph);';
 const i=client.indexOf(start),j=client.indexOf(stop,i);
 if(i<0||j<i||j-i>6500)throw Error('ADAPTIVE_GRAPH_SLOT_DRIFT');
 if(client.indexOf(start,i+1)>=0||client.indexOf(stop,j+1)>=0)throw Error('GRAPH_SLOT_NOT_UNIQUE');
 const oldGraph=client.slice(i,j+stop.length);
 if(!oldGraph.includes('b46AdaptivePanel(content);')||
    !oldGraph.includes('for(const days of [30,90])'))throw Error('OLD_CLICK_HANDLERS_CHANGED');
 const replacement=graph.trimStart();
 const out=exactlyOnce(client,oldGraph,replacement,'CHART_REGION');
 if(out.slice(0,i)!==client.slice(0,i)||
    out.slice(i+replacement.length)!==client.slice(j+stop.length))throw Error('OUTSIDE_GRAPH_CHANGED');
 if(out.includes('b46AdaptiveChartDays=days;b46AdaptivePanel(content);'))throw Error('FULL_PANEL_RERENDER_REMAINS');
 return {client:out,oldGraphSize:oldGraph.length,newGraphSize:replacement.length};
}
export function patchAdaptiveWorker(main){
 const found=main.match(/var prematchClientScript = ("(?:\\.|[^"\\])*");/);
 if(!found)throw Error('EMBEDDED_CLIENT_NOT_FOUND');
 const before=JSON.parse(found[1]);
 const result=patchAdaptiveClient(before);
 const original=found[0],replacement='var prematchClientScript = '+JSON.stringify(result.client)+';';
 const worker=exactlyOnce(main,original,replacement,'MAIN_CLIENT_ONLY');
 if(worker.replace(replacement,'')!==main.replace(original,''))throw Error('WORKER_CHANGED_OUTSIDE_CLIENT');
 return {worker,client:result.client,originalClient:before,oldGraphSize:result.oldGraphSize,newGraphSize:result.newGraphSize};
}
