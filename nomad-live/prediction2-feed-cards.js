(() => {
  'use strict';

  const FEED = 'https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/main/the-king-feed.json';
  const grid = document.querySelector('.king-preview-grid');
  const drawer = document.getElementById('kingAnalysisDrawer');
  if (!grid) return;

  if (drawer) {
    drawer.hidden = true;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

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
    .king-preview-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;align-items:stretch!important;}
    .king-preview-card.king-full-card{cursor:default!important;padding:14px!important;display:flex!important;flex-direction:column!important;min-height:100%;overflow:hidden!important;}
    .king-preview-card.king-full-card:after{opacity:1;border-color:rgba(255,255,255,.045);box-shadow:none;}
    .king-full-card .king-preview-top{margin-bottom:10px!important;}
    .king-full-context{display:block;margin-top:3px;color:#69736c;font-size:7px;font-weight:800;letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}
    .king-full-card .king-preview-match{min-height:58px!important;}
    .king-full-card .king-preview-pick{margin-top:10px!important;padding-top:9px!important;border-top:1px solid rgba(255,255,255,.05);}
    .king-full-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin-top:10px;background:rgba(255,255,255,.05);border-radius:8px;overflow:hidden;}
    .king-full-summary>div{background:#151a16;padding:8px 7px;min-width:0;}
    .king-full-summary span,.king-full-section-title{display:block;color:#727d76;font-size:7px;font-weight:900;letter-spacing:.055em;}
    .king-full-summary b{display:block;margin-top:3px;color:#eef2ef;font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .king-full-summary b.positive,.king-full-summary b.pick{color:var(--green);}
    .king-full-section{margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.05);}
    .king-full-probs{margin-top:7px;}
    .king-full-prob{display:grid;grid-template-columns:40px minmax(0,1fr) 42px;align-items:center;gap:7px;margin-top:6px;color:#959e97;font-size:8px;font-weight:800;}
    .king-full-track{height:4px;background:#262c28;border-radius:99px;overflow:hidden;}
    .king-full-fill{height:100%;background:#68716b;border-radius:99px;}
    .king-full-prob.selected .king-full-fill{background:var(--green);}
    .king-full-prob strong{text-align:right;color:#dfe4e0;font-size:9px;font-variant-numeric:tabular-nums;}
    .king-full-details{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;margin-top:8px;background:rgba(255,255,255,.045);border-radius:8px;overflow:hidden;}
    .king-full-detail{background:#151a16;padding:8px;min-width:0;}
    .king-full-detail span{display:block;color:#717b74;font-size:7px;font-weight:900;letter-spacing:.045em;}
    .king-full-detail b{display:block;margin-top:3px;color:#c9cfca;font-size:10px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .king-full-qualified{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:auto;padding-top:10px;color:#7d8780;font-size:8px;font-weight:800;letter-spacing:.045em;}
    .king-full-qualified strong{color:var(--green);font-size:8px;letter-spacing:.06em;}
    @media(hover:hover) and (pointer:fine){
      .king-preview-card.king-full-card:hover{background:linear-gradient(180deg,rgba(26,34,29,.99),rgba(17,22,18,.99));box-shadow:0 10px 28px rgba(0,0,0,.16);}
      .king-preview-card.king-full-card:hover:after{border-color:rgba(80,220,143,.34);box-shadow:0 0 14px rgba(80,220,143,.11),inset 0 0 10px rgba(80,220,143,.03);}
    }
    @media(max-width:699px){
      .king-preview-grid{grid-template-columns:1fr!important;gap:8px!important;}
      .king-preview-card.king-full-card{padding:12px!important;}
      .king-full-summary{grid-template-columns:repeat(2,minmax(0,1fr));}
      .king-full-details{grid-template-columns:repeat(2,minmax(0,1fr));}
      .king-full-qualified{padding-top:9px;}
    }
  `;
  document.head.appendChild(style);

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const clean = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const n = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const pct = value => n(value) === null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
  const signedPct = value => n(value) === null ? '—' : `${Number(value) >= 0 ? '+' : ''}${(Number(value) * 100).toFixed(1)}%`;
  const odds = value => n(value) === null ? '—' : Number(value).toFixed(2);
  const fixed = (value, digits=2) => n(value) === null ? '—' : Number(value).toFixed(digits);

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

  const kickoffLabel = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const m = raw.match(/(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[1]} · ${m[2]}` : raw;
  };

  const probRow = (label, value, selected) => {
    const p = n(value) === null ? 0 : Math.max(0, Math.min(1, Number(value)));
    return `<div class="king-full-prob ${selected ? 'selected' : ''}"><span>${label}</span><div class="king-full-track"><div class="king-full-fill" style="width:${(p*100).toFixed(1)}%"></div></div><strong>${pct(p)}</strong></div>`;
  };

  const cardMarkup = (pick, index) => {
    const home = clean(pick.home);
    const away = clean(pick.away);
    const key = `${home}|${away}|${pick.goaloo_id || pick.id || index}`;
    const set = SETS[hash(key) % SETS.length];
    const seed = hash(key);
    const selected = String(pick.side || '').toUpperCase();
    const pickName = clean(String(pick.pick || '').replace(/\s+Win$/i, '')) || (selected === 'AWAY' ? away : home);
    const sideNo = selected === 'AWAY' ? '2' : selected === 'DRAW' ? 'X' : '1';
    const model = pick.model || {};
    const quality = pick.data_quality || {};
    const selectedProb = pick.model_probability ?? (selected === 'AWAY' ? model.away_win : model.home_win);
    const status = String(pick.result || 'PENDING').toUpperCase();
    const context = [clean(pick.league), kickoffLabel(pick.kickoff)].filter(Boolean).join(' · ');

    return `<article class="king-preview-card king-full-card">
      <div class="king-preview-top">
        <div><span class="king-preview-rank">TOP PICK · ${String(index+1).padStart(2,'0')}</span><span class="king-full-context">${esc(context || 'FULL-TIME 1X2')}</span></div>
        <span class="king-preview-market">FULL-TIME · 1X2</span>
      </div>

      <div class="king-preview-match">
        <div class="king-preview-side"><img class="king-preview-shirt" src="${shirtUri(set.home,seed)}" alt="" aria-hidden="true"><div class="king-preview-teamstack"><span class="king-preview-role">HOME</span><div class="king-preview-team">${esc(home)}</div></div></div>
        <div class="king-preview-vs">VS</div>
        <div class="king-preview-side away"><div class="king-preview-teamstack away"><span class="king-preview-role">AWAY</span><div class="king-preview-team away">${esc(away)}</div></div><img class="king-preview-shirt" src="${shirtUri(set.away,seed+17)}" alt="" aria-hidden="true"></div>
      </div>

      <div class="king-preview-pick">
        <div><span>PICK</span><b>${esc(pickName)} · ${sideNo}</b></div>
        <div class="king-preview-odds"><span>ODDS</span><b>${odds(pick.odds)}</b></div>
      </div>

      <div class="king-full-summary">
        <div><span>CONFIDENCE</span><b class="pick">${pct(selectedProb)}</b></div>
        <div><span>MARKET FAIR</span><b>${pct(pick.market_fair_probability)}</b></div>
        <div><span>EDGE</span><b class="positive">${signedPct(pick.market_edge)}</b></div>
        <div><span>VALUE</span><b class="positive">${signedPct(pick.ev)}</b></div>
      </div>

      <div class="king-full-section">
        <span class="king-full-section-title">MATCH PROBABILITY</span>
        <div class="king-full-probs">
          ${probRow('HOME', model.home_win, selected === 'HOME')}
          ${probRow('DRAW', model.draw, selected === 'DRAW')}
          ${probRow('AWAY', model.away_win, selected === 'AWAY')}
        </div>
      </div>

      <div class="king-full-details">
        <div class="king-full-detail"><span>RECENT HOME</span><b>${esc(quality.home_recent ?? '—')} matches</b></div>
        <div class="king-full-detail"><span>RECENT AWAY</span><b>${esc(quality.away_recent ?? '—')} matches</b></div>
        <div class="king-full-detail"><span>H2H SAMPLE</span><b>${esc(quality.h2h_n ?? '—')} matches</b></div>
        <div class="king-full-detail"><span>GOAL PROJECTION · HOME</span><b>${fixed(model.lambda_home)}</b></div>
        <div class="king-full-detail"><span>GOAL PROJECTION · AWAY</span><b>${fixed(model.lambda_away)}</b></div>
        <div class="king-full-detail"><span>H2H TREND</span><b>${signedPct(model.h2h_adjustment)}</b></div>
      </div>

      <div class="king-full-qualified"><span>Pre-match selection · verified result tracking</span><strong>${esc(status === 'PENDING' ? 'QUALIFIED' : status)}</strong></div>
    </article>`;
  };

  const renderCards = list => {
    const picks = Array.isArray(list) ? list : [];
    grid.hidden = false;
    if (!picks.length) {
      grid.innerHTML = '<article class="king-preview-card king-full-card"><div class="king-empty">NO KING PICK TODAY</div></article>';
      return;
    }
    grid.innerHTML = picks.map(cardMarkup).join('');
  };

  grid.innerHTML = '<article class="king-preview-card king-full-card"><div class="king-empty">LOADING TODAY\'S PICKS…</div></article>';
  grid.hidden = false;

  fetch(`${FEED}?t=${Date.now()}`, {cache:'no-store'})
    .then(response => {
      if (!response.ok) throw new Error('feed unavailable');
      return response.json();
    })
    .then(data => renderCards(data.today || []))
    .catch(() => {
      grid.hidden = false;
      grid.innerHTML = '<article class="king-preview-card king-full-card"><div class="king-empty">PICKS TEMPORARILY UNAVAILABLE</div></article>';
    });
})();