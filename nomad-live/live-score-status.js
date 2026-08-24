(()=>{
  'use strict';

  const STYLE_ID='nomad-live-score-status-style';
  const CLOCK_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.25"></circle><path d="M12 7.5v5l3.25 1.9"></path></svg>';
  const PULSE_SVG='<svg viewBox="0 0 36 8" aria-hidden="true" focusable="false"><path class="pulse-track" d="M0 4H8L11 4L13 1L16 7L19 2L21 4H36"></path><path class="pulse-run" d="M0 4H8L11 4L13 1L16 7L19 2L21 4H36"></path></svg>';

  function ensureStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .score.score-live-stack{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        gap:1px;
        min-width:0;
        line-height:1;
      }
      .score-live-head{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:2px;
        width:100%;
        min-width:0;
        white-space:nowrap;
        font-size:6.3px;
        font-weight:900;
        letter-spacing:.01em;
        line-height:1;
      }
      .score-live-head .live-dot,
      .score-live-head .live-label{color:var(--green)}
      .score-live-head .live-sep,
      .score-live-head .live-phase{color:#a7b3aa}
      .score-live-value{
        display:block;
        color:var(--green);
        font-size:18px;
        font-weight:900;
        line-height:1.05;
        white-space:nowrap;
      }
      .score-live-time{
        display:flex;
        align-items:center;
        justify-content:center;
        gap:2px;
        color:var(--green);
        font-size:7px;
        font-weight:900;
        line-height:1;
        white-space:nowrap;
      }
      .score-live-time svg{
        width:8px;
        height:8px;
        fill:none;
        stroke:currentColor;
        stroke-width:1.8;
        stroke-linecap:round;
        stroke-linejoin:round;
        flex:0 0 auto;
      }
      .score.score-live-stack .entry-score{margin-top:2px}

      .statebox.has-watch-pulse{
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        justify-content:center;
        gap:3px;
        min-width:0;
      }
      .statebox.has-watch-pulse .minute{
        display:none;
      }
      .watch-pulse{
        display:block;
        width:36px;
        height:8px;
        line-height:0;
        pointer-events:none;
      }
      .watch-pulse svg{
        display:block;
        width:36px;
        height:8px;
        overflow:visible;
      }
      .watch-pulse .pulse-track{
        fill:none;
        stroke:rgba(131,223,137,.18);
        stroke-width:1.15;
        stroke-linecap:round;
        stroke-linejoin:round;
      }
      .watch-pulse .pulse-run{
        fill:none;
        stroke:var(--green);
        stroke-width:1.25;
        stroke-linecap:round;
        stroke-linejoin:round;
        stroke-dasharray:11 45;
        stroke-dashoffset:42;
        filter:drop-shadow(0 0 1.4px rgba(131,223,137,.42));
        animation:watchPulseLine 1.65s linear infinite;
      }
      @keyframes watchPulseLine{
        0%{stroke-dashoffset:42;opacity:.22}
        12%{opacity:.95}
        78%{opacity:.95}
        100%{stroke-dashoffset:-14;opacity:.22}
      }
      @media(prefers-reduced-motion:reduce){
        .watch-pulse .pulse-run{animation:none;stroke-dasharray:none;opacity:.75}
      }
      @media(max-width:820px){
        .score-live-head{font-size:5.8px;gap:1.5px}
        .score-live-value{font-size:16px}
        .score-live-time{font-size:6.7px}
        .score-live-time svg{width:7.5px;height:7.5px}
        .watch-pulse,.watch-pulse svg{width:32px;height:8px}
      }
      @media(max-width:520px){
        .score-live-head{font-size:5.1px;gap:1px;letter-spacing:0}
        .score-live-value{font-size:15px}
        .score-live-time{font-size:6.2px}
        .score-live-time svg{width:7px;height:7px}
        .watch-pulse,.watch-pulse svg{width:28px;height:7px}
      }
    `;
    document.head.appendChild(style);
  }

  function setText(node,text){
    if(node&&node.textContent!==text)node.textContent=text;
  }

  function readMinute(row){
    const raw=String(row.querySelector('.minute')?.textContent||'');
    const match=raw.match(/\d+/);
    return match?Number(match[0]):null;
  }

  function phaseFor(minute){
    return minute!=null&&minute<=45?'1ST HALF':'2ND HALF';
  }

  function directScoreText(score){
    return [...score.childNodes]
      .filter(node=>node.nodeType===Node.TEXT_NODE)
      .map(node=>node.textContent||'')
      .join('')
      .trim();
  }

  function decorateStatebox(row){
    const statebox=row.querySelector('.statebox');
    const state=row.querySelector('.state');
    if(!statebox||!state)return;

    const isWatching=/watching/i.test(state.textContent||'');
    let pulse=statebox.querySelector('.watch-pulse');

    if(isWatching){
      statebox.classList.add('has-watch-pulse');
      if(!pulse){
        pulse=document.createElement('span');
        pulse.className='watch-pulse';
        pulse.setAttribute('aria-hidden','true');
        pulse.innerHTML=PULSE_SVG;
        statebox.appendChild(pulse);
      }
    }else{
      statebox.classList.remove('has-watch-pulse');
      if(pulse)pulse.remove();
    }
  }

  function decorateScore(row){
    const score=row.querySelector('.score');
    if(!score)return;

    const minute=readMinute(row);
    if(minute==null)return;

    let value=score.querySelector('.score-live-value');
    if(!value){
      const raw=directScoreText(score);
      if(!/^\d+\s*[–-]\s*\d+$/.test(raw))return;
      [...score.childNodes].forEach(node=>{if(node.nodeType===Node.TEXT_NODE)node.remove();});

      const head=document.createElement('span');
      head.className='score-live-head';
      head.setAttribute('aria-hidden','true');
      head.innerHTML='<span class="live-dot">●</span><span class="live-label">LIVE</span><span class="live-sep">·</span><span class="live-phase"></span>';

      value=document.createElement('span');
      value.className='score-live-value';
      value.textContent=raw;

      const time=document.createElement('span');
      time.className='score-live-time';
      time.setAttribute('aria-hidden','true');
      time.innerHTML=`${CLOCK_SVG}<span class="live-minute"></span>`;

      score.insertBefore(time,score.firstChild);
      score.insertBefore(value,time);
      score.insertBefore(head,value);
      score.classList.add('score-live-stack');
    }

    setText(score.querySelector('.live-phase'),phaseFor(minute));
    setText(score.querySelector('.live-minute'),`${minute}′`);
  }

  function apply(){
    document.querySelectorAll('.match-list .match-wrap').forEach(row=>{
      decorateStatebox(row);
      decorateScore(row);
    });
  }

  let queued=false;
  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;apply();});
  }

  ensureStyle();
  apply();
  const list=document.querySelector('.match-list');
  if(list)new MutationObserver(queue).observe(list,{childList:true,subtree:true});
})();
