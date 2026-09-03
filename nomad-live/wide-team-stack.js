(() => {
  'use strict';

  const MQ = window.matchMedia('(min-width:521px)');
  const PC_MQ = window.matchMedia('(min-width:1025px)');
  const SCORE_RE = /^(\d+)\s*[–-]\s*(\d+)$/;
  const FALLBACK = [
    ['#214f35','#d5b557'],['#1d3d6f','#d2b14f'],['#7a2428','#e6d4a6'],['#e1d8bf','#315a8e'],
    ['#6a2e75','#dbc47c'],['#bf6b25','#171817'],['#176973','#e5dec6'],['#222321','#b96c32']
  ];

  const hash = value => {
    let h = 2166136261;
    const text = String(value || 'nomad');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const escText = value => String(value ?? '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  const escAttr = value => escText(value).replace(/"/g, '&quot;');

  const fallbackShirt = (base, accent) => {
    const shape = 'M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient></defs><path d="${shape}" fill="${base}" stroke="#090a08" stroke-width="1.8" stroke-linejoin="round"/><path d="M27 5 32 12 37 5" fill="#11130f" stroke="${accent}" stroke-width="1.05"/><path d="M28 6.2 32 10.5 36 6.2" fill="${accent}" opacity=".9"/><path d="M10 16 20 21M54 16 44 21M21 27H43" fill="none" stroke="${accent}" stroke-opacity=".58" stroke-width="1.2"/><path d="${shape}" fill="url(#s)" opacity=".55"/></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  };

  const parseTeams = teamsEl => {
    if (!teamsEl) return null;
    if (teamsEl.dataset.teamHome && teamsEl.dataset.teamAway) {
      return {home:teamsEl.dataset.teamHome, away:teamsEl.dataset.teamAway};
    }
    const raw = String(teamsEl.dataset.teamPlain || teamsEl.textContent || '').trim();
    const match = raw.match(/^(.*?)\s+(?:—|–|-)\s+(.*?)$/);
    if (!match) return null;
    const home = match[1].trim();
    const away = match[2].trim();
    if (!home || !away) return null;
    teamsEl.dataset.teamHome = home;
    teamsEl.dataset.teamAway = away;
    teamsEl.dataset.teamPlain = `${home} — ${away}`;
    return {home,away};
  };

  const readScore = row => {
    const score = row?.querySelector(':scope > summary .score');
    if (!score) return null;
    const value = score.querySelector('.score-live-value');
    const raw = String(value?.textContent || score.textContent || '').trim();
    const match = raw.match(SCORE_RE);
    if (!match) return null;
    return {home:match[1],away:match[2]};
  };

  const ensureScore = (line, side, text) => {
    if (!line) return;
    let node = line.querySelector(':scope > .wide-team-score');
    if (!node) {
      node = document.createElement('span');
      node.className = `wide-team-score wide-team-score-${side}`;
      node.setAttribute('aria-hidden','true');
      line.appendChild(node);
    }
    if (node.textContent !== text) node.textContent = text;
  };

  const decorate = row => {
    if (!MQ.matches || !row) return;
    const teamsEl = row.querySelector(':scope > summary .teams');
    const teams = parseTeams(teamsEl);
    if (!teams) return;

    if (teamsEl.dataset.wideTeamReady !== '1') {
      const oldHomeSrc = teamsEl.querySelector('.team-shirt-home img')?.getAttribute('src') || '';
      const oldAwaySrc = teamsEl.querySelector('.team-shirt-away img')?.getAttribute('src') || '';
      const key = row.dataset.matchId || `${teams.home}|${teams.away}`;
      const idx = hash(key) % FALLBACK.length;
      const homeDef = FALLBACK[idx];
      const awayDef = FALLBACK[(idx + 3) % FALLBACK.length];
      const homeSrc = oldHomeSrc || fallbackShirt(homeDef[0],homeDef[1]);
      const awaySrc = oldAwaySrc || fallbackShirt(awayDef[0],awayDef[1]);

      teamsEl.classList.remove('mobile-team-shirts-ready');
      teamsEl.classList.add('wide-team-stacked');
      teamsEl.dataset.wideTeamReady = '1';
      teamsEl.dataset.teamHome = teams.home;
      teamsEl.dataset.teamAway = teams.away;
      teamsEl.dataset.teamPlain = `${teams.home} — ${teams.away}`;

      /* On desktop, mark the existing PC decorator as satisfied so it cannot rewrite this stack. */
      if (PC_MQ.matches) {
        teamsEl.classList.add('team-shirts-ready');
        teamsEl.dataset.teamShirtsReady = '1';
      } else {
        teamsEl.classList.remove('team-shirts-ready');
        delete teamsEl.dataset.teamShirtsReady;
      }

      teamsEl.innerHTML = `<span class="team-shirt-side team-shirt-home wide-team-home"><img class="team-shirt-icon" alt="" aria-hidden="true" draggable="false" src="${homeSrc}"><span class="team-shirt-name" title="${escAttr(teams.home)}">${escText(teams.home)}</span></span><span class="team-shirt-side team-shirt-away wide-team-away"><img class="team-shirt-icon" alt="" aria-hidden="true" draggable="false" src="${awaySrc}"><span class="team-shirt-name" title="${escAttr(teams.away)}">${escText(teams.away)}</span></span>`;
    }

    const score = readScore(row);
    if (!score) return;
    ensureScore(teamsEl.querySelector(':scope > .wide-team-home'),'home',score.home);
    ensureScore(teamsEl.querySelector(':scope > .wide-team-away'),'away',score.away);
  };

  const restore = row => {
    const teamsEl = row?.querySelector(':scope > summary .teams');
    if (!teamsEl || teamsEl.dataset.wideTeamReady !== '1') return;

    /* If the mobile decorator has already taken ownership, only clear wide markers. */
    if (teamsEl.classList.contains('mobile-team-shirts-ready')) {
      teamsEl.classList.remove('wide-team-stacked');
      delete teamsEl.dataset.wideTeamReady;
      return;
    }

    const home = teamsEl.dataset.teamHome || 'Home';
    const away = teamsEl.dataset.teamAway || 'Away';
    teamsEl.textContent = teamsEl.dataset.teamPlain || `${home} — ${away}`;
    teamsEl.classList.remove('wide-team-stacked','team-shirts-ready');
    delete teamsEl.dataset.wideTeamReady;
    delete teamsEl.dataset.teamShirtsReady;
  };

  const syncRow = row => MQ.matches ? decorate(row) : restore(row);

  const renderAll = () => {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(syncRow);
  };

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderAll();
    });
  };

  const start = () => {
    renderAll();
    const list = document.querySelector('.match-list');
    if (list) new MutationObserver(queue).observe(list,{childList:true,subtree:true,characterData:true});
    if (typeof MQ.addEventListener === 'function') MQ.addEventListener('change',queue);
    else if (typeof MQ.addListener === 'function') MQ.addListener(queue);
    if (typeof PC_MQ.addEventListener === 'function') PC_MQ.addEventListener('change',queue);
    else if (typeof PC_MQ.addListener === 'function') PC_MQ.addListener(queue);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
