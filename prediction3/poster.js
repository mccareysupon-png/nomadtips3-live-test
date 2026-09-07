(()=>{
  'use strict';

  const DATA_URL='data/ledger.json?v=20260907-daily-verdict-poster-v1';
  const QUEEN_URL='queen-sirius-guardian.webp?v=20260906-120914';
  const canvas=document.getElementById('posterCanvas');
  const ctx=canvas?.getContext('2d');
  const downloadBtn=document.getElementById('downloadPoster');
  const openBtn=document.getElementById('openPoster');
  const copyBtn=document.getElementById('copyPosterLink');
  const status=document.getElementById('posterStatus');
  let ready=false;
  let posterDate='';

  const COLORS={
    bg:'#06100c',green:'#0a2118',green2:'#123328',gold:'#c89b3d',gold2:'#8d6926',light:'#f0d98d',ivory:'#f5ead0',muted:'#b8b09b',bronze:'#4d3814',deep:'#251c0d'
  };

  const setStatus=text=>{if(status)status.textContent=text||'';};
  const finite=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const fmtOdds=value=>finite(value)?Number(value).toFixed(2):'—';

  function roman(n){
    const map=[[1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],[50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
    let x=Math.max(1,Math.floor(Number(n)||1)),out='';
    for(const [v,s] of map)while(x>=v){out+=s;x-=v;}
    return out;
  }

  function formatDate(value){
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return String(value||'TODAY').toUpperCase();
    const months=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    return `${m[3]} ${months[Number(m[2])-1]} ${m[1]}`;
  }

  function roundRect(x,y,w,h,r=10){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.arcTo(x+w,y,x+w,y+h,rr);
    ctx.arcTo(x+w,y+h,x,y+h,rr);
    ctx.arcTo(x,y+h,x,y,rr);
    ctx.arcTo(x,y,x+w,y,rr);
    ctx.closePath();
  }

  function goldPanel(x,y,w,h,alpha=1){
    const g=ctx.createLinearGradient(x,y,x+w,y+h);
    g.addColorStop(0,`rgba(70,51,17,${alpha})`);
    g.addColorStop(.35,`rgba(103,77,27,${alpha})`);
    g.addColorStop(.65,`rgba(67,49,19,${alpha})`);
    g.addColorStop(1,`rgba(43,32,14,${alpha})`);
    ctx.fillStyle=g;
    roundRect(x,y,w,h,8);ctx.fill();
    ctx.strokeStyle='rgba(207,164,65,.88)';ctx.lineWidth=2;ctx.stroke();
    ctx.strokeStyle='rgba(240,210,125,.22)';ctx.lineWidth=1;roundRect(x+7,y+7,w-14,h-14,5);ctx.stroke();
  }

  function drawText(text,x,y,size,color=COLORS.ivory,weight=700,family='Arial',align='left'){
    ctx.font=`${weight} ${size}px ${family}`;
    ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';
    ctx.fillText(String(text??''),x,y);
  }

  function fitText(text,maxWidth,startSize,minSize,weight=700,family='Arial'){
    let size=startSize;
    while(size>minSize){ctx.font=`${weight} ${size}px ${family}`;if(ctx.measureText(String(text)).width<=maxWidth)break;size-=1;}
    return size;
  }

  function wrap(text,maxWidth,maxLines=2,size=24,weight=700,family='Arial'){
    ctx.font=`${weight} ${size}px ${family}`;
    const words=String(text||'').split(/\s+/),lines=[];let line='';
    for(const word of words){
      const test=line?`${line} ${word}`:word;
      if(ctx.measureText(test).width>maxWidth&&line){lines.push(line);line=word;if(lines.length===maxLines-1)break;}else line=test;
    }
    if(line&&lines.length<maxLines)lines.push(line);
    if(words.length&&lines.length===maxLines){
      const joined=lines.join(' '),original=String(text||'');
      if(joined.length<original.length){let last=lines[maxLines-1];while(ctx.measureText(`${last}…`).width>maxWidth&&last.length>3)last=last.slice(0,-1);lines[maxLines-1]=`${last}…`;}
    }
    return lines;
  }

  function coverImage(img,x,y,w,h,focusX=.35,focusY=.45){
    const scale=Math.max(w/img.width,h/img.height);
    const sw=w/scale,sh=h/scale;
    const sx=Math.max(0,Math.min(img.width-sw,(img.width-sw)*focusX));
    const sy=Math.max(0,Math.min(img.height-sh,(img.height-sh)*focusY));
    ctx.drawImage(img,sx,sy,sw,sh,x,y,w,h);
  }

  function circleBadge(x,y,r,text){
    const g=ctx.createRadialGradient(x-r*.3,y-r*.35,r*.1,x,y,r);
    g.addColorStop(0,'#18382a');g.addColorStop(.7,'#0b2118');g.addColorStop(1,'#06120d');
    ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#c99b3d';ctx.lineWidth=3;ctx.stroke();
    drawText(text,x,y+11,34,COLORS.light,700,"Georgia",'center');
  }

  function teamChip(x,y,text){
    ctx.fillStyle='#102b20';ctx.beginPath();ctx.arc(x,y,26,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(215,177,82,.75)';ctx.lineWidth=2;ctx.stroke();
    drawText(String(text||'').slice(0,3).toUpperCase(),x,y+6,14,COLORS.ivory,800,'Arial','center');
  }

  function drawHero(img,dateText,count,market,range){
    if(img){coverImage(img,14,14,1052,410,.25,.38);}else{
      const fallback=ctx.createLinearGradient(0,0,1080,410);fallback.addColorStop(0,'#4d3814');fallback.addColorStop(1,COLORS.green);ctx.fillStyle=fallback;ctx.fillRect(14,14,1052,410);
    }
    const fade=ctx.createLinearGradient(120,0,1080,0);fade.addColorStop(0,'rgba(5,14,10,.02)');fade.addColorStop(.45,'rgba(5,14,10,.34)');fade.addColorStop(1,'rgba(5,14,10,.96)');ctx.fillStyle=fade;ctx.fillRect(14,14,1052,410);
    drawText('nomad',715,58,42,'#f5f5ee',800,'Arial');drawText('tips3',855,58,42,'#f0bd22',800,'Arial');

    goldPanel(420,82,600,176,.96);
    drawText('SIRIUS DIVINE VERDICT',720,132,37,'#17180f',700,'Georgia','center');
    drawText('DAILY MATCH PREDICTIONS',720,169,19,'#3a2c11',800,'Arial','center');
    ctx.strokeStyle='rgba(70,43,7,.55)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(510,187);ctx.lineTo(930,187);ctx.stroke();
    drawText(dateText,720,224,25,'#2f2410',700,'Georgia','center');

    goldPanel(560,286,390,105,.94);
    drawText(`${count} BESTOWED VERDICT${count===1?'':'S'}`,755,320,20,COLORS.light,800,'Georgia','center');
    drawText(`MARKET: ${market}`,755,350,15,COLORS.ivory,800,'Arial','center');
    drawText(`ODDS RANGE: ${range}`,755,377,15,COLORS.ivory,800,'Arial','center');
    drawText('QUEEN SIRIUS',46,382,18,COLORS.light,800,'Georgia');
  }

  function drawCards(rows){
    const visible=rows.slice(0,6);
    if(!visible.length){goldPanel(55,520,970,220,.96);drawText('NO DAILY VERDICTS PUBLISHED',540,625,34,COLORS.light,800,'Georgia','center');drawText('NO PICK remains a valid daily result.',540,675,20,COLORS.ivory,600,'Arial','center');return;}
    const top=470,bottom=1175,gap=14;
    const cardH=Math.max(92,(bottom-top-gap*(visible.length-1))/visible.length);
    const compact=cardH<125;
    visible.forEach((item,index)=>{
      const y=top+index*(cardH+gap);
      goldPanel(45,y,990,cardH,.98);
      circleBadge(95,y+cardH/2,34,roman(index+1));
      teamChip(175,y+cardH/2,item.homeShort||item.home);
      teamChip(238,y+cardH/2,item.awayShort||item.away);
      const infoX=285, verdictX=670;
      const match=`${item.home||'Home'} vs ${item.away||'Away'}`;
      const matchSize=fitText(match,355,compact?23:29,17,700,'Georgia');
      drawText(match,infoX,y+(compact?38:48),matchSize,COLORS.ivory,700,'Georgia');
      const sub=`${item.league||'—'} · ${item.kickoff||item.date||'—'}`;
      const subSize=fitText(sub,360,compact?13:16,10,600,'Arial');
      drawText(sub,infoX,y+(compact?65:82),subSize,COLORS.muted,600,'Arial');
      ctx.strokeStyle='rgba(215,177,82,.22)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(650,y+14);ctx.lineTo(650,y+cardH-14);ctx.stroke();
      drawText('VERDICT',verdictX,y+(compact?29:36),compact?12:14,COLORS.gold,900,'Arial');
      const pick=String(item.pick||'—').toUpperCase();
      const pickSize=fitText(pick,325,compact?19:24,13,800,'Georgia');
      drawText(pick,verdictX,y+(compact?53:65),pickSize,COLORS.light,800,'Georgia');
      const detail=`ODDS ${fmtOdds(item.referenceOdds||item.odds)} · CONFIDENCE ${(item.confidenceLabel||'Controlled').toUpperCase()}`;
      const detailSize=fitText(detail,325,compact?10:12,8,700,'Arial');
      drawText(detail,verdictX,y+cardH-(compact?16:22),detailSize,COLORS.ivory,700,'Arial');
    });
  }

  function drawFooter(){
    ctx.strokeStyle='rgba(201,155,61,.65)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(115,1210);ctx.lineTo(965,1210);ctx.stroke();
    drawText('PRESENTED FOR ENTERTAINMENT AND INFORMATIONAL PURPOSES ONLY.',540,1245,13,COLORS.muted,700,'Arial','center');
    drawText('Daily Verdict Poster',540,1305,35,COLORS.light,400,'Georgia','center');
  }

  function drawBase(){
    const bg=ctx.createLinearGradient(0,0,0,1350);bg.addColorStop(0,'#07150f');bg.addColorStop(.6,'#08140f');bg.addColorStop(1,'#05100c');ctx.fillStyle=bg;ctx.fillRect(0,0,1080,1350);
    const glow=ctx.createRadialGradient(520,160,30,520,160,560);glow.addColorStop(0,'rgba(201,155,61,.10)');glow.addColorStop(1,'rgba(201,155,61,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,1080,650);
    ctx.strokeStyle='#c99b3d';ctx.lineWidth=4;ctx.strokeRect(11,11,1058,1328);
    ctx.strokeStyle='rgba(239,211,130,.28)';ctx.lineWidth=1;ctx.strokeRect(22,22,1036,1306);
  }

  async function loadImage(src){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=src;});}

  async function buildPoster(data){
    const today=Array.isArray(data?.today)?data.today:[];
    const results=Array.isArray(data?.results)?data.results:[];
    document.getElementById('posterTodayCount').textContent=today.length;
    document.getElementById('posterResultCount').textContent=results.length;
    posterDate=today[0]?.date||data?.created_at||new Date().toISOString().slice(0,10);
    document.getElementById('posterUpdated').textContent=formatDate(posterDate);
    const market=[...new Set(today.map(row=>String(row.market||'1X2').toUpperCase()))];
    const marketLabel=market.length===1?market[0]:'MULTI';
    const odds=today.map(row=>Number(row.referenceOdds||row.odds)).filter(Number.isFinite);
    const range=odds.length?`${Math.min(...odds).toFixed(2)} – ${Math.max(...odds).toFixed(2)}`:'—';
    let queen=null;
    try{queen=await loadImage(QUEEN_URL);}catch(error){console.warn('Queen image unavailable for poster',error);}
    drawBase();drawHero(queen,formatDate(posterDate),today.length,marketLabel,range);drawCards(today);drawFooter();
    ready=true;downloadBtn.disabled=false;openBtn.disabled=false;setStatus(today.length?`Poster ready · ${today.length} verdict${today.length===1?'':'s'} · ${formatDate(posterDate)}`:'Poster ready · no picks published today');
  }

  function canvasBlob(){return new Promise(resolve=>canvas.toBlob(resolve,'image/png',1));}

  downloadBtn?.addEventListener('click',async()=>{
    if(!ready)return;
    const blob=await canvasBlob();if(!blob)return setStatus('Unable to create PNG.');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`nomadtips3-sirius-verdict-${posterDate||'today'}.png`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);setStatus('PNG download prepared.');
  });

  openBtn?.addEventListener('click',async()=>{
    if(!ready)return;
    const blob=await canvasBlob();if(!blob)return;
    const url=URL.createObjectURL(blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);
  });

  copyBtn?.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(location.href);setStatus('Poster page link copied.');}
    catch{const input=document.createElement('input');input.value=location.href;document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();setStatus('Poster page link copied.');}
  });

  async function boot(){
    if(!canvas||!ctx)return;
    downloadBtn.disabled=true;openBtn.disabled=true;
    try{const response=await fetch(DATA_URL,{cache:'no-store'});if(!response.ok)throw new Error(`HTTP ${response.status}`);await buildPoster(await response.json());}
    catch(error){console.error('Daily Verdict Poster load failed',error);drawBase();drawText('DAILY VERDICT POSTER',540,570,44,COLORS.light,800,'Georgia','center');drawText('Prediction data unavailable.',540,630,22,COLORS.ivory,600,'Arial','center');setStatus('Prediction data unavailable.');}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
