(()=>{
  'use strict';

  const STORAGE_KEY='nomadStatisticsViewport341';
  const EVENT_NAME='nomad:statistics-records';
  const PRESETS=[50,100,200,500,'ALL'];
  const DRAG_THRESHOLD=6;
  let rawRecords=[];
  let series=[];
  let cache={ema:[],bb:[],rsi:[],dd:[]};
  let chart=null,plot=null,surface=null,canvas=null,tooltip=null;
  let bbCanvas=null,emaCanvas=null,rsiCanvas=null,ddCanvas=null,rsiPanel=null,ddPanel=null;
  let control=null,rangeSelect=null,zoomOutButton=null,zoomInButton=null,latestButton=null,statusNode=null;
  let observer=null,resizeObserver=null,frame=0,mounted=false;
  let viewport={size:readSaved(),end:0,followLatest:true};
  let hitRegions=[],hoverKey=null,hoverX=null,hoverY=null,selectedKey=null;
  let pointerDown=false,pointerId=null,dragStartX=0,dragStartEnd=0,dragMoved=false,suppressClick=false;

  function normalizeSize(value){
    if(String(value).toUpperCase()==='ALL')return 'ALL';
    const number=Math.trunc(Number(value));
    return PRESETS.includes(number)?number:'ALL';
  }
  function readSaved(){try{return normalizeSize(localStorage.getItem(STORAGE_KEY)||'ALL');}catch{return 'ALL';}}
  function saveSize(value){try{localStorage.setItem(STORAGE_KEY,String(value));}catch{}}
  function resolveViewport(length=series.length){
    const total=Math.max(0,Math.trunc(Number(length))||0),size=normalizeSize(viewport.size);
    if(size==='ALL'||total<=size)return {size,total,start:0,end:total,count:total,followLatest:true,canPan:false};
    const minEnd=Math.min(size,total),maxEnd=total;
    let end=viewport.followLatest?maxEnd:Math.trunc(Number(viewport.end)||maxEnd);
    end=Math.max(minEnd,Math.min(maxEnd,end));
    return {size,total,start:Math.max(0,end-size),end,count:Math.min(size,total),followLatest:Boolean(viewport.followLatest&&end===maxEnd),canPan:true};
  }
  function visibleSeries(){const view=resolveViewport();return {view,points:series.slice(view.start,view.end)};}
  function clearHover(){hoverKey=null;hoverX=null;hoverY=null;}
  function hideTooltip(){if(tooltip)tooltip.hidden=true;}
  function setSize(value){
    viewport.size=normalizeSize(value);viewport.end=series.length;viewport.followLatest=true;saveSize(viewport.size);
    clearHover();hideTooltip();syncControls();scheduleDraw();
  }
  function setEnd(end){
    const view=resolveViewport();
    if(!view.canPan){viewport.end=series.length;viewport.followLatest=true;}
    else{
      viewport.end=Math.max(view.size,Math.min(series.length,Math.trunc(Number(end)||view.end)));
      viewport.followLatest=viewport.end===series.length;
    }
    clearHover();hideTooltip();syncControls();scheduleDraw();
  }
  function goLatest(){viewport.end=series.length;viewport.followLatest=true;clearHover();hideTooltip();syncControls();scheduleDraw();}
  function zoomStep(direction){
    const view=resolveViewport();let index=PRESETS.findIndex(item=>String(item)===String(view.size));if(index<0)index=PRESETS.length-1;
    const next=Math.max(0,Math.min(PRESETS.length-1,index+direction));if(next!==index)setSize(PRESETS[next]);
  }

  function buildFullSeries(){
    const api=window.NOMAD_UNIT_CHART;if(!api?.buildSeries)return false;
    const old=resolveViewport(),anchor=!old.followLatest&&old.count?series[old.end-1]?.key:null;
    const built=api.buildSeries(rawRecords);series=built?.invalid?[]:(Array.isArray(built?.points)?built.points:[]);
    if(viewport.size==='ALL'||old.followLatest){viewport.end=series.length;viewport.followLatest=true;}
    else if(anchor){const index=series.findIndex(point=>point.key===anchor);viewport.end=index>=0?index+1:Math.min(series.length,old.end);viewport.followLatest=false;}
    else{viewport.end=Math.min(series.length,old.end);viewport.followLatest=false;}
    rebuildCache();syncControls();scheduleDraw();return true;
  }
  function rebuildCache(){
    const emaApi=window.NOMAD_STATISTICS_EMA,indApi=window.NOMAD_STATISTICS_INDICATORS;
    const emaSettings=emaApi?.getSettings?.()||[];
    const indSettings=indApi?.getSettings?.()||{};
    cache.ema=emaSettings.map(line=>({line,rows:line.enabled&&emaApi?.buildEma?emaApi.buildEma(series,line.period):[]}));
    cache.bb=indSettings?.bollinger?.enabled&&indApi?.buildBollinger?indApi.buildBollinger(series,indSettings.bollinger.period,indSettings.bollinger.deviation):[];
    cache.rsi=indSettings?.rsi?.enabled&&indApi?.buildRsi?indApi.buildRsi(series,indSettings.rsi.period):[];
    cache.dd=indSettings?.drawdown?.enabled&&indApi?.buildDrawdown?indApi.buildDrawdown(series):[];
  }
  function scheduleSettingsRefresh(){setTimeout(()=>{rebuildCache();scheduleDraw();},0);}

  function setupCanvas(target){
    if(!target)return null;const rect=target.getBoundingClientRect(),width=Math.max(1,rect.width),height=Math.max(1,rect.height),dpr=Math.min(2.5,Math.max(1,window.devicePixelRatio||1));
    target.width=Math.round(width*dpr);target.height=Math.round(height*dpr);const ctx=target.getContext('2d');if(!ctx)return null;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);return {ctx,width,height};
  }
  function geometry(width,height){
    const {view,points}=visibleSeries();if(!points.length)return null;
    const plotBox={left:48,right:Math.max(58,width-10),top:9,bottom:Math.max(20,height-22)},plotWidth=Math.max(1,plotBox.right-plotBox.left),plotHeight=Math.max(1,plotBox.bottom-plotBox.top);
    const values=[0,...points.flatMap(point=>[Number(point.open),Number(point.close)]).filter(Number.isFinite)];
    let low=Math.min(...values),high=Math.max(...values),span=high-low;if(span===0)span=2;
    const padding=Math.max(.15,span*.12);low=Math.min(0,low-padding);high=Math.max(0,high+padding);const range=Math.max(.000001,high-low);
    return {view,points,plot:plotBox,plotWidth,plotHeight,low,high,range,y:value=>plotBox.top+(high-value)/range*plotHeight,slot:plotWidth/points.length};
  }
  function formatUnit(value){
    const api=window.NOMAD_UNIT_CHART;if(api?.formatUnit)return api.formatUnit(value);
    const number=Number(value)||0;return `${number>=0?'+':''}${number.toFixed(2)}u`;
  }
  function formatAxis(value){const abs=Math.abs(value),digits=abs>=100?0:abs>=10?1:2;return Number(value).toFixed(digits);}
  function formatDate(value){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short'}).format(new Date(value));}
  function formatHoverDate(value){return new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(value));}
  function formatDateTime(value){
    const date=new Date(value);if(Number.isNaN(date.getTime()))return 'Settlement time unavailable';
    const day=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(date),time=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date);return `${day} · ${time}`;
  }
  function resultClass(result){const value=String(result||'').toUpperCase();return value.includes('WIN')?'is-positive':value.includes('LOSS')?'is-negative':'';}
  function updateTooltip(point,region,width,height){
    if(!tooltip||!point||!region)return;const result=String(point?.record?.settlement?.result||'SETTLED').trim().toUpperCase()||'SETTLED';
    tooltip.innerHTML=`<span class="cumulative-unit-tooltip-date">${formatDateTime(point.settledAt)}</span><strong class="cumulative-unit-tooltip-result ${resultClass(result)}">${result}</strong><span>Result <b>${formatUnit(point.delta)}</b></span><span>Cumulative <b>${formatUnit(point.close)}</b></span>`;
    tooltip.hidden=false;tooltip.style.visibility='hidden';tooltip.style.left='0px';tooltip.style.top='0px';
    const tipWidth=tooltip.offsetWidth,tipHeight=tooltip.offsetHeight,gap=8,margin=6;let left=region.center+gap;if(left+tipWidth>width-margin)left=region.center-tipWidth-gap;left=Math.max(margin,Math.min(width-tipWidth-margin,left));
    let top=(region.top+region.bottom)/2-tipHeight/2;top=Math.max(margin,Math.min(height-tipHeight-margin,top));tooltip.style.left=`${Math.round(left)}px`;tooltip.style.top=`${Math.round(top)}px`;tooltip.style.visibility='visible';
  }

  function drawMain(){
    const ready=setupCanvas(canvas);if(!ready)return;const {ctx,width,height}=ready,g=geometry(width,height);hitRegions=[];if(!g)return;
    const {view,points,plot:box,plotHeight,high,range,y,slot}=g;
    ctx.font='8px Arial, sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';
    for(let index=0;index<5;index+=1){const ratio=index/4,value=high-range*ratio,yPos=box.top+plotHeight*ratio;ctx.beginPath();ctx.moveTo(box.left,yPos);ctx.lineTo(box.right,yPos);ctx.strokeStyle='rgba(128,136,131,.09)';ctx.lineWidth=1;ctx.stroke();ctx.fillStyle='rgba(148,156,151,.66)';ctx.fillText(formatAxis(value),box.left-7,yPos);}
    ctx.beginPath();for(let index=1;index<6;index+=1){const x=box.left+(box.right-box.left)*(index/6);ctx.moveTo(x,box.top);ctx.lineTo(x,box.bottom);}ctx.strokeStyle='rgba(128,136,131,.065)';ctx.lineWidth=1;ctx.stroke();
    const zeroY=y(0);ctx.beginPath();ctx.moveTo(box.left,zeroY);ctx.lineTo(box.right,zeroY);ctx.strokeStyle='rgba(176,185,179,.25)';ctx.lineWidth=1.1;ctx.stroke();
    const current=points.at(-1).close,currentY=y(current),lineColor=current>0?'rgba(92,177,108,.60)':current<0?'rgba(207,91,96,.60)':'rgba(169,177,172,.60)',textColor=current>0?'#68b777':current<0?'#d16a6e':'#a9b1ac';
    ctx.setLineDash([2,3]);ctx.beginPath();ctx.moveTo(box.left,currentY);ctx.lineTo(box.right,currentY);ctx.strokeStyle=lineColor;ctx.stroke();ctx.setLineDash([]);
    const barWidth=Math.max(1,Math.min(12,slot*.66)),hitWidth=Math.max(barWidth,Math.min(24,slot));
    points.forEach((point,index)=>{const center=box.left+slot*(index+.5),openY=y(point.open),closeY=y(point.close),top=Math.min(openY,closeY),bottom=Math.max(openY,closeY),selected=point.key===selectedKey;hitRegions.push({key:point.key,index:view.start+index,center,top,bottom,hitLeft:center-hitWidth/2,hitRight:center+hitWidth/2,plotLeft:box.left,plotRight:box.right,plotTop:box.top,plotBottom:box.bottom});
      if(point.delta===0){ctx.beginPath();ctx.moveTo(center-barWidth/2,openY);ctx.lineTo(center+barWidth/2,openY);ctx.strokeStyle=selected?'rgba(224,231,227,.92)':'rgba(169,177,172,.76)';ctx.lineWidth=selected?1.6:1.25;ctx.stroke();return;}
      const h=Math.abs(closeY-openY);ctx.fillStyle=point.delta>0?'rgba(76,157,94,.92)':'rgba(194,77,82,.92)';ctx.fillRect(center-barWidth/2,top,barWidth,h);if(selected){ctx.fillStyle='rgba(255,255,255,.10)';ctx.fillRect(center-barWidth/2,top,barWidth,h);ctx.strokeStyle='rgba(255,255,255,.28)';ctx.strokeRect(center-barWidth/2+.5,top+.5,Math.max(0,barWidth-1),Math.max(0,h-1));}});
    if(hoverKey&&hoverX!==null&&hoverY!==null){const i=points.findIndex(point=>point.key===hoverKey);if(i>=0){ctx.save();ctx.setLineDash([2,2]);ctx.strokeStyle='rgba(170,178,173,.58)';ctx.beginPath();ctx.moveTo(hoverX,box.top);ctx.lineTo(hoverX,box.bottom);ctx.moveTo(box.left,hoverY);ctx.lineTo(box.right,hoverY);ctx.stroke();ctx.restore();
      const hoverValue=high-((hoverY-box.top)/plotHeight)*range,valueText=formatUnit(hoverValue);ctx.font='700 8px Arial, sans-serif';ctx.textAlign='left';const vw=Math.ceil(ctx.measureText(valueText).width)+8,vh=14,vx=Math.max(2,box.left-vw-4),vy=Math.min(box.bottom-vh,Math.max(box.top,hoverY-vh/2));ctx.fillStyle='rgba(18,20,19,.94)';ctx.fillRect(vx,vy,vw,vh);ctx.fillStyle='rgba(190,198,193,.92)';ctx.fillText(valueText,vx+4,vy+vh/2);
      const dateText=formatHoverDate(points[i].settledAt);ctx.font='700 8px Arial, sans-serif';const dw=Math.ceil(ctx.measureText(dateText).width)+10,dh=14,dx=Math.max(box.left,Math.min(box.right-dw,hoverX-dw/2)),dy=Math.max(box.top,box.bottom-dh);ctx.fillStyle='rgba(18,20,19,.94)';ctx.fillRect(dx,dy,dw,dh);ctx.fillStyle='rgba(190,198,193,.92)';ctx.textAlign='center';ctx.fillText(dateText,dx+dw/2,dy+dh/2);}else clearHover();}
    const label=formatUnit(current);ctx.font='700 8px Arial, sans-serif';const lw=Math.ceil(ctx.measureText(label).width)+8,lh=14,lx=Math.max(box.left,box.right-lw),ly=Math.min(box.bottom-lh,Math.max(box.top,currentY-lh/2));ctx.fillStyle='rgba(15,17,16,.92)';ctx.fillRect(lx,ly,lw,lh);ctx.fillStyle=textColor;ctx.textAlign='right';ctx.fillText(label,box.right-4,ly+lh/2);
    ctx.fillStyle='rgba(152,160,145,.72)';ctx.textBaseline='bottom';ctx.textAlign='left';ctx.fillText(formatDate(points[0].settledAt),box.left,height-4);ctx.textAlign='right';ctx.fillText(formatDate(points.at(-1).settledAt),box.right,height-4);
    if(selectedKey){const i=points.findIndex(point=>point.key===selectedKey),region=hitRegions.find(item=>item.key===selectedKey);if(i>=0&&region)updateTooltip(points[i],region,width,height);else hideTooltip();}else hideTooltip();
  }
  function drawBollinger(){
    const ready=setupCanvas(bbCanvas);if(!ready)return;const {ctx,width,height}=ready,g=geometry(width,height);if(!g||!cache.bb.length)return;const rows=cache.bb.filter(row=>row.index>=g.view.start&&row.index<g.view.end);if(!rows.length)return;
    const point=(row,key)=>[g.plot.left+g.slot*(row.index-g.view.start+.5),Math.max(g.plot.top,Math.min(g.plot.bottom,g.y(row[key])))];ctx.save();ctx.beginPath();rows.forEach((row,i)=>{const [x,y]=point(row,'upper');i?ctx.lineTo(x,y):ctx.moveTo(x,y);});for(let i=rows.length-1;i>=0;i--){const [x,y]=point(rows[i],'lower');ctx.lineTo(x,y);}ctx.closePath();ctx.fillStyle='rgba(132,151,140,.075)';ctx.fill();
    const line=(key,stroke,w,a)=>{ctx.beginPath();rows.forEach((row,i)=>{const [x,y]=point(row,key);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle=stroke;ctx.globalAlpha=a;ctx.lineWidth=w;ctx.lineJoin='round';ctx.stroke();ctx.globalAlpha=1;};line('upper','#8e9b93',1,.62);line('lower','#8e9b93',1,.62);line('middle','#aeb8b1',.9,.42);ctx.restore();
  }
  function drawEma(){
    const ready=setupCanvas(emaCanvas);if(!ready)return;const {ctx,width,height}=ready,g=geometry(width,height);if(!g)return;
    cache.ema.forEach(item=>{if(!item.line?.enabled)return;const rows=(item.rows||[]).filter(row=>row.index>=g.view.start&&row.index<g.view.end);if(!rows.length)return;ctx.save();ctx.beginPath();rows.forEach((row,i)=>{const x=g.plot.left+g.slot*(row.index-g.view.start+.5),y=g.y(row.value);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle=item.line.color;ctx.globalAlpha=.9;ctx.lineWidth=1.35;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.restore();});
  }
  function panelGrid(ctx,left,right,levels,mapper){ctx.save();ctx.font='7px Arial,sans-serif';ctx.textBaseline='middle';ctx.textAlign='right';levels.forEach(level=>{const y=mapper(level);ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(right,y);ctx.strokeStyle='rgba(135,145,138,.10)';ctx.stroke();ctx.fillStyle='rgba(137,147,140,.58)';ctx.fillText(String(level),left-6,y);});ctx.restore();}
  function xFor(index,count,left,right){return left+(Math.max(1,right-left)/Math.max(1,count))*(index+.5);}
  function drawRsi(){
    const ready=setupCanvas(rsiCanvas);if(!ready)return;const {ctx,width,height}=ready,{view,points}=visibleSeries(),rows=cache.rsi.filter(row=>row.index>=view.start&&row.index<view.end);const valueNode=rsiPanel?.querySelector('[data-rsi-value]');if(valueNode)valueNode.textContent=rows.length?rows.at(-1).value.toFixed(1):'—';if(rsiPanel?.hidden||!points.length||!rows.length)return;
    const box={left:48,right:Math.max(58,width-10),top:7,bottom:Math.max(18,height-10)},y=value=>box.top+((100-value)/100)*(box.bottom-box.top);panelGrid(ctx,box.left,box.right,[70,50,30],y);ctx.beginPath();rows.forEach((row,i)=>{const x=xFor(row.index-view.start,points.length,box.left,box.right),yy=y(row.value);i?ctx.lineTo(x,yy):ctx.moveTo(x,yy);});ctx.strokeStyle='#aeb8b1';ctx.lineWidth=1.25;ctx.lineJoin='round';ctx.stroke();
  }
  function drawDrawdown(){
    const ready=setupCanvas(ddCanvas);if(!ready)return;const {ctx,width,height}=ready,{view,points}=visibleSeries(),rows=cache.dd.filter(row=>row.index>=view.start&&row.index<view.end);const valueNode=ddPanel?.querySelector('[data-drawdown-value]');if(valueNode)valueNode.textContent=rows.length?`${rows.at(-1).value>0?'+':''}${rows.at(-1).value.toFixed(2)}u`:'—';if(ddPanel?.hidden||!points.length||!rows.length)return;
    const min=Math.min(0,...rows.map(row=>row.value)),floor=min===0?-1:min*1.08,box={left:48,right:Math.max(58,width-10),top:7,bottom:Math.max(18,height-10)},range=Math.max(.000001,0-floor),y=value=>box.top+((0-value)/range)*(box.bottom-box.top);panelGrid(ctx,box.left,box.right,[0,Number((floor/2).toFixed(2)),Number(floor.toFixed(2))],y);
    const firstX=xFor(rows[0].index-view.start,points.length,box.left,box.right),lastX=xFor(rows.at(-1).index-view.start,points.length,box.left,box.right);ctx.beginPath();ctx.moveTo(firstX,y(0));rows.forEach(row=>ctx.lineTo(xFor(row.index-view.start,points.length,box.left,box.right),y(row.value)));ctx.lineTo(lastX,y(0));ctx.closePath();ctx.fillStyle='rgba(180,91,91,.085)';ctx.fill();ctx.beginPath();rows.forEach((row,i)=>{const x=xFor(row.index-view.start,points.length,box.left,box.right),yy=y(row.value);i?ctx.lineTo(x,yy):ctx.moveTo(x,yy);});ctx.strokeStyle='#b87a7a';ctx.lineWidth=1.15;ctx.lineJoin='round';ctx.stroke();
  }
  function draw(){frame=0;if(!mounted)return;drawMain();drawBollinger();drawEma();drawRsi();drawDrawdown();}
  function scheduleDraw(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}

  function beginPan(event){const view=resolveViewport();if(!view.canPan||event.button!==0)return;pointerDown=true;pointerId=event.pointerId;dragStartX=event.clientX;dragStartEnd=view.end;dragMoved=false;suppressClick=false;try{canvas.setPointerCapture(pointerId);}catch{}}
  function movePan(event){if(!pointerDown||event.pointerId!==pointerId)return;const dx=event.clientX-dragStartX;if(!dragMoved&&Math.abs(dx)<DRAG_THRESHOLD)return;dragMoved=true;canvas.classList.add('is-panning');const view=resolveViewport(),rect=canvas.getBoundingClientRect(),plotWidth=Math.max(1,rect.width-58),delta=Math.round((-dx/plotWidth)*Math.max(1,view.count));setEnd(dragStartEnd+delta);event.preventDefault();}
  function endPan(event){if(!pointerDown||(event.pointerId!==undefined&&event.pointerId!==pointerId))return;const moved=dragMoved;pointerDown=false;dragMoved=false;canvas.classList.remove('is-panning');try{canvas.releasePointerCapture(pointerId);}catch{}pointerId=null;if(moved){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}}
  function mouseMove(event){if(pointerDown&&dragMoved)return;if(!hitRegions.length)return;const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,bounds=hitRegions[0];if(x<bounds.plotLeft||x>bounds.plotRight||y<bounds.plotTop||y>bounds.plotBottom){clearHover();scheduleDraw();return;}let nearest=hitRegions[0],distance=Math.abs(x-nearest.center);for(let i=1;i<hitRegions.length;i++){const d=Math.abs(x-hitRegions[i].center);if(d<distance){nearest=hitRegions[i];distance=d;}}hoverKey=nearest.key;hoverX=nearest.center;hoverY=Math.max(bounds.plotTop,Math.min(bounds.plotBottom,y));scheduleDraw();}
  function clickCanvas(event){if(suppressClick||!hitRegions.length)return;const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;if(y<hitRegions[0].plotTop||y>hitRegions[0].plotBottom){selectedKey=null;hideTooltip();scheduleDraw();return;}let nearest=null,distance=Infinity;hitRegions.forEach(region=>{if(x<region.hitLeft||x>region.hitRight)return;const d=Math.abs(x-region.center);if(d<distance){nearest=region;distance=d;}});selectedKey=nearest?.key||null;hideTooltip();scheduleDraw();}

  function syncControls(){
    if(!control)return;const view=resolveViewport(),index=PRESETS.findIndex(item=>String(item)===String(view.size));if(rangeSelect)rangeSelect.value=String(view.size);if(zoomInButton)zoomInButton.disabled=index<=0;if(zoomOutButton)zoomOutButton.disabled=index>=PRESETS.length-1;
    if(latestButton){latestButton.hidden=!view.canPan||view.followLatest;latestButton.disabled=!view.canPan||view.followLatest;}
    if(statusNode)statusNode.textContent=!view.total?'NO DATA':view.size==='ALL'||!view.canPan?`ALL · ${view.total}`:`${view.start+1}–${view.end} / ${view.total}`;
    chart?.classList.toggle('has-chart-pan',view.canPan);chart?.classList.toggle('is-chart-history',view.canPan&&!view.followLatest);
  }
  function createControl(){
    control=document.createElement('div');control.className='statistics-chart-viewport-control';control.setAttribute('role','group');control.setAttribute('aria-label','Chart zoom and history navigation');
    control.innerHTML=`<button type="button" class="statistics-chart-viewport-step" data-chart-zoom-out aria-label="Zoom out">−</button><select class="statistics-chart-viewport-select" data-chart-range aria-label="Visible settled results"><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="500">500</option><option value="ALL">ALL</option></select><button type="button" class="statistics-chart-viewport-step" data-chart-zoom-in aria-label="Zoom in">+</button><button type="button" class="statistics-chart-latest" data-chart-latest hidden>LATEST</button><span class="statistics-chart-viewport-status" data-chart-viewport-status>ALL</span>`;
    plot.classList.add('has-chart-viewport');plot.appendChild(control);rangeSelect=control.querySelector('[data-chart-range]');zoomOutButton=control.querySelector('[data-chart-zoom-out]');zoomInButton=control.querySelector('[data-chart-zoom-in]');latestButton=control.querySelector('[data-chart-latest]');statusNode=control.querySelector('[data-chart-viewport-status]');
    rangeSelect.addEventListener('change',()=>setSize(rangeSelect.value));zoomOutButton.addEventListener('click',()=>zoomStep(1));zoomInButton.addEventListener('click',()=>zoomStep(-1));latestButton.addEventListener('click',goLatest);control.addEventListener('click',event=>event.stopPropagation());
  }
  function replaceCanvas(oldCanvas){const next=oldCanvas.cloneNode(false);oldCanvas.replaceWith(next);return next;}
  function mount(){
    if(mounted)return true;chart=document.querySelector('.cumulative-unit-chart');plot=chart?.querySelector('.cumulative-unit-plot')||null;surface=chart?.querySelector('.cumulative-unit-surface')||null;
    const oldMain=surface?.querySelector('.cumulative-unit-canvas')||null,oldRsi=document.querySelector('.statistics-rsi-canvas'),oldDd=document.querySelector('.statistics-drawdown-canvas');rsiPanel=oldRsi?.closest('.statistics-rsi-panel')||null;ddPanel=oldDd?.closest('.statistics-drawdown-panel')||null;tooltip=surface?.querySelector('[data-unit-tooltip]')||null;
    if(!chart||!plot||!surface||!oldMain||!oldRsi||!oldDd||!window.NOMAD_UNIT_CHART?.buildSeries||!window.NOMAD_STATISTICS_EMA?.buildEma||!window.NOMAD_STATISTICS_INDICATORS?.buildRsi)return false;
    canvas=replaceCanvas(oldMain);rsiCanvas=replaceCanvas(oldRsi);ddCanvas=replaceCanvas(oldDd);
    bbCanvas=document.createElement('canvas');bbCanvas.className='statistics-viewport-bollinger-overlay';bbCanvas.setAttribute('aria-hidden','true');surface.appendChild(bbCanvas);
    emaCanvas=document.createElement('canvas');emaCanvas.className='statistics-viewport-ema-overlay';emaCanvas.setAttribute('aria-hidden','true');surface.appendChild(emaCanvas);
    chart.classList.add('has-statistics-viewport-engine');createControl();
    canvas.addEventListener('pointerdown',beginPan);canvas.addEventListener('pointermove',movePan);canvas.addEventListener('pointerup',endPan);canvas.addEventListener('pointercancel',endPan);canvas.addEventListener('mousemove',mouseMove,{passive:true});canvas.addEventListener('mouseleave',()=>{if(!pointerDown){clearHover();scheduleDraw();}},{passive:true});canvas.addEventListener('click',clickCanvas);
    if('ResizeObserver'in window){resizeObserver=new ResizeObserver(scheduleDraw);resizeObserver.observe(surface);resizeObserver.observe(rsiPanel);resizeObserver.observe(ddPanel);}else window.addEventListener('resize',scheduleDraw,{passive:true});
    mounted=true;buildFullSeries();syncControls();return true;
  }
  function ensureMount(){if(mount())return;if(observer)return;observer=new MutationObserver(()=>{if(!mount())return;observer.disconnect();observer=null;});observer.observe(document.documentElement,{childList:true,subtree:true});}
  function start(){ensureMount();}

  window.addEventListener(EVENT_NAME,event=>{rawRecords=Array.isArray(event?.detail?.records)?event.detail.records:[];if(mounted)buildFullSeries();});
  document.addEventListener('change',event=>{if(event.target?.closest?.('.statistics-ema-panel,.statistics-indicator-panel'))scheduleSettingsRefresh();},true);
  document.addEventListener('input',event=>{if(event.target?.closest?.('.statistics-ema-panel,.statistics-indicator-panel'))scheduleSettingsRefresh();},true);
  document.addEventListener('click',event=>{if(event.target?.closest?.('[data-ema-reset],[data-ind-reset]'))scheduleSettingsRefresh();},true);
  window.NOMAD_STATISTICS_VIEWPORT=Object.freeze({presets:[...PRESETS],get:()=>({...resolveViewport()}),set:setSize,latest:goLatest,redraw:scheduleDraw});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
