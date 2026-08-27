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
  let resizeObserver=null;
  let series=[];
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
      return {open,delta:item.delta,close,settledAt:item.settledAt,record:item.record};
    });
    return {points,total:running,invalid:false};
  };

  const mount=()=>{
    if(chart?.isConnected) return true;
    const ledger=document.querySelector('.data-table')?.closest('.panel');
    const toolbar=ledger?.previousElementSibling;
    if(!ledger||!toolbar?.classList.contains('odds-display-toolbar')) return false;
    chart=document.createElement('section');
    chart.className='cumulative-unit-chart';
    chart.setAttribute('aria-labelledby','cumulativeUnitTitle');
    chart.innerHTML=`<header class="cumulative-unit-head"><div><h2 class="cumulative-unit-title" id="cumulativeUnitTitle">CUMULATIVE UNIT</h2><span class="cumulative-unit-meta" data-unit-meta>365D · WAITING FOR SETTLED RESULTS</span></div><strong class="cumulative-unit-total" data-unit-total>+0.00u</strong></header><div class="cumulative-unit-surface"><canvas class="cumulative-unit-canvas" data-unit-canvas role="img" aria-label="Cumulative unit chart waiting for settled results"></canvas><p class="cumulative-unit-empty" data-unit-empty>Waiting for settled results.</p></div>`;
    toolbar.insertAdjacentElement('afterend',chart);
    canvas=chart.querySelector('[data-unit-canvas]');
    empty=chart.querySelector('[data-unit-empty]');
    totalNode=chart.querySelector('[data-unit-total]');
    metaNode=chart.querySelector('[data-unit-meta]');
    if('ResizeObserver' in window){
      resizeObserver=new ResizeObserver(scheduleDraw);
      resizeObserver.observe(canvas);
    }else window.addEventListener('resize',scheduleDraw,{passive:true});
    return true;
  };

  const clearCanvas=()=>{
    if(!canvas) return;
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
    series.forEach((point,index)=>{
      const center=plot.left+slot*(index+.5);
      const openY=y(point.open);
      const closeY=y(point.close);
      if(point.delta===0){
        ctx.beginPath();
        ctx.moveTo(center-barWidth/2,openY);
        ctx.lineTo(center+barWidth/2,openY);
        ctx.strokeStyle='rgba(169,177,172,.76)';
        ctx.lineWidth=1.25;
        ctx.stroke();
        return;
      }
      const top=Math.min(openY,closeY);
      const barHeight=Math.abs(closeY-openY);
      ctx.fillStyle=point.delta>0?'rgba(76,157,94,.92)':'rgba(194,77,82,.92)';
      ctx.fillRect(center-barWidth/2,top,barWidth,barHeight);
    });

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
  };

  function scheduleDraw(){
    if(frame) cancelAnimationFrame(frame);
    frame=requestAnimationFrame(draw);
  }

  const render=records=>{
    if(!mount()) return;
    const built=buildSeries(records);
    series=built.points;
    totalNode.textContent=formatUnit(built.total);
    totalNode.classList.toggle('is-positive',built.total>0);
    totalNode.classList.toggle('is-negative',built.total<0);
    if(built.invalid){
      metaNode.textContent='365D · SETTLEMENT TIME UNAVAILABLE';
      empty.textContent='Cumulative unit is unavailable because a settled record has no reliable timestamp or unit value.';
      empty.hidden=false;
      canvas.setAttribute('aria-label','Cumulative unit chart unavailable because settled data is incomplete');
      clearCanvas();
      return;
    }
    metaNode.textContent=`365D · ${series.length} SETTLED`;
    empty.textContent='No settled results in the last 365 days.';
    empty.hidden=series.length>0;
    canvas.setAttribute('aria-label',series.length?`Cumulative unit chart with ${series.length} settled results. Current total ${formatUnit(built.total)}.`:'Cumulative unit chart with no settled results in the last 365 days');
    if(series.length) scheduleDraw();
    else clearCanvas();
  };

  const start=()=>{
    mount();
    window.addEventListener(EVENT_NAME,event=>render(event?.detail?.records));
  };

  window.NOMAD_UNIT_CHART=Object.freeze({buildSeries,formatUnit,render});
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
