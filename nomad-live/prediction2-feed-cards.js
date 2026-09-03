(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-feed.json';
  const tbody = document.getElementById('todayRows');
  if (!tbody) return;

  // The large preview-card rail is retired. Keep only the compact TODAY list.
  document.querySelector('.king-preview-grid')?.remove();
  document.getElementById('kingAnalysisDrawer')?.remove();

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

  const style = document.createElement('style');
  style.textContent = `
    #todayRows > tr:not(.king-expand-row){cursor:pointer;transition:background-color .16s ease;}
    #todayRows > tr:not(.king-expand-row):hover,
    #todayRows > tr.king-row-open{background:rgba(77,208,132,.045);}
    #todayRows > tr:not(.king-expand-row) td:first-child{position:relative;padding-right:27px!important;}
    #todayRows > tr:not(.king-expand-row) td:first-child::after{content:'⌄';position:absolute;right:9px;top:50%;transform:translateY(-52%);color:#657169;font-size:12px;line-height:1;transition:transform .16s ease,color .16s ease;}
    #todayRows > tr.king-row-open td:first-child::after{transform:translateY(-48%) rotate(180deg);color:var(--green);}
    .king-expand-row td{padding:0!important;border-top:0!important;background:#101411!important;}
    .king-expand-shell{padding:15px 18px 17px;border-top:1px solid rgba(80,220,143,.20);border-bottom:1px solid rgba(255,255,255,.045);box-shadow:inset 0 10px 18px rgba(0,0,0,.09);}
    .king-expand-match{display:grid;grid-template-columns:minmax(0,1fr) 44px 34px 44px minmax(0,1fr);align-items:center;gap:8px;max-width:760px;margin:0 auto;}
    .king-expand-team{min-width:0;color:#eef2ef;font-size:13px;font-weight:900;line-height:1.22;}
    .king-expand-team.home{text-align:right;}
    .king-expand-team.away{text-align:left;}
    .king-expand-team span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;}
    .king-expand-shirt{display:block;width:42px;height:42px;object-fit:contain;}
    .king-expand-vs{text-align:center;color:#818c84;font-size:9px;font-weight:950;letter-spacing:.12em;}
    .king-expand-meta{text-align:center;margin-top:7px;color:#737e77;font-size:8px;font-weight:850;letter-spacing:.045em;line-height:1.45;}
    .king-expand-meta b{color:#aeb7b0;font-weight:850;}
    .king-expand-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin-top:13px;background:rgba(255,255,255,.05);border-radius:8px;overflow:hidden;}
    .king-expand-summary>div{min-width:0;padding:9px 10px;background:#151a16;}
    .king-expand-summary span,.king-expand-title{display:block;color:#727d76;font-size:7px;font-weight:950;letter-spacing:.055em;}
    .king-expand-summary b{display:block;margin-top:4px;color:#e8ede9;font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;}
    .king-expand-summary b.primary,.king-expand-positive{color:var(--green)!important;}
    .king-expand-section{margin-top:13px;padding-top:11px;border-top:1px solid rgba(255,255,255,.05);}
    .king-expand-probs{margin-top:7px;}
    .king-expand-prob{display:grid;grid-template-columns:42px minmax(0,1fr) 45px;align-items:center;gap:8px;margin-top:7px;color:#909a93;font-size:8px;font-weight:850;}
    .king-expand-track{height:5px;border-radius:99px;background:#252b27;overflow:hidden;}
    .king-expand-fill{height:100%;border-radius:99px;background:#68736c;}
    .king-expand-prob.selected .king-expand-fill{background:var(--green);}
    .king-expand-prob strong{text-align:right;color:#dfe5e0;font-size:9px;font-variant-numeric:tabular-nums;}
    .king-expand-lower{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:13px;}
    .king-expand-block{min-width:0;padding:11px 12px;background:#151a16;border:1px solid rgba(255,255,255,.045);border-radius:8px;}
    .king-expand-kv{display:flex;justify-content:space-between;gap:12px;margin-top:8px;color:#7f8982;font-size:8px;font-weight:800;}
    .king-expand-kv b{color:#d3d9d4;font-size:9px;text-align:right;font-variant-numeric:tabular-nums;}
    .king-expand-status{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;padding-top:10px;border-top:1px solid rgba(255,255,255,.05);color:#727c75;font-size:8px;font-weight:850;letter-spacing:.045em;}
    .king-expand-status strong{color:var(--green);font-size:8px;letter-spacing:.07em;}
    @media(max-width:699px){
      .king-expand-shell{padding:13px 10px 15px;}
      .king-expand-match{grid-template-columns:minmax(0,1fr) 34px 26px 34px minmax(0,1fr);gap:5px;}
      .king-expand-team{font-size:10px;}
      .king-expand-shirt{width:32px;height:32px;}
      .king-expand-vs{font-size:8px;letter-spacing:.08em;}
      .king-expand-meta{font-size:7px;margin-top:6px;}
      .king-expand-summary{grid-template-columns:repeat(2,minmax(0,1fr));}
      .king-expand-lower{grid-template-columns:1fr;gap:8px;}
      .king-expand-prob{grid-template-columns:38px minmax(0,1fr) 42px;gap:6px;}
    }
  `;
  document.head.appendChild(style);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  const clean = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const num = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const pct = value => num(value) === null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
  const signedPct = value => num(value) === null ? '—' : `${Number(value) >= 0 ? '+' : ''}${(Number(value) * 100).toFixed(1)}%`;
  const odds = value => num(value) === null ? '—' : Number(value).toFixed(2);
  const fixed = (value, digits=2) => num(value) === null ? '—' : Number(value).toFixed(digits);
  const edgeLabel = pick => num(pick.market_edge) !== null ? signedPct(pick.market_edge) : num(pick.edge) !== null ? `${Number(pick.edge) >= 0 ? '+' : ''}${Number(pick.edge).toFixed(1)}%` : '—';

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
      case 'sleeve': return `<polygon points="7,14 22,7 22,20 12,26" fill="${secondary}"/><polygon points="42,7 57,14 52,26 42,20" fill="${secondary}"/>`;
      case 'shoulder': return `<path d="M9 14 22 7H42L55 14 50 22 42 18H22L14 22Z" fill="${secondary}"/>`;
      case 'center': return `<rect x="28" y="5" width="8" height="55" fill="${secondary}"/>`;
      case 'quarters': return `<rect x="32" y="4" width="31" height="28" fill="${secondary}"/><rect x="1" y="32" width="31" height="29" fill="${secondary}"/>`;
      default: return '';
    }
  };

  const shirtSvg = (def, seed) => {
    const shape = 'M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z';
    const a = (seed % 13) + 2;
    const b = (seed % 7) + 3;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><clipPath id="c"><path d="${shape}"/></clipPath><linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".30"/></linearGradient><pattern id="grain" width="${a}" height="${b}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#fff" opacity=".055"/></pattern></defs><g clip-path="url(#c)"><rect width="64" height="64" fill="${def.base}"/>${patternMarkup(def.pattern,def.secondary,def.accent)}<rect width="64" height="64" fill="url(#shade)"/><rect width="64" height="64" fill="url(#grain)"/></g><path d="${shape}" fill="none" stroke="#090a08" stroke-width="1.8" stroke-linejoin="round"/><path d="${shape}" fill="none" stroke="${def.accent}" stroke-opacity=".52" stroke-width=".72"/><path d="M27 5 32 12 37 5" fill="#11130f" stroke="${def.accent}" stroke-width="1.05"/></svg>`;
  };

  const shirtUri = (def, seed) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(shirtSvg(def,seed))}`;

  const kickoffParts = pick => {
    const date = clean(pick.date) || '—';
    const raw = String(pick.kickoff || '').trim();
    const m = raw.match(/(?:\d{4}-\d{2}-\d{2}[ T])?(\d{2}:\d{2})/);
    return {date, time:m ? m[1] : (raw || '—')};
  };

  const probRow = (label, value, selected) => {
    const p = num(value) === null ? 0 : Math.max(0, Math.min(1, Number(value)));
    return `<div class="king-expand-prob ${selected ? 'selected' : ''}"><span>${label}</span><div class="king-expand-track"><div class="king-expand-fill" style="width:${(p*100).toFixed(1)}%"></div></div><strong>${pct(p)}</strong></div>`;
  };

  const detailsMarkup = (pick, index) => {
    const home = clean(pick.home);
    const away = clean(pick.away);
    const key = `${home}|${away}|${pick.goaloo_id || pick.id || index}`;
    const set = SETS[hash(key) % SETS.length];
    const seed = hash(key);
    const model = pick.model || {};
    const quality = pick.data_quality || {};
    const selected = String(pick.side || '').toUpperCase();
    const pickName = clean(pick.pick) || '—';
    const selectedProb = pick.model_probability ?? pick.confidence ?? (selected === 'AWAY' ? model.away_win : model.home_win);
    const meta = kickoffParts(pick);
    const status = clean(pick.result || 'PENDING').toUpperCase();

    return `<div class="king-expand-shell">
      <div class="king-expand-match">
        <div class="king-expand-team home"><span>${esc(home)}</span></div>
        <img class="king-expand-shirt" src="${shirtUri(set.home,seed)}" alt="" aria-hidden="true">
        <div class="king-expand-vs">VS</div>
        <img class="king-expand-shirt" src="${shirtUri(set.away,seed+17)}" alt="" aria-hidden="true">
        <div class="king-expand-team away"><span>${esc(away)}</span></div>
      </div>
      <div class="king-expand-meta"><b>${esc(clean(pick.league) || '—')}</b> · ${esc(meta.date)} · ${esc(meta.time)}</div>

      <div class="king-expand-summary">
        <div><span>PICK</span><b class="primary">${esc(pickName)}</b></div>
        <div><span>ODDS</span><b>${odds(pick.odds)}</b></div>
        <div><span>CONFIDENCE</span><b>${pct(selectedProb)}</b></div>
        <div><span>EDGE</span><b class="king-expand-positive">${edgeLabel(pick)}</b></div>
      </div>

      <div class="king-expand-section">
        <span class="king-expand-title">MATCH PROBABILITY</span>
        <div class="king-expand-probs">
          ${probRow('HOME', model.home_win, selected === 'HOME')}
          ${probRow('DRAW', model.draw, selected === 'DRAW')}
          ${probRow('AWAY', model.away_win, selected === 'AWAY')}
        </div>
      </div>

      <div class="king-expand-lower">
        <div class="king-expand-block">
          <span class="king-expand-title">RECENT FORM</span>
          <div class="king-expand-kv"><span>HOME recent</span><b>${esc(quality.home_recent ?? '—')} matches</b></div>
          <div class="king-expand-kv"><span>AWAY recent</span><b>${esc(quality.away_recent ?? '—')} matches</b></div>
          <div class="king-expand-kv"><span>H2H sample</span><b>${esc(quality.h2h_n ?? '—')} matches</b></div>
        </div>
        <div class="king-expand-block">
          <span class="king-expand-title">MATCH OUTLOOK</span>
          <div class="king-expand-kv"><span>Fair probability</span><b>${pct(pick.market_fair_probability)}</b></div>
          <div class="king-expand-kv"><span>Value</span><b class="king-expand-positive">${signedPct(pick.ev)}</b></div>
          <div class="king-expand-kv"><span>Goal projection HOME</span><b>${fixed(model.lambda_home)}</b></div>
          <div class="king-expand-kv"><span>Goal projection AWAY</span><b>${fixed(model.lambda_away)}</b></div>
          <div class="king-expand-kv"><span>H2H trend</span><b>${signedPct(model.h2h_adjustment)}</b></div>
        </div>
      </div>

      <div class="king-expand-status"><span>Pre-match selection · verified result tracking</span><strong>${esc(status)}</strong></div>
    </div>`;
  };

  let today = [];
  let openSummaryRow = null;

  const summaryRows = () => [...tbody.children].filter(row => !row.classList.contains('king-expand-row'));

  const syncRows = () => {
    summaryRows().forEach((row, index) => {
      row.dataset.kingIndex = String(index);
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-expanded', row === openSummaryRow ? 'true' : 'false');
    });
  };

  const closeOpen = () => {
    tbody.querySelector('.king-expand-row')?.remove();
    if (openSummaryRow?.isConnected) {
      openSummaryRow.classList.remove('king-row-open');
      openSummaryRow.setAttribute('aria-expanded', 'false');
    }
    openSummaryRow = null;
  };

  const openRow = row => {
    const index = Number(row.dataset.kingIndex ?? summaryRows().indexOf(row));
    const pick = today[index];
    if (!pick) return;
    if (row === openSummaryRow) {
      closeOpen();
      return;
    }
    closeOpen();
    const detailRow = document.createElement('tr');
    detailRow.className = 'king-expand-row';
    detailRow.innerHTML = `<td colspan="6">${detailsMarkup(pick,index)}</td>`;
    row.after(detailRow);
    row.classList.add('king-row-open');
    row.setAttribute('aria-expanded', 'true');
    openSummaryRow = row;
  };

  tbody.addEventListener('click', event => {
    const row = event.target.closest('tr');
    if (!row || row.classList.contains('king-expand-row') || row.parentElement !== tbody) return;
    if (!today.length) return;
    syncRows();
    openRow(row);
  });

  tbody.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('tr');
    if (!row || row.classList.contains('king-expand-row') || row.parentElement !== tbody) return;
    if (!today.length) return;
    event.preventDefault();
    syncRows();
    openRow(row);
  });

  const feedReady = fetch(`${FEED}?t=${Date.now()}`, {cache:'no-store'})
    .then(response => {
      if (!response.ok) throw new Error('feed unavailable');
      return response.json();
    })
    .then(data => {
      today = Array.isArray(data.today) ? data.today : [];
      syncRows();
      return today;
    })
    .catch(() => {
      today = [];
      return today;
    });

  // The page's original table renderer may finish just after this script.
  // Re-apply only row accessibility metadata; no observer and no extra rendering loop.
  feedReady.finally(() => {
    [0, 180, 600].forEach(delay => setTimeout(syncRows, delay));
  });
})();