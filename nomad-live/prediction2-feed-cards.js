(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-feed.json';
  const grid = document.querySelector('.king-preview-grid');
  const drawer = document.getElementById('kingAnalysisDrawer');
  const content = document.getElementById('kingAnalysisContent');
  if (!grid || !drawer || !content) return;

  const SETS = [
    {home:{base:'#721b24',secondary:'#c99a3f',accent:'#f1d58b',pattern:'pinstripe'},away:{base:'#17263c',secondary:'#e9dfbf',accent:'#d0ad62',pattern:'vertical'}},
    {home:{base:'#193d2c',secondary:'#e7dec1',accent:'#d8bd76',pattern:'sash'},away:{base:'#1d1d1b',secondary:'#b56b2b',accent:'#e4a35b',pattern:'hoops'}},
    {home:{base:'#173f7a',secondary:'#d8ae4b',accent:'#efd58d',pattern:'shoulder'},away:{base:'#e8e1cf',secondary:'#274d83',accent:'#b8a171',pattern:'pinstripe'}},
    {home:{base:'#6b2327',secondary:'#8eb9c5',accent:'#e5d2a0',pattern:'half'},away:{base:'#1a1a19',secondary:'#b86a2d',accent:'#e2a25d',pattern:'plain'}},
    {home:{base:'#6f1c28',secondary:'#c7913a',accent:'#ecd08a',pattern:'pinstripe'},away:{base:'#176a73',secondary:'#e3dcc1',accent:'#d9c58e',pattern:'sleeve'}},
    {home:{base:'#d46920',secondary:'#171817',accent:'#f0b45c',pattern:'chevron'},away:{base:'#a8aaa5',secondary:'#282927',accent:'#e2d6ae',pattern:'center'}},
    {home:{base:'#4d2a68',secondary:'#e8dfc6',accent:'#c9ad72',pattern:'chest'},away:{base:'#d7c397',secondary:'#4f274d',accent:'#b99a6b',pattern:'plain'}},
    {home:{base:'#7d1d21',secondary:'#1b1b1a',accent:'#cf8751',pattern:'hoops'},away:{base:'#a7cfad',secondary:'#35523c',accent:'#d7caa7',pattern:'pinstripe'}},
    {home:{base:'#c9972f',secondary:'#1f3459',accent:'#efd68b',pattern:'sash'},away:{base:'#1b2b49',secondary:'#e6dcc0',accent:'#c5a666',pattern:'plain'}},
    {home:{base:'#5fa3aa',secondary:'#e3dcc8',accent:'#d4b777',pattern:'quarters'},away:{base:'#6c2529',secondary:'#e7dfc8',accent:'#c69f61',pattern:'plain'}},
    {home:{base:'#4b5028',secondary:'#151714',accent:'#c7ab67',pattern:'shoulder'},away:{base:'#e7dfc8',secondary:'#59662e',accent:'#c9ad70',pattern:'center'}},
    {home:{base:'#18356b',secondary:'#a9272d',accent:'#d9b263',pattern:'pinstripe'},away:{base:'#d1d3d0',secondary:'#35558e',accent:'#bda265',pattern:'hoops'}}
  ];

  const hash = value => {
    let h = 2166136261;
    for (const ch of String(value || 'nomad')) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const patternMarkup = (type, secondary, accent) => {
    switch (type) {
      case 'vertical': return `<g fill="${secondary}"><rect x="20" y="7" width="5" height="53"/><rect x="30" y="6" width="5" height="54"/><rect x="40" y="7" width="5" height="53"/></g>`;
      case 'hoops': return `<g fill="${secondary}"><rect x="7" y="18" width="50" height="7"/><rect x="11" y="32" width="42" height="7"/><rect x="18" y="46" width="28" height="7"/></g>`;
      case 'half': return `<rect x="32" y="4" width="31" height="57" fill="${secondary}"/>`;
      case 'chest': return `<rect x="8" y="25" width="48" height="10" fill="${secondary}"/><rect x="8" y="35" width="48" height="1.5" fill="${accent}" opacity=".75"/>`;
      case 'sash': return `<polygon points="8,17 15,11 54,49 47,56" fill="${secondary}"/><polygon points="11,13 14,11 54,50 51,53" fill="${accent}" opacity=".7"/>`;
      case 'chevron': return `<path d="M8 18 32 38 56 18 52 13 32 30 12 13Z" fill="${secondary}"/><path d="M13 14 32 30 51 14" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".72"/>`;
      case 'pinstripe': return `<g stroke="${secondary}" stroke-width="1.4" opacity=".9"><path d="M21 8V58"/><path d="M27 6V59"/><path d="M33 6V59"/><path d="M39 6V59"/><path d="M45 8V58"/></g>`;
      case 'sleeve': return `<polygon points="7,14 22,7 22,20 12,26" fill="${secondary}"/><polygon points="42,7 57,14 52,26 42,20" fill="${secondary}"/><path d="M21 8H43" stroke="${accent}" stroke-width="1.5" opacity=".7"/>`;
      case 'shoulder': return `<path d="M9 14 22 7H42L55 14 50 22 42 18H22L14 22Z" fill="${secondary}"/><path d="M18 10H46" stroke="${accent}" stroke-width="1.4" opacity=".72"/>`;
      case 'center': return `<rect x="28" y="5" width="8" height="55" fill="${secondary}"/><rect x="27" y="5" width="1.4" height="55" fill="${accent}" opacity=".7"/><rect x="36" y="5" width="1.4" height="55" fill="${accent}" opacity=".7"/>`;
      case 'quarters': return `<rect x="32" y="4" width="31" height="28" fill="${secondary}"/><rect x="1" y="32" width="31" height="29" fill="${secondary}"/><path d="M32 5V59M8 32H56" stroke="${accent}" stroke-width="1.2" opacity=".55"/>`;
      default: return `<path d="M18 21H46" stroke="${secondary}" stroke-width="1.2" opacity=".45"/>`;
    }
  };

  const shirtSvg = (def, seed) => {
    const shape = 'M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z';
    const a = (seed % 13) + 2;
    const b = (seed % 7) + 3;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="c"><path d="${shape}"/></clipPath><linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".30"/></linearGradient><pattern id="grain" width="${a}" height="${b}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#fff" opacity=".055"/></pattern></defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${def.base}"/>${patternMarkup(def.pattern,def.secondary,def.accent)}<rect width="64" height="64" fill="url(#shade)"/><rect width="64" height="64" fill="url(#grain)"/></g><path d="${shape}" fill="none" stroke="#090a08" stroke-width="1.8" stroke-linejoin="round"/><path d="${shape}" fill="none" stroke="${def.accent}" stroke-opacity=".52" stroke-width=".72"/><path d="M27 5 32 12 37 5" fill="#11130f" stroke="${def.accent}" stroke-width="1.05"/><path d="M28 6.2 32 10.5 36 6.2" fill="${def.secondary}" opacity=".88"/></svg>`;
  };
  const shirtUri = (def, seed) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(shirtSvg(def,seed))}`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const pct = value => n(value) === null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
  const odds = value => n(value) === null ? '—' : Number(value).toFixed(2);

  let picks = [];
  let activeIndex = -1;

  const cardMarkup = (pick, index) => {
    const key = `${pick.home}|${pick.away}|${pick.goaloo_id || pick.id || index}`;
    const set = SETS[hash(key) % SETS.length];
    const seed = hash(key);
    const sideNo = pick.side === 'away' ? '2' : '1';
    const pickName = String(pick.pick || '').replace(/\s+Win$/i, '') || (pick.side === 'away' ? pick.away : pick.home);
    return `<article class="king-preview-card" data-auto-pick-index="${index}" role="button" tabindex="0" aria-expanded="false" aria-controls="kingAnalysisDrawer"><div class="king-preview-top"><span class="king-preview-rank">TOP PICK · ${String(index + 1).padStart(2,'0')}</span><span class="king-preview-market">FULL-TIME · 1X2</span></div><div class="king-preview-match"><div class="king-preview-side"><img class="king-preview-shirt" src="${shirtUri(set.home,seed)}" alt="" aria-hidden="true"><div class="king-preview-teamstack"><span class="king-preview-role">HOME</span><div class="king-preview-team">${esc(pick.home)}</div></div></div><div class="king-preview-vs">VS</div><div class="king-preview-side away"><div class="king-preview-teamstack away"><span class="king-preview-role">AWAY</span><div class="king-preview-team away">${esc(pick.away)}</div></div><img class="king-preview-shirt" src="${shirtUri(set.away,seed+17)}" alt="" aria-hidden="true"></div></div><div class="king-preview-pick"><div><span>PICK</span><b>${esc(pickName)} · ${sideNo}</b></div><div class="king-preview-odds"><span>LOCKED ODDS</span><b>${odds(pick.odds)}</b></div></div><div class="king-preview-toggle"><span>VIEW ANALYSIS</span><i>⌄</i></div></article>`;
  };

  const statusClass = status => status === true || status === 'PASS' ? 'pass' : 'pending';
  const gate = (name, status) => `<div class="king-gate"><span>${esc(name)}</span><em class="${statusClass(status)}">${status === true ? 'PASS' : status === false ? 'FAIL' : esc(status || '—')}</em></div>`;
  const probRow = (label, value, selected) => {
    const p = n(value) === null ? 0 : Math.max(0, Math.min(1, Number(value)));
    return `<div class="king-prob-row ${selected ? 'selected' : ''}"><span>${label}</span><div class="king-prob-track"><div class="king-prob-fill" style="width:${(p * 100).toFixed(1)}%"></div></div><strong>${pct(p)}</strong></div>`;
  };

  const analysisMarkup = pick => {
    const model = pick.model || {};
    const underlying = pick.underlying || {};
    const tests = underlying.tests || {};
    const quality = pick.data_quality || {};
    const selected = String(pick.side || '').toUpperCase();
    const selectedProb = pick.model_probability ?? (pick.side === 'away' ? model.away_win : model.home_win);
    const marketFair = pick.market_fair_probability;
    const perf = Number.isFinite(Number(underlying.passed)) ? `${underlying.passed}/${underlying.required || 3} PASS` : 'PASS';
    const pickName = String(pick.pick || '').replace(/\s+Win$/i, '') || (pick.side === 'away' ? pick.away : pick.home);
    const gateRows = [
      ['ROLLING GD', tests.A_rolling_goal_diff_edge],
      ['HOME/AWAY GD', tests.B_home_away_goal_diff_edge],
      ['SCORING ATTACK', tests.C_scoring_attack_edge],
      ['DEFENSIVE QUALITY', tests.D_defensive_quality],
      ['LINEUP', (pick.gates || {}).lineup || 'PENDING'],
      ['REST / ROTATION', (pick.gates || {}).rest_rotation || 'UNVERIFIED']
    ];
    const override = pick.selection_override ? ' · OWNER ONE-DAY OVERRIDE' : '';
    return `<div class="king-analysis-head"><div><span>WHY THIS PICK</span><h2>${esc(pick.home)} vs ${esc(pick.away)} · ${esc(pickName)}</h2></div><div class="king-analysis-sample">VERIFIED AUTO FEED${override}</div></div><div class="king-analysis-why"><span>MODEL <b>${pct(selectedProb)}</b></span><span>MARKET FAIR <b>${pct(marketFair)}</b></span><span>EDGE <b class="positive">${n(pick.market_edge) === null ? '—' : `+${(Number(pick.market_edge)*100).toFixed(1)}%`}</b></span><span>EV <b class="positive">${n(pick.ev) === null ? '—' : `+${(Number(pick.ev)*100).toFixed(1)}%`}</b></span><span>PERFORMANCE <b class="positive">${esc(perf)}</b></span></div><div class="king-analysis-grid"><div class="king-analysis-block"><span>MODEL PROBABILITY</span>${probRow('HOME',model.home_win,selected==='HOME')}${probRow('DRAW',model.draw,selected==='DRAW')}${probRow('AWAY',model.away_win,selected==='AWAY')}</div><div class="king-analysis-block"><span>VALUE ANALYSIS</span><div class="king-analysis-kv"><span>Locked Odds</span><b>${odds(pick.odds)}</b></div><div class="king-analysis-kv"><span>Market Fair</span><b>${pct(marketFair)}</b></div><div class="king-analysis-kv"><span>Market Edge</span><b class="positive">${n(pick.market_edge) === null ? '—' : `+${(Number(pick.market_edge)*100).toFixed(1)}%`}</b></div><div class="king-analysis-kv"><span>Expected Value</span><b class="positive">${n(pick.ev) === null ? '—' : `+${(Number(pick.ev)*100).toFixed(1)}%`}</b></div></div><div class="king-analysis-block"><span>PERFORMANCE GATE</span><div class="king-gate-list">${gateRows.map(([name,status])=>gate(name,status)).join('')}</div></div></div><div class="king-analysis-foot"><span>λ HOME <b>${n(model.lambda_home) === null ? '—' : Number(model.lambda_home).toFixed(2)}</b></span><span>λ AWAY <b>${n(model.lambda_away) === null ? '—' : Number(model.lambda_away).toFixed(2)}</b></span><span>H2H ADJ <b>${n(model.h2h_adjustment) === null ? '—' : pct(model.h2h_adjustment)}</b></span><span>RECENT HOME <b>${esc(quality.home_recent ?? '—')}</b></span><span>RECENT AWAY <b>${esc(quality.away_recent ?? '—')}</b></span><span>H2H SAMPLE <b>${esc(quality.h2h_n ?? '—')}</b></span><span class="king-analysis-source">GOALOO DIRECT FEEDS · MODEL GOAL RATE (λ)</span></div>`;
  };

  const closeDrawer = () => {
    activeIndex = -1;
    grid.querySelectorAll('.king-preview-card').forEach(card => {
      card.classList.remove('is-active');
      card.setAttribute('aria-expanded','false');
    });
    drawer.classList.remove('is-open');
    content.innerHTML = '';
  };

  const toggleCard = card => {
    const index = Number(card.dataset.autoPickIndex);
    const pick = picks[index];
    if (!pick) return;
    if (activeIndex === index) {
      closeDrawer();
      return;
    }
    activeIndex = index;
    grid.querySelectorAll('.king-preview-card').forEach(node => {
      const on = node === card;
      node.classList.toggle('is-active',on);
      node.setAttribute('aria-expanded',on ? 'true' : 'false');
    });
    content.innerHTML = analysisMarkup(pick);
    drawer.classList.add('is-open');
  };

  const renderCards = list => {
    closeDrawer();
    picks = Array.isArray(list) ? list : [];
    grid.innerHTML = picks.map(cardMarkup).join('');
    grid.hidden = picks.length === 0;
  };

  grid.innerHTML = '';
  grid.hidden = true;
  closeDrawer();

  grid.addEventListener('click', event => {
    const card = event.target.closest('.king-preview-card[data-auto-pick-index]');
    if (card) toggleCard(card);
  });
  grid.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.king-preview-card[data-auto-pick-index]');
    if (!card) return;
    event.preventDefault();
    toggleCard(card);
  });

  fetch(`${FEED}?t=${Date.now()}`, {cache:'no-store'})
    .then(response => {
      if (!response.ok) throw new Error('feed unavailable');
      return response.json();
    })
    .then(data => renderCards(data.today || []))
    .catch(() => renderCards([]));
})();
