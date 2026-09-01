(() => {
  'use strict';

  const MQ = window.matchMedia('(min-width:1025px)');
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
    const text = String(value || 'nomad');
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const patternMarkup = (type, secondary, accent) => {
    switch (type) {
      case 'vertical':
        return `<g fill="${secondary}"><rect x="20" y="7" width="5" height="53"/><rect x="30" y="6" width="5" height="54"/><rect x="40" y="7" width="5" height="53"/></g>`;
      case 'hoops':
        return `<g fill="${secondary}"><rect x="7" y="18" width="50" height="7"/><rect x="11" y="32" width="42" height="7"/><rect x="18" y="46" width="28" height="7"/></g>`;
      case 'half':
        return `<rect x="32" y="4" width="31" height="57" fill="${secondary}"/>`;
      case 'chest':
        return `<rect x="8" y="25" width="48" height="10" fill="${secondary}"/><rect x="8" y="35" width="48" height="1.5" fill="${accent}" opacity=".75"/>`;
      case 'sash':
        return `<polygon points="8,17 15,11 54,49 47,56" fill="${secondary}"/><polygon points="11,13 14,11 54,50 51,53" fill="${accent}" opacity=".7"/>`;
      case 'chevron':
        return `<path d="M8 18 32 38 56 18 52 13 32 30 12 13Z" fill="${secondary}"/><path d="M13 14 32 30 51 14" fill="none" stroke="${accent}" stroke-width="1.5" opacity=".72"/>`;
      case 'pinstripe':
        return `<g stroke="${secondary}" stroke-width="1.4" opacity=".9"><path d="M21 8V58"/><path d="M27 6V59"/><path d="M33 6V59"/><path d="M39 6V59"/><path d="M45 8V58"/></g>`;
      case 'sleeve':
        return `<polygon points="7,14 22,7 22,20 12,26" fill="${secondary}"/><polygon points="42,7 57,14 52,26 42,20" fill="${secondary}"/><path d="M21 8H43" stroke="${accent}" stroke-width="1.5" opacity=".7"/>`;
      case 'shoulder':
        return `<path d="M9 14 22 7H42L55 14 50 22 42 18H22L14 22Z" fill="${secondary}"/><path d="M18 10H46" stroke="${accent}" stroke-width="1.4" opacity=".72"/>`;
      case 'center':
        return `<rect x="28" y="5" width="8" height="55" fill="${secondary}"/><rect x="27" y="5" width="1.4" height="55" fill="${accent}" opacity=".7"/><rect x="36" y="5" width="1.4" height="55" fill="${accent}" opacity=".7"/>`;
      case 'quarters':
        return `<rect x="32" y="4" width="31" height="28" fill="${secondary}"/><rect x="1" y="32" width="31" height="29" fill="${secondary}"/><path d="M32 5V59M8 32H56" stroke="${accent}" stroke-width="1.2" opacity=".55"/>`;
      case 'plain':
      default:
        return `<path d="M18 21H46" stroke="${secondary}" stroke-width="1.2" opacity=".45"/>`;
    }
  };

  const shirtSvg = (def, seed) => {
    const shape = 'M21 7 27 4h10l6 3 14 8-5 12-7-4v37H19V23l-7 4-5-12Z';
    const seedA = (seed % 13) + 2;
    const seedB = (seed % 7) + 3;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <clipPath id="c"><path d="${shape}"/></clipPath>
        <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".20"/><stop offset=".45" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".30"/></linearGradient>
        <pattern id="grain" width="${seedA}" height="${seedB}" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".45" fill="#fff" opacity=".055"/><circle cx="${Math.max(2, seedA - 2)}" cy="${Math.max(2, seedB - 2)}" r=".45" fill="#000" opacity=".07"/></pattern>
      </defs>
      <g clip-path="url(#c)">
        <rect x="0" y="0" width="64" height="64" fill="${def.base}"/>
        ${patternMarkup(def.pattern, def.secondary, def.accent)}
        <rect x="0" y="0" width="64" height="64" fill="url(#shade)"/>
        <rect x="0" y="0" width="64" height="64" fill="url(#grain)"/>
      </g>
      <path d="${shape}" fill="none" stroke="#090a08" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="${shape}" fill="none" stroke="${def.accent}" stroke-opacity=".52" stroke-width=".72" stroke-linejoin="round"/>
      <path d="M27 5 32 12 37 5" fill="#11130f" stroke="${def.accent}" stroke-width="1.05" stroke-linejoin="round"/>
      <path d="M28 6.2 32 10.5 36 6.2" fill="${def.secondary}" opacity=".88"/>
      <path d="M19 22V59M45 22V59" stroke="#fff" stroke-opacity=".07" stroke-width="1"/>
      <path d="M12 16 19 20M52 16 45 20" stroke="${def.accent}" stroke-opacity=".56" stroke-width="1"/>
      <path d="M24 57H40" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>
    </svg>`;
  };

  const dataUri = (def, seed) => `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(shirtSvg(def, seed))}`;
  const escText = value => String(value ?? '').replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch]));
  const escAttr = value => escText(value).replace(/"/g, '&quot;');

  const parseTeams = teamsEl => {
    if (!teamsEl) return null;
    if (teamsEl.dataset.teamHome && teamsEl.dataset.teamAway) {
      return {home:teamsEl.dataset.teamHome, away:teamsEl.dataset.teamAway};
    }
    const text = String(teamsEl.textContent || '').trim();
    const match = text.match(/^(.*?)\s+(?:—|–|-)\s+(.*?)$/);
    if (!match) return null;
    const home = match[1].trim();
    const away = match[2].trim();
    if (!home || !away) return null;
    teamsEl.dataset.teamHome = home;
    teamsEl.dataset.teamAway = away;
    teamsEl.dataset.teamPlain = `${home} — ${away}`;
    return {home, away};
  };

  const decorate = row => {
    if (!MQ.matches || !row) return;
    const teamsEl = row.querySelector(':scope > summary .teams');
    const teams = parseTeams(teamsEl);
    if (!teams || teamsEl.dataset.teamShirtsReady === '1') return;

    const matchKey = row.dataset.matchId || `${teams.home}|${teams.away}`;
    const index = hash(matchKey) % SETS.length;
    const set = SETS[index];
    const seed = hash(`${matchKey}|${index}`);

    teamsEl.classList.add('team-shirts-ready');
    teamsEl.dataset.teamShirtsReady = '1';
    teamsEl.dataset.teamShirtSet = String(index + 1).padStart(2, '0');
    teamsEl.innerHTML = `<span class="team-shirt-side team-shirt-home"><img class="team-shirt-icon" alt="" aria-hidden="true" draggable="false" src="${dataUri(set.home, seed)}"><span class="team-shirt-name" title="${escAttr(teams.home)}">${escText(teams.home)}</span></span><span class="team-shirt-divider" aria-hidden="true">—</span><span class="team-shirt-side team-shirt-away"><span class="team-shirt-name" title="${escAttr(teams.away)}">${escText(teams.away)}</span><img class="team-shirt-icon" alt="" aria-hidden="true" draggable="false" src="${dataUri(set.away, seed + 17)}"></span>`;
  };

  const restore = row => {
    const teamsEl = row?.querySelector(':scope > summary .teams');
    if (!teamsEl || teamsEl.dataset.teamShirtsReady !== '1') return;
    const plain = teamsEl.dataset.teamPlain || `${teamsEl.dataset.teamHome || 'Home'} — ${teamsEl.dataset.teamAway || 'Away'}`;
    teamsEl.textContent = plain;
    teamsEl.classList.remove('team-shirts-ready');
    delete teamsEl.dataset.teamShirtsReady;
  };

  const renderAll = () => {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(row => MQ.matches ? decorate(row) : restore(row));
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
    if (list) new MutationObserver(queue).observe(list, {childList:true, subtree:true});
    if (typeof MQ.addEventListener === 'function') MQ.addEventListener('change', queue);
    else if (typeof MQ.addListener === 'function') MQ.addListener(queue);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
