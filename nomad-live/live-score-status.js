(()=>{
  'use strict';

  const STYLE_ID='nomad-live-score-status-style';
  const CLOCK_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.25"></circle><path d="M12 7.5v5l3.25 1.9"></path></svg>';
  const METER_FACE='assets/icons/vintage-meter-base.svg?v=20260902-v1';
  const METER_NEEDLE='assets/icons/vintage-meter-needle.svg?v=20260902-v1';

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

      .statebox.has-status-meter{
        display:flex;
        flex-direction:column;
        align-items:flex-start;
        justify-content:center;
        gap:3px;
        min-width:0;
      }
      .statebox.has-status-meter .minute{display:none}
      .status-meter-icon{
        position:relative;
        display:block;
        width:24px;
        height:24px;
        flex:0 0 24px;
        margin:2px 0 0 5px;
        line-height:0;
        pointer-events:none;
        filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.38));
      }
      .status-meter-icon img{
        position:absolute;
        inset:0;
        display:block;
        width:100%;
        height:100%;
        object-fit:contain;
        user-select:none;
        pointer-events:none;
      }
      .status-meter-face{z-index:1}
      .status-meter-needle{
        z-index:2;
        transform-origin:50% 50%;
        will-change:transform;
      }

      .statebox.meter-watching .status-meter-needle{
        animation:meterWatching 2.4s ease-in-out infinite;
      }
      .statebox.meter-near .status-meter-needle{
        animation:meterNear 1.15s ease-in-out infinite;
      }
      .statebox.meter-signal .status-meter-needle{
        animation:meterSignal .52s linear infinite;
      }

      @keyframes meterWatching{
        0%,100%{transform:rotate(-7deg)}
        50%{transform:rotate(7deg)}
      }
      @keyframes meterNear{
        0%,100%{transform:rotate(-12deg)}
        50%{transform:rotate(12deg)}
      }
      @keyframes meterSignal{
        0%{transform:rotate(-18deg)}
        25%{transform:rotate(13deg)}
        50%{transform:rotate(-11deg)}
        75%{transform:rotate(18deg)}
        100%{transform:rotate(-18deg)}
      }

      @media(prefers-reduced-motion:reduce){
        .statebox.meter-watching .status-meter-needle,
        .statebox.meter-near .status-meter-needle,
        .statebox.meter-signal .status-meter-needle{
          animation:none!important;
        }
        .statebox.meter-watching .status-meter-needle{transform:rotate(-3deg)}
        .statebox.meter-near .status-meter-needle{transform:rotate(8deg)}
        .statebox.meter-signal .status-meter-needle{transform:rotate(16deg)}
      }

      @media(max-width:820px){
        .score-live-head{font-size:5.8px;gap:1.5px}
        .score-live-value{font-size:16px}
        .score-live-time{font-size:6.7px}
        .score-live-time svg{width:7.5px;height:7.5px}
        .status-meter-icon{width:22px;height:22px;flex-basis:22px;margin-left:4px}
      }
      @media(max-width:520px){
        .score-live-head{font-size:5.1px;gap:1px;letter-spacing:0}
        .score-live-value{font-size:15px}
        .score-live-time{font-size:6.2px}
        .score-live-time svg{width:7px;height:7px}
        .status-meter-icon{width:20px;height:20px;flex-basis:20px;margin-left:3px}
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

  function meterKind(text){
    const value=String(text||'').trim().toUpperCase();
    if(value.includes('NEAR'))return 'near';
    if(value==='SIGNAL'||value.startsWith('SIGNAL '))return 'signal';
    if(value.includes('WATCH'))return 'watching';
    return '';
  }

  function decorateStatebox(row){
    const statebox=row.querySelector('.statebox');
    const state=row.querySelector('.state');
    if(!statebox||!state)return;

    const kind=meterKind(state.textContent);
    let meter=statebox.querySelector('.status-meter-icon');

    statebox.classList.remove('has-watch-pulse','meter-watching','meter-near','meter-signal');
    const legacyPulse=statebox.querySelector('.watch-pulse');
    if(legacyPulse)legacyPulse.remove();

    if(!kind){
      statebox.classList.remove('has-status-meter');
      if(meter)meter.remove();
      return;
    }

    statebox.classList.add('has-status-meter',`meter-${kind}`);

    if(!meter){
      meter=document.createElement('span');
      meter.className='status-meter-icon';
      meter.setAttribute('aria-hidden','true');

      const face=document.createElement('img');
      face.className='status-meter-face';
      face.src=METER_FACE;
      face.alt='';
      face.decoding='async';

      const needle=document.createElement('img');
      needle.className='status-meter-needle';
      needle.src=METER_NEEDLE;
      needle.alt='';
      needle.decoding='async';

      meter.append(face,needle);
      statebox.appendChild(meter);
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
  if(list)new MutationObserver(queue).observe(list,{childList:true,subtree:true,characterData:true});
})();
