(()=>{
  'use strict';

  const STORAGE_KEY='nomadStatisticsEma341';
  const EVENT_NAME='nomad:statistics-records';
  const DEFAULT_LINES=Object.freeze([
    Object.freeze({enabled:true,period:5,color:'#55d97a'}),
    Object.freeze({enabled:true,period:10,color:'#4da3ff'}),
    Object.freeze({enabled:true,period:20,color:'#f2c94c'}),
    Object.freeze({enabled:true,period:50,color:'#ff8a4c'}),
    Object.freeze({enabled:true,period:100,color:'#c084fc'}),
  ]);

  const clampPeriod=value=>{
    const number=Math.trunc(Number(value));
    return Number.isFinite(number)?Math.max(1,Math.min(250,number)):1;
  };
  const validColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''));
  const normalizeLines=value=>DEFAULT_LINES.map((fallback,index)=>{
    const candidate=Array.isArray(value)?value[index]:null;
    return {
      enabled:candidate?.enabled===undefined?fallback.enabled:Boolean(candidate.enabled),
      period:candidate?.period===undefined?fallback.period:clampPeriod(candidate.period),
      color:validColor(candidate?.color)?String(candidate.color).toLowerCase():fallback.color,
    };
  });
  const buildEma=(points,period)=>{
    const length=clampPeriod(period);
    const closes=(Array.isArray(points)?points:[]).map(point=>Number(point?.close));
    if(closes.length<length||closes.some(value=>!Number.isFinite(value)))return [];
    let ema=closes.slice(0,length).reduce((sum,value)=>sum+value,0)/length;
    const alpha=2/(length+1);
    const out=[{index:length-1,value:ema}];
    for(let index=length;index<closes.length;index+=1){
      ema=(closes[index]*alpha)+(ema*(1-alpha));
      out.push({index,value:ema});
    }
    return out;
  };

  if(typeof window==='undefined'||typeof document==='undefined'){
    if(typeof module!=='undefined'&&module.exports)module.exports={DEFAULT_LINES,normalizeLines,buildEma};
    return;
  }

  let lines=readLines();
  let records=[];
  let series=[];
  let chart=null;
  let surface=null;
  let overlay=null;
  let panel=null;
  let button=null;
  let legend=null;
  let resizeObserver=null;
  let frame=0;

  function readLines(){
    try{return normalizeLines(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}
    catch{return normalizeLines(null);}
  }
  function saveLines(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(lines));}catch{}
  }
  function chartSeries(nextRecords){
    const api=window.NOMAD_UNIT_CHART;
    if(!api?.buildSeries)return [];
    const built=api.buildSeries(nextRecords);
    return built?.invalid?[]:(Array.isArray(built?.points)?built.points:[]);
  }
  function setOpen(open){
    if(!panel||!button)return;
    panel.hidden=!open;
    button.setAttribute('aria-expanded',open?'true':'false');
  }
  function renderLegend(){
    if(!legend)return;
    const active=lines.map((line,index)=>({line,index})).filter(item=>item.line.enabled);
    legend.innerHTML=active.length?active.map(({line})=>`<span class="statistics-ema-legend-item"><i style="--ema-color:${line.color}"></i>EMA ${line.period}</span>`).join(''):'<span class="statistics-ema-legend-empty">EMA OFF</span>';
  }
  function panelHtml(){
    return `<div class="statistics-ema-panel-head"><strong>EMA INDICATOR</strong><button type="button" data-ema-close aria-label="Close EMA settings">×</button></div>
      <div class="statistics-ema-panel-note">Period = settled results</div>
      <div class="statistics-ema-rows">${lines.map((line,index)=>`<label class="statistics-ema-row" data-ema-row="${index}">
        <input type="checkbox" data-ema-enabled ${line.enabled?'checked':''} aria-label="EMA ${index+1} enabled">
        <span>EMA ${index+1}</span>
        <input class="statistics-ema-period" type="number" min="1" max="250" step="1" value="${line.period}" data-ema-period aria-label="EMA ${index+1} period">
        <input class="statistics-ema-color" type="color" value="${line.color}" data-ema-color aria-label="EMA ${index+1} color">
      </label>`).join('')}</div>
      <div class="statistics-ema-panel-actions"><button type="button" data-ema-reset>RESET</button><span>Auto saved</span></div>`;
  }
  function bindPanel(){
    if(!panel)return;
    panel.querySelector('[data-ema-close]')?.addEventListener('click',()=>setOpen(false));
    panel.querySelector('[data-ema-reset]')?.addEventListener('click',()=>{
      lines=normalizeLines(null);
      saveLines();
      panel.innerHTML=panelHtml();
      bindPanel();
      renderLegend();
      scheduleDraw();
    });
    panel.querySelectorAll('[data-ema-row]').forEach(row=>{
      const index=Number(row.dataset.emaRow);
      const enabled=row.querySelector('[data-ema-enabled]');
      const period=row.querySelector('[data-ema-period]');
      const color=row.querySelector('[data-ema-color]');
      const commit=()=>{
        lines[index]={
          enabled:Boolean(enabled?.checked),
          period:clampPeriod(period?.value),
          color:validColor(color?.value)?String(color.value).toLowerCase():DEFAULT_LINES[index].color,
        };
        if(period)period.value=String(lines[index].period);
        if(color)color.value=lines[index].color;
        saveLines();
        renderLegend();
        scheduleDraw();
      };
      enabled?.addEventListener('change',commit);
      period?.addEventListener('change',commit);
      color?.addEventListener('input',commit);
    });
  }
  function mount(){
    if(chart?.isConnected&&overlay?.isConnected)return true;
    chart=document.querySelector('.cumulative-unit-chart');
    surface=chart?.querySelector('.cumulative-unit-surface')||null;
    const head=chart?.querySelector('.cumulative-unit-head')||null;
    const headCopy=head?.firstElementChild||null;
    const total=head?.querySelector('[data-unit-total]')||null;
    if(!chart||!surface||!head||!headCopy||!total)return false;

    chart.classList.add('has-statistics-ema');
    overlay=document.createElement('canvas');
    overlay.className='statistics-ema-overlay';
    overlay.setAttribute('aria-hidden','true');
    surface.appendChild(overlay);

    legend=document.createElement('div');
    legend.className='statistics-ema-legend';
    headCopy.appendChild(legend);

    const control=document.createElement('div');
    control.className='statistics-ema-control';
    button=document.createElement('button');
    button.type='button';
    button.className='statistics-ema-button';
    button.textContent='EMA';
    button.setAttribute('aria-haspopup','dialog');
    button.setAttribute('aria-expanded','false');
    button.setAttribute('aria-label','EMA indicator settings');
    control.appendChild(button);
    total.insertAdjacentElement('beforebegin',control);

    panel=document.createElement('div');
    panel.className='statistics-ema-panel';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','EMA indicator settings');
    panel.hidden=true;
    panel.innerHTML=panelHtml();
    chart.appendChild(panel);
    bindPanel();
    renderLegend();

    button.addEventListener('click',event=>{
      event.stopPropagation();
      setOpen(panel.hidden);
    });
    panel.addEventListener('click',event=>event.stopPropagation());
    document.addEventListener('click',()=>setOpen(false));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});

    if('ResizeObserver'in window){
      resizeObserver?.disconnect();
      resizeObserver=new ResizeObserver(scheduleDraw);
      resizeObserver.observe(surface);
    }else window.addEventListener('resize',scheduleDraw,{passive:true});
    return true;
  }
  function draw(){
    frame=0;
    if(!mount())return;
    const rect=surface.getBoundingClientRect();
    const width=Math.max(1,rect.width),height=Math.max(1,rect.height);
    const dpr=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
    overlay.width=Math.round(width*dpr);
    overlay.height=Math.round(height*dpr);
    const ctx=overlay.getContext('2d');
    if(!ctx)return;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,width,height);
    if(!series.length)return;

    const plot={left:48,right:Math.max(58,width-10),top:9,bottom:Math.max(20,height-22)};
    const plotWidth=Math.max(1,plot.right-plot.left),plotHeight=Math.max(1,plot.bottom-plot.top);
    const values=[0,...series.flatMap(point=>[Number(point.open),Number(point.close)]).filter(Number.isFinite)];
    let low=Math.min(...values),high=Math.max(...values),span=high-low;
    if(span===0)span=2;
    const padding=Math.max(.15,span*.12);
    low=Math.min(0,low-padding);
    high=Math.max(0,high+padding);
    const range=Math.max(.000001,high-low);
    const y=value=>plot.top+(high-value)/range*plotHeight;
    const slot=plotWidth/series.length;

    for(const line of lines){
      if(!line.enabled)continue;
      const ema=buildEma(series,line.period);
      if(!ema.length)continue;
      ctx.save();
      ctx.beginPath();
      ema.forEach((point,index)=>{
        const x=plot.left+slot*(point.index+.5),yPos=y(point.value);
        if(index===0)ctx.moveTo(x,yPos);else ctx.lineTo(x,yPos);
      });
      ctx.strokeStyle=line.color;
      ctx.globalAlpha=.9;
      ctx.lineWidth=1.35;
      ctx.lineJoin='round';
      ctx.lineCap='round';
      ctx.stroke();
      ctx.restore();
    }
  }
  function scheduleDraw(){
    if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(draw);
  }
  function render(nextRecords){
    records=Array.isArray(nextRecords)?nextRecords:[];
    series=chartSeries(records);
    scheduleDraw();
  }
  function start(){
    mount();
    if(records.length)render(records);else scheduleDraw();
  }

  window.addEventListener(EVENT_NAME,event=>render(event?.detail?.records));
  window.NOMAD_STATISTICS_EMA=Object.freeze({buildEma,normalizeLines,getSettings:()=>lines.map(line=>({...line})),redraw:scheduleDraw});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();