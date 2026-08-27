(()=>{
  'use strict';

  const DAY_MS=24*60*60*1000;
  const WINDOW_MS=365*DAY_MS;
  const EVENT_NAME='nomad:statistics-records';
  let chart=null;
  let canvas=null;
  let empty=null;
  let totalNode=null;
  let metaNode=null;
  let tooltip=null;
  let resizeObserver=null;
  let series=[];
  let hitRegions=[];
  let selectedKey=null;
  let hoverKey=null;
  let hoverX=null;
  let hoverY=null;
  let frame=0;

  const finiteNumber=value=>{
    if(value===null||value===undefined||value==='') return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null;
  };
  const timestamp=value=>{
    if(value===null||value===undefined||value==='') return NaN;
    const numeric=Number(value);
    if(Number.isFinite(numeric)) return numeric<1e12?numeric*1000:numeric;
    const parsed=Date.parse(String(value));
    return Number.isFinite(parsed)?parsed:NaN;
  };
  const formatUnit=value=>{
    const number=Number(value)||0;
    const normalized=Math.abs(number)<1e-12?0:number;
    const formatted=new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:3}).format(Math.abs(normalized));
    return `${normalized>=0?'+':'-'}${formatted}u`;
  };
  const formatAxis=value=>{
    const abs=Math.abs(value);
    const digits=abs>=100?0:abs>=10?1:2;
    return Number(value).toFixed(digits);
  };
  const formatDate=value=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(new Date(value));
  const formatHoverDate=value=>new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));
  const formatDateTime=value=>{
    const date=new Date(value);
    if(Number.isNaN(date.getTime())) return 'Settlement time unavailable';
    const day=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(date);
    const time=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
    return `${day} · ${time}`;
  };
  const resultClass=result=>{
    const value=String(result||'').toUpperCase();
    if(value.includes('WIN')) return 'is-positive';
    if(value.includes('LOSS')) return 'is-negative';
    return '';
  };
  const stableKey=item=>{
    const record=item?.record||{};
    const settledAt=Number.isFinite(item?.settledAt)?item.settledAt:'';
    const lockedAt=Number.isFinite(item?.lockedAt)?item.lockedAt:'';
    const identity=record.id||record.signalId||record.matchId||`${record.home||''}|${record.away||''}|${record.selection||''}|${record.line??''}|${record.odds??''}`;
    const result=String(record?.settlement?.result||'').toUpperCase();
    return `${settledAt}|${lockedAt}|${identity}|${result}|${item?.delta??''}`;
  };

  const buildSeries=(records,now=Date.now())=>{
    const candidates=(Array.isArray(records)?records:[]).filter(record=>{
      const result=String(record?.settlement?.result||'').trim().toUpperCase();
      return Boolean(record?.settlement)&&result!=='PENDING';
    });
    const normalized=candidates.map((record,index)=>({
      record,
      index,
      delta:finiteNumber(record?.settlement?.profit),
      settledAt:timestamp(record?.settlement?.settledAt),
      lockedAt:timestamp(record?.lockedAt)
    }));
    const invalid=normalized.some(item=>item.delta===null||!Number.isFinite(item.settledAt));
    if(invalid) return {points:[],total:0,invalid:true};
    const cutoff=now-WINDOW_MS;
    normalized.sort((a,b)=>a.settledAt-b.settledAt||(a.lockedAt-b.lockedAt)||a.index-b.index);
    let running=0;
    const points=normalized.filter(item=>item.settledAt>=cutoff).map(item=>{
      const open=running;
      const close=open+item.delta;
      running=close;
      return {open,delta:item.delta,close,settledAt:item.settledAt,key:stableKey(item),record:item.record};
    });
    return {points,total:running,invalid:false};
  };

  const hideTooltip=()=>{
    if(tooltip){
      tooltip.hidden=true;
      tooltip.removeAttribute('data-result-state');
    }
  };

  const clearHover=()=>{
    if(hoverKey===null&&hoverX===null&&hoverY===null) return false;
    hoverKey=null;
    hoverX=null;
    hoverY=null;
    return true;
  };

  const updateTooltip=(point,region,width,height)=>{
    if(!tooltip||!point||!region) return;
    const result=String(point?.record?.settlement?.result||'SETTLED').trim().toUpperCase()||'SETTLED';
    tooltip.innerHTML=`<span class="cumulative-unit-tooltip-date">${formatDateTime(point.settledAt)}</span><strong class="cumulative-unit-tooltip-result ${resultClass(result)}">${result}</strong><span>Result <b>${formatUnit(point.delta)}</b></span><span>Cumulative <b>${formatUnit(point.close)}</b></span>`;
    tooltip.dataset.resultState=resultClass(result);
    tooltip.hidden=false;
    tooltip.style.visibility='hidden';
    tooltip.style.left='0px';
    tooltip.style.top='0px';
    const tipWidth=tooltip.offsetWidth;
    const tipHeight=tooltip.offsetHeight;
    const gap=8;
    const margin=6;
    let left=region.center+gap;
    if(left+tipWidth>width-margin) left=region.center-tipWidth-gap;
    left=Math.max(margin,Math.min(width-tipWidth-margin,left));
    const anchorY=(region.top+region.bottom)/2;
    let top=anchorY-tipHeight/2;
    top=Math.max(margin,Math.min(height-tipHeight-margin,top));
    tooltip.style.left=`${Math.round(left)}px`;
    tooltip.style.top=`${Math.round(top)}px`;
    tooltip.style.visibility='visible';
  };

  const mount=()=>{
    if(chart?.isConnected) return true;
    const ledger=document.querySelector('.data-table')?.closest('.panel');
    const toolbar=ledger?.previousElementSibling;
    if(!ledger||!toolbar?.classList.contains('odds-display-toolbar')) return false;
    chart=document.createElement('section');
    chart.className='cumulative-unit-chart';
    chart.setAttribute('aria-labelledby','cumulativeUnitTitle');
    chart.innerHTML=`<div class="cumulative-unit-plot"><header class="cumulative-unit-head"><div><h2 class="cumulative-unit-title" id="cumulativeUnitTitle">CUMULATIVE UNIT</h2><span class="cumulative-unit-meta" data-unit-meta>365D · WAITING FOR SETTLED RESULTS</span></div><strong class="cumulative-unit-total" data-unit-total>+0.00u</strong></header><div class="cumulative-unit-surface"><canvas class="cumulative-unit-canvas" data-unit-canvas role="img" aria-label="Cumulative unit chart waiting for settled results"></canvas><div class="cumulative-unit-tooltip" data-unit-tooltip hidden></div><p class="cumulative-unit-empty" data-unit-empty>Waiting for settled results.</p></div></div><div class="cumulative-unit-explanation" role="note" aria-labelledby="cumulativeUnitExplanationTitle"><h3 class="cumulative-unit-explanation-title" id="cumulativeUnitExplanationTitle">HOW TO READ THIS CHART</h3><p class="cumulative-unit-explanation-copy"><span class="cumulative-unit-explanation-line"><strong class="cumulative-unit-explanation-key is-positive">Green bar</strong> — Positive Unit from a settled result. <strong class="cumulative-unit-explanation-key is-negative">Red bar</strong> — Negative Unit from a settled result.</span><span class="cumulative-unit-explanation-line">Each bar represents 1 settled result and continues from the previous cumulative Unit level.</span><span class="cumulative-unit-explanation-line"><strong class="cumulative-unit-explanation-key">Dashed line</strong> — Current cumulative Unit after the latest settled result.</span><span class="cumulative-unit-explanation-line"><strong class="cumulative-unit-explanation-key">1u</strong> = one standard reference unit, used to compare results consistently across different odds.</span><span class="cumulative-unit-explanation-line">Tap or click a bar to inspect that settled result. Pending results are excluded. Source: Result Ledger · Settled results only · Up to 365 days.</span></p></div>`;
    toolbar.insertAdjacentElement('afterend',chart);
    canvas=chart.querySelector('[data-unit-canvas]');
    empty=chart.querySelector('[data-unit-empty]');
    totalNode=chart.querySelector('[data-unit-total]');
    metaNode=chart.querySelector('[data-unit-meta]');
    tooltip=chart.querySelector('[data-unit-tooltip]');
    canvas.addEventListener('mousemove',event=>{
      if(!series.length||!hitRegions.length) return;
      const rect=canvas.getBoundingClientRect();
      const x=event.clientX-rect.left;
      const y=event.clientY-rect.top;
      const bounds=hitRegions[0];
      const insidePlot=x>=bounds.plotLeft&&x<=bounds.plotRight&&y>=bounds.plotTop&&y<=bounds.plotBottom;
      if(!insidePlot){
        if(clearHover()) scheduleDraw();
        return;
      }
      let nearest=hitRegions[0];
      let distance=Math.abs(x-nearest.center);
      for(let index=1;index<hitRegions.length;index+=1){
        const region=hitRegions[index];
        const next=Math.abs(x-region.center);
        if(next<distance){nearest=region;distance=next;}
      }
      hoverKey=nearest.key;
      hoverX=nearest.center;
      hoverY=Math.max(bounds.plotTop,Math.min(bounds.plotBottom,y));
      scheduleDraw();
    },{passive:true});
    canvas.addEventListener('mouseleave',()=>{
      if(clearHover()) scheduleDraw();
    },{passive:true});
    canvas.addEventListener('click',event=>{
      if(!series.length||!hitRegions.length) return;
      const rect=canvas.getBoundingClientRect();
      const x=event.clientX-rect.left;
      const y=event.clientY-rect.top;
      const insidePlot=y>=hitRegions[0].plotTop&&y<=hitRegions[0].plotBottom;
      if(!insidePlot){
        selectedKey=null;
        hideTooltip();
        scheduleDraw();
        return;
      }
      let nearest=null;
      let distance=Infinity;
      hitRegions.forEach(region=>{
        if(x<region.hitLeft||x>region.hitRight) return;
        const next=Math.abs(x-region.center);
        if(next<distance){nearest=region;distance=next;}
      });
      if(!nearest){
        selectedKey=null;
        hideTooltip();
        scheduleDraw();
        return;
      }
      selectedKey=nearest.key;
      scheduleDraw();
    });
    if('ResizeObserver' in window){
      resizeObserver=new ResizeObserver(scheduleDraw);
      resizeObserver.observe(canvas);
    }else window.addEventListener('resize',scheduleDraw,{passive:true});
    return true;
  };

  const clearCanvas=()=>{
    if(!canvas) return;
    hitRegions=[];
    clearHover();
    const ctx=canvas.getContext('2d');
    if(!ctx) return;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
  };

  const draw=()=>{
    frame=0;
    if(!canvas||!series.length) return;
    const rect=canvas.getBoundingClientRect();
    const width=Math.max(1,rect.width);
    const height=Math.max(1,rect.height);
    const dpr=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
    canvas.width=Math.round(width*dpr);
    canvas.height=Math.round(height*dpr);
    const ctx=canvas.getContext('2d');
    if(!ctx) return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);

    const plot={left:48,right:Math.max(58,width-10),top:9,bottom:Math.max(20,height-22)};
    const plotWidth=Math.max(1,plot.right-plot.left);
    const plotHeight=Math.max(1,plot.bottom-plot.top);
    const values=[0,...series.flatMap(point=>[point.open,point.close])];
    let low=Math.min(...values);
    let high=Math.max(...values);
    let span=high-low;
    if(span===0) span=2;
    const padding=Math.max(.15,span*.12);
    low=Math.min(0,low-padding);
    high=Math.max(0,high+padding);
    const range=Math.max(.000001,high-low);
    const y=value=>plot.top+(high-value)/range*plotHeight;

    ctx.font='8px Arial, sans-serif';
    ctx.textBaseline='middle';
    ctx.textAlign='right';
    for(let index=0;index<5;index+=1){
      const ratio=index/4;
      const value=high-range*ratio;
      const yPos=plot.top+plotHeight*ratio;
      ctx.beginPath();
      ctx.moveTo(plot.left,yPos);
      ctx.lineTo(plot.right,yPos);
      ctx.strokeStyle='rgba(128,136,131,.09)';
      ctx.lineWidth=1;
      ctx.stroke();
      ctx.fillStyle='rgba(148,156,151,.66)';
      ctx.fillText(formatAxis(value),plot.left-7,yPos);
    }

    ctx.beginPath();
    for(let index=1;index<6;index+=1){
      const xPos=plot.left+plotWidth*(index/6);
      ctx.moveTo(xPos,plot.top);
      ctx.lineTo(xPos,plot.bottom);
    }
    ctx.strokeStyle='rgba(128,136,131,.065)';
    ctx.lineWidth=1;
    ctx.stroke();

    const zeroY=y(0);
    ctx.beginPath();
    ctx.moveTo(plot.left,zeroY);
    ctx.lineTo(plot.right,zeroY);
    ctx.strokeStyle='rgba(176,185,179,.25)';
    ctx.lineWidth=1.1;
    ctx.stroke();

    const currentValue=series[series.length-1].close;
    const currentY=y(currentValue);
    const currentLineColor=currentValue>0?'rgba(92,177,108,.60)':currentValue<0?'rgba(207,91,96,.60)':'rgba(169,177,172,.60)';
    const currentTextColor=currentValue>0?'#68b777':currentValue<0?'#d16a6e':'#a9b1ac';
    ctx.setLineDash([2,3]);
    ctx.beginPath();
    ctx.moveTo(plot.left,currentY);
    ctx.lineTo(plot.right,currentY);
    ctx.strokeStyle=currentLineColor;
    ctx.lineWidth=1;
    ctx.stroke();
    ctx.setLineDash([]);

    const slot=plotWidth/series.length;
    const barWidth=Math.max(1,Math.min(12,slot*.66));
    const hitWidth=Math.max(barWidth,Math.min(24,slot));
    hitRegions=[];
    series.forEach((point,index)=>{
      const center=plot.left+slot*(index+.5);
      const openY=y(point.open);
      const closeY=y(point.close);
      const top=Math.min(openY,closeY);
      const bottom=Math.max(openY,closeY);
      const selected=point.key===selectedKey;
      hitRegions.push({key:point.key,index,center,top,bottom,hitLeft:center-hitWidth/2,hitRight:center+hitWidth/2,plotLeft:plot.left,plotRight:plot.right,plotTop:plot.top,plotBottom:plot.bottom});
      if(point.delta===0){
        ctx.beginPath();
        ctx.moveTo(center-barWidth/2,openY);
        ctx.lineTo(center+barWidth/2,openY);
        ctx.strokeStyle=selected?'rgba(224,231,227,.92)':'rgba(169,177,172,.76)';
        ctx.lineWidth=selected?1.6:1.25;
        ctx.stroke();
        return;
      }
      const barHeight=Math.abs(closeY-openY);
      ctx.fillStyle=point.delta>0?'rgba(76,157,94,.92)':'rgba(194,77,82,.92)';
      ctx.fillRect(center-barWidth/2,top,barWidth,barHeight);
      if(selected){
        ctx.fillStyle='rgba(255,255,255,.10)';
        ctx.fillRect(center-barWidth/2,top,barWidth,barHeight);
        ctx.strokeStyle='rgba(255,255,255,.28)';
        ctx.lineWidth=1;
        ctx.strokeRect(center-barWidth/2+.5,top+.5,Math.max(0,barWidth-1),Math.max(0,barHeight-1));
      }
    });

    if(hoverKey&&hoverX!==null&&hoverY!==null){
      const hoveredIndex=series.findIndex(point=>point.key===hoverKey);
      if(hoveredIndex>=0){
        const guideColor='rgba(170,178,173,.58)';
        ctx.save();
        ctx.setLineDash([2,2]);
        ctx.strokeStyle=guideColor;
        ctx.lineWidth=1;
        ctx.beginPath();
        ctx.moveTo(hoverX,plot.top);
        ctx.lineTo(hoverX,plot.bottom);
        ctx.moveTo(plot.left,hoverY);
        ctx.lineTo(plot.right,hoverY);
        ctx.stroke();
        ctx.restore();

        const hoverValue=high-((hoverY-plot.top)/plotHeight)*range;
        const valueText=formatUnit(hoverValue);
        ctx.font='700 8px Arial, sans-serif';
        ctx.textBaseline='middle';
        ctx.textAlign='left';
        const valueWidth=Math.ceil(ctx.measureText(valueText).width)+8;
        const valueHeight=14;
        const valueX=Math.max(2,plot.left-valueWidth-4);
        const valueY=Math.min(plot.bottom-valueHeight,Math.max(plot.top,hoverY-valueHeight/2));
        ctx.fillStyle='rgba(18,20,19,.94)';
        ctx.fillRect(valueX,valueY,valueWidth,valueHeight);
        ctx.fillStyle='rgba(190,198,193,.92)';
        ctx.fillText(valueText,valueX+4,valueY+valueHeight/2);

        const dateText=formatHoverDate(series[hoveredIndex].settledAt);
        ctx.font='700 8px Arial, sans-serif';
        const dateWidth=Math.ceil(ctx.measureText(dateText).width)+10;
        const dateHeight=14;
        const dateX=Math.max(plot.left,Math.min(plot.right-dateWidth,hoverX-dateWidth/2));
        const dateY=Math.max(plot.top,plot.bottom-dateHeight);
        ctx.fillStyle='rgba(18,20,19,.94)';
        ctx.fillRect(dateX,dateY,dateWidth,dateHeight);
        ctx.fillStyle='rgba(190,198,193,.92)';
        ctx.textBaseline='middle';
        ctx.textAlign='center';
        ctx.fillText(dateText,dateX+dateWidth/2,dateY+dateHeight/2);
      }else clearHover();
    }

    const currentLabel=formatUnit(currentValue);
    ctx.font='700 8px Arial, sans-serif';
    const labelWidth=Math.ceil(ctx.measureText(currentLabel).width)+8;
    const labelHeight=14;
    const labelX=Math.max(plot.left,plot.right-labelWidth);
    const labelY=Math.min(plot.bottom-labelHeight,Math.max(plot.top,currentY-labelHeight/2));
    ctx.fillStyle='rgba(15,17,16,.92)';
    ctx.fillRect(labelX,labelY,labelWidth,labelHeight);
    ctx.fillStyle=currentTextColor;
    ctx.textBaseline='middle';
    ctx.textAlign='right';
    ctx.fillText(currentLabel,plot.right-4,labelY+labelHeight/2);

    ctx.fillStyle='rgba(152,160,145,.72)';
    ctx.textBaseline='bottom';
    ctx.textAlign='left';
    ctx.fillText(formatDate(series[0].settledAt),plot.left,height-4);
    ctx.textAlign='right';
    ctx.fillText(formatDate(series[series.length-1].settledAt),plot.right,height-4);

    if(selectedKey){
      const selectedIndex=series.findIndex(point=>point.key===selectedKey);
      const region=hitRegions.find(item=>item.key===selectedKey);
      if(selectedIndex>=0&&region) updateTooltip(series[selectedIndex],region,width,height);
      else{
        selectedKey=null;
        hideTooltip();
      }
    }else hideTooltip();
  };

  function scheduleDraw(){
    if(frame) cancelAnimationFrame(frame);
    frame=requestAnimationFrame(draw);
  }

  const render=records=>{
    if(!mount()) return;
    const built=buildSeries(records);
    series=built.points;
    if(selectedKey&&!series.some(point=>point.key===selectedKey)) selectedKey=null;
    if(hoverKey&&!series.some(point=>point.key===hoverKey)) clearHover();
    totalNode.textContent=formatUnit(built.total);
    totalNode.classList.toggle('is-positive',built.total>0);
    totalNode.classList.toggle('is-negative',built.total<0);
    if(built.invalid){
      metaNode.textContent='365D · SETTLEMENT TIME UNAVAILABLE';
      empty.textContent='Cumulative unit is unavailable because a settled record has no reliable timestamp or unit value.';
      empty.hidden=false;
      canvas.setAttribute('aria-label','Cumulative unit chart unavailable because settled data is incomplete');
      hideTooltip();
      clearCanvas();
      return;
    }
    metaNode.textContent=`365D · ${series.length} SETTLED`;
    empty.textContent='No settled results in the last 365 days.';
    empty.hidden=series.length>0;
    canvas.setAttribute('aria-label',series.length?`Cumulative unit chart with ${series.length} settled results. Current total ${formatUnit(built.total)}. Tap or click a bar for details.`:'Cumulative unit chart with no settled results in the last 365 days');
    if(series.length) scheduleDraw();
    else{
      hideTooltip();
      clearCanvas();
    }
  };

  const start=()=>{
    mount();
    window.addEventListener(EVENT_NAME,event=>render(event?.detail?.records));
  };

  window.NOMAD_UNIT_CHART=Object.freeze({buildSeries,formatUnit,render});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();