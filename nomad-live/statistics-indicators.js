(()=>{
  'use strict';

  const STORAGE_KEY='nomadStatisticsIndicators341';
  const EVENT_NAME='nomad:statistics-records';
  const DEFAULTS=Object.freeze({
    bollinger:Object.freeze({enabled:true,period:20,deviation:2}),
    rsi:Object.freeze({enabled:true,period:14}),
    drawdown:Object.freeze({enabled:true})
  });

  const clampInt=(value,min,max,fallback)=>{
    const number=Math.trunc(Number(value));
    return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
  };
  const clampNumber=(value,min,max,fallback)=>{
    const number=Number(value);
    return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;
  };
  const normalizeSettings=value=>({
    bollinger:{
      enabled:value?.bollinger?.enabled===undefined?DEFAULTS.bollinger.enabled:Boolean(value.bollinger.enabled),
      period:clampInt(value?.bollinger?.period,2,250,DEFAULTS.bollinger.period),
      deviation:clampNumber(value?.bollinger?.deviation,.1,6,DEFAULTS.bollinger.deviation)
    },
    rsi:{
      enabled:value?.rsi?.enabled===undefined?DEFAULTS.rsi.enabled:Boolean(value.rsi.enabled),
      period:clampInt(value?.rsi?.period,2,100,DEFAULTS.rsi.period)
    },
    drawdown:{enabled:value?.drawdown?.enabled===undefined?DEFAULTS.drawdown.enabled:Boolean(value.drawdown.enabled)}
  });
  const closesFrom=points=>(Array.isArray(points)?points:[]).map(point=>Number(point?.close));
  const buildBollinger=(points,period=20,deviation=2)=>{
    const length=clampInt(period,2,250,20),mult=clampNumber(deviation,.1,6,2),closes=closesFrom(points);
    if(closes.length<length||closes.some(value=>!Number.isFinite(value)))return [];
    const out=[];
    for(let index=length-1;index<closes.length;index+=1){
      const slice=closes.slice(index-length+1,index+1);
      const mean=slice.reduce((sum,value)=>sum+value,0)/length;
      const variance=slice.reduce((sum,value)=>sum+((value-mean)**2),0)/length;
      const sd=Math.sqrt(variance);
      out.push({index,middle:mean,upper:mean+(mult*sd),lower:mean-(mult*sd)});
    }
    return out;
  };
  const rsiValue=(avgGain,avgLoss)=>{
    if(avgGain===0&&avgLoss===0)return 50;
    if(avgLoss===0)return 100;
    if(avgGain===0)return 0;
    const rs=avgGain/avgLoss;
    return 100-(100/(1+rs));
  };
  const buildRsi=(points,period=14)=>{
    const length=clampInt(period,2,100,14),closes=closesFrom(points);
    if(closes.length<=length||closes.some(value=>!Number.isFinite(value)))return [];
    let gainSum=0,lossSum=0;
    for(let index=1;index<=length;index+=1){
      const change=closes[index]-closes[index-1];
      if(change>0)gainSum+=change;else if(change<0)lossSum+=Math.abs(change);
    }
    let avgGain=gainSum/length,avgLoss=lossSum/length;
    const out=[{index:length,value:rsiValue(avgGain,avgLoss)}];
    for(let index=length+1;index<closes.length;index+=1){
      const change=closes[index]-closes[index-1];
      const gain=Math.max(0,change),loss=Math.max(0,-change);
      avgGain=((avgGain*(length-1))+gain)/length;
      avgLoss=((avgLoss*(length-1))+loss)/length;
      out.push({index,value:rsiValue(avgGain,avgLoss)});
    }
    return out;
  };
  const buildDrawdown=points=>{
    const closes=closesFrom(points);
    if(closes.some(value=>!Number.isFinite(value)))return [];
    let peak=0;
    return closes.map((close,index)=>{
      peak=Math.max(peak,close);
      return {index,value:close-peak,peak,close};
    });
  };

  if(typeof window==='undefined'||typeof document==='undefined'){
    if(typeof module!=='undefined'&&module.exports)module.exports={DEFAULTS,normalizeSettings,buildBollinger,buildRsi,buildDrawdown};
    return;
  }

  let settings=readSettings();
  let records=[];
  let series=[];
  let chart=null;
  let surface=null;
  let bollingerCanvas=null;
  let panel=null;
  let button=null;
  let rsiPanel=null;
  let rsiCanvas=null;
  let rsiValueNode=null;
  let drawdownPanel=null;
  let drawdownCanvas=null;
  let drawdownValueNode=null;
  let resizeObserver=null;
  let mountObserver=null;
  let frame=0;

  function readSettings(){
    try{return normalizeSettings(JSON.parse(localStorage.getItem(STORAGE_KEY)||'null'));}
    catch{return normalizeSettings(null);}
  }
  function saveSettings(){
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(settings));}catch{}
  }
  function chartSeries(nextRecords){
    const api=window.NOMAD_UNIT_CHART;
    if(!api?.buildSeries)return [];
    const built=api.buildSeries(nextRecords);
    return built?.invalid?[]:(Array.isArray(built?.points)?built.points:[]);
  }
  function unit(value){
    const number=Number(value)||0;
    return `${number>0?'+':''}${number.toFixed(2)}u`;
  }
  function setOpen(open){
    if(!panel||!button)return;
    panel.hidden=!open;
    button.setAttribute('aria-expanded',open?'true':'false');
  }
  function settingsHtml(){
    return `<div class="statistics-indicator-panel-head"><strong>INDICATORS</strong><button type="button" data-ind-close aria-label="Close indicator settings">×</button></div>
      <div class="statistics-indicator-panel-note">Cumulative Unit only · no event statistics</div>
      <div class="statistics-indicator-settings">
        <section><label><input type="checkbox" data-bb-enabled ${settings.bollinger.enabled?'checked':''}> Bollinger Bands</label><div><span>Period</span><input type="number" min="2" max="250" step="1" value="${settings.bollinger.period}" data-bb-period><span>Deviation</span><input type="number" min="0.1" max="6" step="0.1" value="${settings.bollinger.deviation}" data-bb-deviation></div></section>
        <section><label><input type="checkbox" data-rsi-enabled ${settings.rsi.enabled?'checked':''}> RSI</label><div><span>Period</span><input type="number" min="2" max="100" step="1" value="${settings.rsi.period}" data-rsi-period></div></section>
        <section><label><input type="checkbox" data-dd-enabled ${settings.drawdown.enabled?'checked':''}> Drawdown</label><div><span>Unit from previous peak</span></div></section>
      </div>
      <div class="statistics-indicator-panel-actions"><button type="button" data-ind-reset>RESET</button><span>Auto saved</span></div>`;
  }
  function syncPanels(){
    if(rsiPanel)rsiPanel.hidden=!settings.rsi.enabled;
    if(drawdownPanel)drawdownPanel.hidden=!settings.drawdown.enabled;
  }
  function bindSettings(){
    if(!panel)return;
    panel.querySelector('[data-ind-close]')?.addEventListener('click',()=>setOpen(false));
    panel.querySelector('[data-ind-reset]')?.addEventListener('click',()=>{
      settings=normalizeSettings(null);
      saveSettings();
      panel.innerHTML=settingsHtml();
      bindSettings();
      syncPanels();
      scheduleDraw();
    });
    const bbEnabled=panel.querySelector('[data-bb-enabled]'),bbPeriod=panel.querySelector('[data-bb-period]'),bbDeviation=panel.querySelector('[data-bb-deviation]');
    const rsiEnabled=panel.querySelector('[data-rsi-enabled]'),rsiPeriod=panel.querySelector('[data-rsi-period]'),ddEnabled=panel.querySelector('[data-dd-enabled]');
    const commit=()=>{
      settings=normalizeSettings({
        bollinger:{enabled:Boolean(bbEnabled?.checked),period:bbPeriod?.value,deviation:bbDeviation?.value},
        rsi:{enabled:Boolean(rsiEnabled?.checked),period:rsiPeriod?.value},
        drawdown:{enabled:Boolean(ddEnabled?.checked)}
      });
      if(bbPeriod)bbPeriod.value=String(settings.bollinger.period);
      if(bbDeviation)bbDeviation.value=String(settings.bollinger.deviation);
      if(rsiPeriod)rsiPeriod.value=String(settings.rsi.period);
      saveSettings();
      syncPanels();
      scheduleDraw();
    };
    bbEnabled?.addEventListener('change',commit);bbPeriod?.addEventListener('change',commit);bbDeviation?.addEventListener('change',commit);
    rsiEnabled?.addEventListener('change',commit);rsiPeriod?.addEventListener('change',commit);ddEnabled?.addEventListener('change',commit);
  }
  function createSubpanel(kind,title,meta){
    const section=document.createElement('section');
    section.className=`statistics-indicator-subpanel statistics-${kind}-panel`;
    section.innerHTML=`<header><div><strong>${title}</strong><span>${meta}</span></div><b data-${kind}-value>—</b></header><div class="statistics-indicator-canvas-wrap"><canvas class="statistics-${kind}-canvas" aria-hidden="true"></canvas></div>`;
    return section;
  }
  function mount(){
    if(chart?.isConnected&&surface?.isConnected&&bollingerCanvas?.isConnected)return true;
    chart=document.querySelector('.cumulative-unit-chart');
    surface=chart?.querySelector('.cumulative-unit-surface')||null;
    const head=chart?.querySelector('.cumulative-unit-head')||null;
    const total=head?.querySelector('[data-unit-total]')||null;
    const plot=chart?.querySelector('.cumulative-unit-plot')||null;
    if(!chart||!surface||!head||!total||!plot)return false;

    chart.classList.add('has-statistics-indicators');
    bollingerCanvas=document.createElement('canvas');
    bollingerCanvas.className='statistics-bollinger-overlay';
    bollingerCanvas.setAttribute('aria-hidden','true');
    surface.appendChild(bollingerCanvas);

    const control=document.createElement('div');
    control.className='statistics-indicator-control';
    button=document.createElement('button');
    button.type='button';button.className='statistics-indicator-button';button.textContent='IND';
    button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','Performance indicator settings');
    control.appendChild(button);total.insertAdjacentElement('beforebegin',control);

    panel=document.createElement('div');
    panel.className='statistics-indicator-panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Performance indicator settings');panel.hidden=true;panel.innerHTML=settingsHtml();chart.appendChild(panel);bindSettings();

    rsiPanel=createSubpanel('rsi','RSI',`Wilder · ${settings.rsi.period} settled results`);
    rsiCanvas=rsiPanel.querySelector('.statistics-rsi-canvas');rsiValueNode=rsiPanel.querySelector('[data-rsi-value]');
    drawdownPanel=createSubpanel('drawdown','DRAWDOWN','Unit below previous peak');
    drawdownCanvas=drawdownPanel.querySelector('.statistics-drawdown-canvas');drawdownValueNode=drawdownPanel.querySelector('[data-drawdown-value]');
    plot.insertAdjacentElement('afterend',rsiPanel);rsiPanel.insertAdjacentElement('afterend',drawdownPanel);syncPanels();

    button.addEventListener('click',event=>{event.stopPropagation();setOpen(panel.hidden);});
    panel.addEventListener('click',event=>event.stopPropagation());
    document.addEventListener('click',()=>setOpen(false));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')setOpen(false);});

    if('ResizeObserver'in window){
      resizeObserver?.disconnect();resizeObserver=new ResizeObserver(scheduleDraw);resizeObserver.observe(surface);resizeObserver.observe(rsiPanel);resizeObserver.observe(drawdownPanel);
    }else window.addEventListener('resize',scheduleDraw,{passive:true});
    mountObserver?.disconnect();mountObserver=null;
    return true;
  }
  function ensureMount(){
    if(mount())return;
    if(mountObserver)return;
    mountObserver=new MutationObserver(()=>{if(mount())scheduleDraw();});
    mountObserver.observe(document.body,{childList:true,subtree:true});
  }
  function setupCanvas(canvas){
    const rect=canvas.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),dpr=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const ctx=canvas.getContext('2d');if(!ctx)return null;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    return {ctx,width,height};
  }
  function xFor(index,count,left,right){
    const width=Math.max(1,right-left),slot=width/Math.max(1,count);
    return left+slot*(index+.5);
  }
  function drawBollinger(){
    const ready=setupCanvas(bollingerCanvas);if(!ready)return;
    const {ctx,width,height}=ready;if(!settings.bollinger.enabled||!series.length)return;
    const rows=buildBollinger(series,settings.bollinger.period,settings.bollinger.deviation);if(!rows.length)return;
    const plot={left:48,right:Math.max(58,width-10),top:9,bottom:Math.max(20,height-22)},plotHeight=Math.max(1,plot.bottom-plot.top);
    const values=[0,...series.flatMap(point=>[Number(point.open),Number(point.close)]).filter(Number.isFinite)];
    let low=Math.min(...values),high=Math.max(...values),span=high-low;if(span===0)span=2;
    const padding=Math.max(.15,span*.12);low=Math.min(0,low-padding);high=Math.max(0,high+padding);const range=Math.max(.000001,high-low);
    const y=value=>Math.max(plot.top,Math.min(plot.bottom,plot.top+(high-value)/range*plotHeight));
    const point=(row,key)=>[xFor(row.index,series.length,plot.left,plot.right),y(row[key])];
    ctx.save();ctx.beginPath();
    rows.forEach((row,index)=>{const [x,yPos]=point(row,'upper');if(index===0)ctx.moveTo(x,yPos);else ctx.lineTo(x,yPos);});
    for(let index=rows.length-1;index>=0;index-=1){const [x,yPos]=point(rows[index],'lower');ctx.lineTo(x,yPos);}ctx.closePath();ctx.fillStyle='rgba(132,151,140,.075)';ctx.fill();
    const drawLine=(key,stroke,widthPx,alpha)=>{ctx.beginPath();rows.forEach((row,index)=>{const [x,yPos]=point(row,key);if(index===0)ctx.moveTo(x,yPos);else ctx.lineTo(x,yPos);});ctx.strokeStyle=stroke;ctx.globalAlpha=alpha;ctx.lineWidth=widthPx;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.globalAlpha=1;};
    drawLine('upper','#8e9b93',1,.62);drawLine('lower','#8e9b93',1,.62);drawLine('middle','#aeb8b1',.9,.42);ctx.restore();
  }
  function panelGrid(ctx,left,right,levels,mapper){
    ctx.save();ctx.font='7px Arial,sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
    levels.forEach(level=>{const y=mapper(level);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.strokeStyle='rgba(135,145,138,.10)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='rgba(137,147,140,.58)';ctx.fillText(String(level),left-6,y);});ctx.restore();
  }
  function drawRsi(){
    if(!rsiCanvas)return;const ready=setupCanvas(rsiCanvas);if(!ready)return;const {ctx,width,height}=ready;
    const rows=buildRsi(series,settings.rsi.period);if(rsiValueNode)rsiValueNode.textContent=rows.length?rows.at(-1).value.toFixed(1):'—';
    const meta=rsiPanel?.querySelector('header span');if(meta)meta.textContent=`Wilder · ${settings.rsi.period} settled results`;
    if(!rows.length)return;
    const plot={left:48,right:Math.max(58,width-10),top:7,bottom:Math.max(18,height-10)},y=value=>plot.top+((100-value)/100)*(plot.bottom-plot.top);
    panelGrid(ctx,plot.left,plot.right,[70,50,30],y);
    ctx.save();ctx.beginPath();rows.forEach((row,index)=>{const x=xFor(row.index,series.length,plot.left,plot.right),yPos=y(row.value);if(index===0)ctx.moveTo(x,yPos);else ctx.lineTo(x,yPos);});ctx.strokeStyle='#aeb8b1';ctx.lineWidth=1.25;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.restore();
  }
  function drawDrawdown(){
    if(!drawdownCanvas)return;const ready=setupCanvas(drawdownCanvas);if(!ready)return;const {ctx,width,height}=ready;
    const rows=buildDrawdown(series);if(drawdownValueNode)drawdownValueNode.textContent=rows.length?unit(rows.at(-1).value):'—';if(!rows.length)return;
    const min=Math.min(0,...rows.map(row=>row.value)),floor=min===0?-1:min*1.08,plot={left:48,right:Math.max(58,width-10),top:7,bottom:Math.max(18,height-10)},range=Math.max(.000001,0-floor),y=value=>plot.top+((0-value)/range)*(plot.bottom-plot.top);
    panelGrid(ctx,plot.left,plot.right,[0,Number((floor/2).toFixed(2)),Number(floor.toFixed(2))],y);
    ctx.save();ctx.beginPath();ctx.moveTo(xFor(0,series.length,plot.left,plot.right),y(0));rows.forEach(row=>ctx.lineTo(xFor(row.index,series.length,plot.left,plot.right),y(row.value)));ctx.lineTo(xFor(rows.at(-1).index,series.length,plot.left,plot.right),y(0));ctx.closePath();ctx.fillStyle='rgba(180,91,91,.085)';ctx.fill();
    ctx.beginPath();rows.forEach((row,index)=>{const x=xFor(row.index,series.length,plot.left,plot.right),yPos=y(row.value);if(index===0)ctx.moveTo(x,yPos);else ctx.lineTo(x,yPos);});ctx.strokeStyle='#b87a7a';ctx.lineWidth=1.15;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.restore();
  }
  function draw(){frame=0;ensureMount();if(!mount())return;drawBollinger();if(settings.rsi.enabled)drawRsi();if(settings.drawdown.enabled)drawDrawdown();}
  function scheduleDraw(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}
  function render(nextRecords){records=Array.isArray(nextRecords)?nextRecords:[];series=chartSeries(records);scheduleDraw();}
  function start(){ensureMount();scheduleDraw();}

  window.addEventListener(EVENT_NAME,event=>render(event?.detail?.records));
  window.NOMAD_STATISTICS_INDICATORS=Object.freeze({buildBollinger,buildRsi,buildDrawdown,normalizeSettings,getSettings:()=>JSON.parse(JSON.stringify(settings)),redraw:scheduleDraw});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();