(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-feed.json';
  const STYLE_ID = 'prediction2-default-card-meta-v1';
  const CARD_MARK = 'kingDefaultCardV1';

  function cleanupPrediction2Legacy() {
    // Retired live-score artifacts must never survive on Prediction2.
    document.querySelector('script[data-king-live-score-adapter]')?.remove();
    document.getElementById('king-live-score-style')?.remove();
    document.querySelectorAll('.king-live-score-inline').forEach(node => node.remove());

    // Retired preview / static-analysis surfaces remain quarantined.
    document.querySelector('.king-preview-grid')?.remove();
    document.getElementById('kingAnalysisDrawer')?.remove();

    // Statistics V3 owns the scorebar / HISTORY / DAILY surfaces now.
    document.getElementById('prediction2-today-only-style')?.remove();
    document.getElementById('prediction2-today-only-hardlock')?.remove();
    document.querySelectorAll('.king-tabs button, .king-panel').forEach(node => {
      node.removeAttribute('aria-hidden');
    });
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[ch]));

  const clean = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  const hash = value => {
    let h = 2166136261;
    for (const ch of String(value || 'nomad')) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  // Vintage shirt palettes. Selection is pseudo-random per match, so shirts do not
  // jump to a different design on every refresh.
  const SHIRTS = [
    ['#721b24','#c99a3f','#17263c','#e9dfbf'],
    ['#193d2c','#e7dec1','#1d1d1b','#b56b2b'],
    ['#173f7a','#d8ae4b','#e8e1cf','#274d83'],
    ['#6b2327','#8eb9c5','#1a1a19','#b86a2d'],
    ['#6f1c28','#c7913a','#176a73','#e3dcc1'],
    ['#d46920','#171817','#a8aaa5','#282927'],
    ['#4d2a68','#e8dfc6','#d7c397','#4f274d'],
    ['#7d1d21','#1b1b1a','#a7cfad','#35523c'],
    ['#c9972f','#1f3459','#1b2b49','#e6dcc0'],
    ['#5fa3aa','#e3dcc8','#6c2529','#e7dfc8'],
    ['#4b5028','#151714','#e7dfc8','#59662e'],
    ['#18356b','#a9272d','#d1d3d0','#35558e']
  ];

  const shirtSvg = (base, trim, seed) => {
    const mode = seed % 5;
    const shape = 'M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z';
    let pattern = '';
    if (mode === 0) pattern = `<rect x="29" y="5" width="6" height="55" fill="${trim}" opacity=".92"/>`;
    if (mode === 1) pattern = `<rect x="9" y="22" width="46" height="8" fill="${trim}" opacity=".9"/>`;
    if (mode === 2) pattern = `<path d="M10 13 54 49 49 55 6 19Z" fill="${trim}" opacity=".9"/>`;
    if (mode === 3) pattern = `<g fill="${trim}" opacity=".88"><rect x="20" y="6" width="4" height="53"/><rect x="30" y="5" width="4" height="54"/><rect x="40" y="6" width="4" height="53"/></g>`;
    if (mode === 4) pattern = `<path d="M9 15 32 35 55 15 51 10 32 27 13 10Z" fill="${trim}" opacity=".9"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="c"><path d="${shape}"/></clipPath><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".48" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${base}"/>${pattern}<rect width="64" height="64" fill="url(#s)"/></g><path d="${shape}" fill="none" stroke="#090a08" stroke-width="1.8" stroke-linejoin="round"/><path d="M27 5 32 12 37 5" fill="#11130f" stroke="${trim}" stroke-width="1.05"/></svg>`;
  };

  const shirtUri = (base, trim, seed) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(shirtSvg(base, trim, seed))}`;

  const formatDateTime = pick => {
    const rawDate = clean(pick.date);
    const rawKickoff = clean(pick.kickoff);
    let date = rawDate;
    const dm = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dm) date = `${dm[3]}/${dm[2]}/${dm[1]}`;
    if (!date) {
      const km = rawKickoff.match(/^(\d{4})-(\d{2})-(\d{2})/);
      date = km ? `${km[3]}/${km[2]}/${km[1]}` : '—';
    }
    const tm = rawKickoff.match(/(?:\d{4}-\d{2}-\d{2}[ T])?(\d{2}:\d{2})/);
    return {date, time: tm ? tm[1] : '—'};
  };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #todayRows > tr:not(.king-expand-row) td:first-child{min-width:285px;}
      .king-default-matchbox{display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);align-items:center;gap:7px;min-width:0;padding-right:6px;}
      .king-default-team{display:flex;align-items:center;gap:6px;min-width:0;color:#eef2ef;font-weight:850;line-height:1.15;}
      .king-default-team.home{justify-content:flex-end;text-align:right;}
      .king-default-team.away{justify-content:flex-start;text-align:left;}
      .king-default-team span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .king-default-shirt{display:block;width:27px;height:27px;flex:0 0 27px;object-fit:contain;filter:drop-shadow(0 2px 2px rgba(0,0,0,.28));}
      .king-default-vs{text-align:center;color:#727c75;font-size:7px;font-weight:950;letter-spacing:.08em;}
      .king-default-datetime{margin-top:4px;text-align:center;color:#77817a;font-size:7px;font-weight:850;letter-spacing:.045em;font-variant-numeric:tabular-nums;}
      .king-default-datetime b{color:#aab3ac;font-weight:900;}
      @media(max-width:699px){
        #todayRows > tr:not(.king-expand-row) td:first-child{min-width:255px;}
        .king-default-matchbox{grid-template-columns:minmax(0,1fr) 20px minmax(0,1fr);gap:5px;}
        .king-default-team{gap:4px;font-size:9px;}
        .king-default-shirt{width:23px;height:23px;flex-basis:23px;}
        .king-default-vs{font-size:6px;}
        .king-default-datetime{font-size:6.5px;margin-top:3px;}
      }
    `;
    document.head.appendChild(style);
  }

  let picks = [];
  let decorateQueued = false;

  function decorateDefaultCards() {
    decorateQueued = false;
    const tbody = document.getElementById('todayRows');
    if (!tbody || !picks.length) return;

    const rows = [...tbody.children].filter(row => !row.classList.contains('king-expand-row'));
    rows.forEach((row, index) => {
      const pick = picks[index];
      const cell = row.cells?.[0];
      if (!pick || !cell) return;

      const identity = `${pick.id || ''}|${pick.goaloo_id || ''}|${pick.home || ''}|${pick.away || ''}|${pick.kickoff || ''}`;
      if (cell.dataset[CARD_MARK] === identity) return;

      const seed = hash(identity);
      const palette = SHIRTS[seed % SHIRTS.length];
      const dt = formatDateTime(pick);
      const home = clean(pick.home) || '—';
      const away = clean(pick.away) || '—';

      cell.innerHTML = `
        <div class="king-default-matchbox">
          <div class="king-default-team home"><span>${esc(home)}</span><img class="king-default-shirt" src="${shirtUri(palette[0], palette[1], seed)}" alt="" aria-hidden="true"></div>
          <div class="king-default-vs">VS</div>
          <div class="king-default-team away"><img class="king-default-shirt" src="${shirtUri(palette[2], palette[3], seed + 17)}" alt="" aria-hidden="true"><span>${esc(away)}</span></div>
        </div>
        <div class="king-default-datetime"><b>${esc(dt.date)}</b> · ${esc(dt.time)}</div>`;
      cell.dataset[CARD_MARK] = identity;
    });
  }

  function queueDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    requestAnimationFrame(decorateDefaultCards);
  }

  function startDefaultCardEnhancement() {
    ensureStyle();
    const tbody = document.getElementById('todayRows');
    if (!tbody) return;

    fetch(`${FEED}?t=${Date.now()}`, {cache:'no-store'})
      .then(response => {
        if (!response.ok) throw new Error('KING feed unavailable');
        return response.json();
      })
      .then(data => {
        picks = Array.isArray(data.today) ? data.today : [];
        queueDecorate();
        [180, 600, 1200].forEach(delay => setTimeout(queueDecorate, delay));
      })
      .catch(() => { picks = []; });

    const observer = new MutationObserver(queueDecorate);
    observer.observe(tbody, {childList:true, subtree:false});
    window.addEventListener('pagehide', () => observer.disconnect(), {once:true});
  }

  function boot() {
    cleanupPrediction2Legacy();
    startDefaultCardEnhancement();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, {once: true});
  } else {
    boot();
  }
})();
