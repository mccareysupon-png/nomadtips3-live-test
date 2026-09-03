(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-feed.json';
  const grid = document.querySelector('.king-preview-grid');
  const legacyDrawer = document.getElementById('kingAnalysisDrawer');
  if (!grid) return;

  if (legacyDrawer) {
    legacyDrawer.hidden = true;
    legacyDrawer.classList.remove('is-open');
    legacyDrawer.setAttribute('aria-hidden', 'true');
  }

  const style = document.createElement('style');
  style.textContent = `
    .king-preview-card.is-inline-expanded{grid-column:1/-1;overflow:hidden;background:linear-gradient(180deg,rgba(27,36,30,.995),rgba(15,21,17,.995));}
    .king-inline-analysis{margin-top:11px;padding-top:11px;border-top:1px solid rgba(80,220,143,.18);cursor:default;animation:kingInlineIn .16s ease-out;}
    .king-inline-analysis .king-analysis-grid{margin-top:2px;}
    .king-inline-close{display:flex;align-items:center;justify-content:center;width:100%;margin:10px 0 0;padding:8px 10px;border:0;border-top:1px solid rgba(255,255,255,.05);background:transparent;color:var(--green);font:900 8px Arial,Helvetica,sans-serif;letter-spacing:.07em;cursor:pointer;}
    .king-inline-close:hover{background:rgba(80,220,143,.035);}
    .king-inline-mode{color:var(--green);font-weight:900;}
    @keyframes kingInlineIn{from{opacity:.35;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}
    @media(max-width:699px){.king-preview-card.is-inline-expanded{grid-column:auto}.king-inline-analysis{margin-top:9px;padding-top:9px}.king-inline-close{padding-bottom:6px}}
    @media(prefers-reduced-motion:reduce){.king-inline-analysis{animation:none}}
  `;
  document.head.appendChild(style);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const pct = value => num(value) === null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
  const odds = value => num(value) === null ? '—' : Number(value).toFixed(2);
  const positivePct = value => num(value) === null ? '—' : `${Number(value) >= 0 ? '+' : ''}${(Number(value) * 100).toFixed(1)}%`;
  const stateClass = value => value === true || String(value || '').startsWith('PASS') || String(value || '') === 'UNLIMITED' ? 'pass' : 'pending';
  const gate = (label, value) => `<div class="king-gate"><span>${esc(label)}</span><em class="${stateClass(value)}">${value === true ? 'PASS' : value === false ? 'FAIL' : esc(value || '—')}</em></div>`;
  const probRow = (label, value, selected) => {
    const p = num(value) === null ? 0 : Math.max(0, Math.min(1, Number(value)));
    return `<div class="king-prob-row ${selected ? 'selected' : ''}"><span>${label}</span><div class="king-prob-track"><div class="king-prob-fill" style="width:${(p * 100).toFixed(1)}%"></div></div><strong>${pct(p)}</strong></div>`;
  };

  let picks = [];
  let activeIndex = -1;

  function gateRows(pick) {
    const g = pick.gates || {};
    if (pick.selection_override) {
      return [
        ['DATA QUALITY', g.data_quality || 'PASS'],
        ['GOALOO 1X2', g.goaloo_1x2_market || 'PASS'],
        ['CONFIDENCE ≥40%', g.owner_confidence_min || 'PASS'],
        ['ODDS ≥1.88', g.owner_odds_min || 'PASS'],
        ['ODDS ≤3.00', g.odds_safety_max || 'PASS'],
        ['DAILY CAP', 'UNLIMITED']
      ];
    }
    return [
      ['UNDERLYING 3/4', g.underlying_performance || 'PASS'],
      ['MARKET EDGE', g.market_edge || 'PASS'],
      ['EXPECTED VALUE', g.ev || 'PASS'],
      ['ODDS SAFETY', g.beta_odds_cap || 'PASS'],
      ['LINEUP', g.lineup || 'PENDING'],
      ['REST / ROTATION', g.rest_rotation || 'UNVERIFIED']
    ];
  }

  function markup(pick) {
    const model = pick.model || {};
    const quality = pick.data_quality || {};
    const selected = String(pick.side || '').toUpperCase();
    const selectedProb = pick.model_probability ?? (pick.side === 'away' ? model.away_win : model.home_win);
    const marketFair = pick.market_fair_probability;
    const pickName = String(pick.pick || '').replace(/\s+Win$/i, '') || (pick.side === 'away' ? pick.away : pick.home);
    const mode = pick.selection_override ? 'OWNER THRESHOLD · ONE-DAY OVERRIDE' : 'KING V2 · DEFAULT';
    const gates = gateRows(pick);

    return `<div class="king-inline-analysis" data-inline-analysis>
      <div class="king-analysis-head">
        <div><span>WHY THIS PICK</span><h2>${esc(pick.home)} vs ${esc(pick.away)} · ${esc(pickName)}</h2></div>
        <div class="king-analysis-sample king-inline-mode">${esc(mode)}</div>
      </div>
      <div class="king-analysis-why">
        <span>MODEL <b>${pct(selectedProb)}</b></span>
        <span>LOCKED ODDS <b>${odds(pick.odds)}</b></span>
        <span>MARKET FAIR <b>${pct(marketFair)}</b></span>
        <span>EDGE <b class="positive">${positivePct(pick.market_edge)}</b></span>
        <span>EV <b class="positive">${positivePct(pick.ev)}</b></span>
      </div>
      <div class="king-analysis-grid">
        <div class="king-analysis-block">
          <span>MODEL PROBABILITY</span>
          ${probRow('HOME', model.home_win, selected === 'HOME')}
          ${probRow('DRAW', model.draw, selected === 'DRAW')}
          ${probRow('AWAY', model.away_win, selected === 'AWAY')}
        </div>
        <div class="king-analysis-block">
          <span>VALUE ANALYSIS</span>
          <div class="king-analysis-kv"><span>Locked Odds</span><b>${odds(pick.odds)}</b></div>
          <div class="king-analysis-kv"><span>Market Fair</span><b>${pct(marketFair)}</b></div>
          <div class="king-analysis-kv"><span>Market Edge</span><b class="positive">${positivePct(pick.market_edge)}</b></div>
          <div class="king-analysis-kv"><span>Expected Value</span><b class="positive">${positivePct(pick.ev)}</b></div>
        </div>
        <div class="king-analysis-block">
          <span>SELECTION GATES</span>
          <div class="king-gate-list">${gates.map(([name, value]) => gate(name, value)).join('')}</div>
        </div>
      </div>
      <div class="king-analysis-foot">
        <span>λ HOME <b>${num(model.lambda_home) === null ? '—' : Number(model.lambda_home).toFixed(2)}</b></span>
        <span>λ AWAY <b>${num(model.lambda_away) === null ? '—' : Number(model.lambda_away).toFixed(2)}</b></span>
        <span>H2H ADJ <b>${num(model.h2h_adjustment) === null ? '—' : pct(model.h2h_adjustment)}</b></span>
        <span>RECENT HOME <b>${esc(quality.home_recent ?? '—')}</b></span>
        <span>RECENT AWAY <b>${esc(quality.away_recent ?? '—')}</b></span>
        <span>H2H SAMPLE <b>${esc(quality.h2h_n ?? '—')}</b></span>
        <span class="king-analysis-source">GOALOO DIRECT FEEDS · MODEL GOAL RATE (λ)</span>
      </div>
      <button type="button" class="king-inline-close">CLOSE ANALYSIS ▲</button>
    </div>`;
  }

  function setToggle(card, open) {
    const label = card.querySelector('.king-preview-toggle span');
    const arrow = card.querySelector('.king-preview-toggle i');
    if (label) label.textContent = open ? 'CLOSE ANALYSIS' : 'VIEW ANALYSIS';
    if (arrow) arrow.textContent = open ? '⌃' : '⌄';
  }

  function mutateWithAnchor(anchor, fn) {
    const before = anchor?.getBoundingClientRect().top;
    fn();
    if (!anchor || before === undefined) return;
    requestAnimationFrame(() => {
      const after = anchor.getBoundingClientRect().top;
      const delta = after - before;
      if (Math.abs(delta) > 0.5) window.scrollBy({top: delta, left: 0, behavior: 'auto'});
    });
  }

  function collapseCard(card) {
    if (!card) return;
    card.classList.remove('is-active', 'is-inline-expanded');
    card.setAttribute('aria-expanded', 'false');
    card.querySelector('[data-inline-analysis]')?.remove();
    setToggle(card, false);
  }

  function closeAll(anchor) {
    mutateWithAnchor(anchor, () => {
      grid.querySelectorAll('.king-preview-card').forEach(collapseCard);
      activeIndex = -1;
    });
  }

  function toggleCard(card) {
    const index = Number(card.dataset.autoPickIndex);
    const pick = picks[index];
    if (!pick) return;

    if (activeIndex === index) {
      closeAll(card);
      return;
    }

    mutateWithAnchor(card, () => {
      grid.querySelectorAll('.king-preview-card').forEach(collapseCard);
      activeIndex = index;
      card.classList.add('is-active', 'is-inline-expanded');
      card.setAttribute('aria-expanded', 'true');
      card.insertAdjacentHTML('beforeend', markup(pick));
      setToggle(card, true);
    });
  }

  grid.addEventListener('click', event => {
    const close = event.target.closest('.king-inline-close');
    if (close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const card = close.closest('.king-preview-card');
      closeAll(card);
      return;
    }
    if (event.target.closest('[data-inline-analysis]')) {
      event.stopImmediatePropagation();
      return;
    }
    const card = event.target.closest('.king-preview-card[data-auto-pick-index]');
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleCard(card);
  }, true);

  grid.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.king-preview-card[data-auto-pick-index]');
    if (!card || event.target.closest('[data-inline-analysis]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleCard(card);
  }, true);

  fetch(`${FEED}?t=${Date.now()}`, {cache:'no-store'})
    .then(response => {
      if (!response.ok) throw new Error('feed unavailable');
      return response.json();
    })
    .then(data => { picks = Array.isArray(data.today) ? data.today : []; })
    .catch(() => { picks = []; });
})();
