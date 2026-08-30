(() => {
  'use strict';

  // Presentation-only team labels for NOMAD Live 3.41.
  // Uses team names already rendered by runtime.js; does not touch feed, engine,
  // signal logic, odds logic, localStorage, or SIGNAL LOCK semantics.

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  function injectStyle() {
    if (document.getElementById('nomad-team-context-style')) return;
    const style = document.createElement('style');
    style.id = 'nomad-team-context-style';
    style.textContent = `
      .team-context-inline {
        color:#a7cbb0;
        font-weight:600;
      }
      .event-timeline-card .event-row {
        grid-template-columns:minmax(72px,88px) minmax(0,1fr);
      }
      .event-timeline-card .event-side.team-context-side {
        display:flex;
        min-width:0;
        flex-direction:column;
        align-items:flex-end;
        justify-content:center;
        line-height:1.05;
      }
      .event-timeline-card .event-side.team-context-side strong {
        color:inherit;
        font:inherit;
        font-weight:500;
      }
      .event-timeline-card .event-side.team-context-side small {
        display:block;
        width:100%;
        margin-top:2px;
        overflow:hidden;
        color:#b8c2bb;
        font-size:5.8px;
        font-weight:500;
        letter-spacing:0;
        text-align:right;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      .event-timeline-card .event-axis,
      .event-timeline-card .event-empty {
        margin-left:95px;
      }
      @media(max-width:700px) {
        .event-timeline-card .event-row {
          grid-template-columns:78px minmax(0,1fr);
          gap:6px;
        }
        .event-timeline-card .event-axis,
        .event-timeline-card .event-empty {
          margin-left:84px;
        }
      }
      @media(max-width:420px) {
        .event-timeline-card .event-row {
          grid-template-columns:72px minmax(0,1fr);
          gap:5px;
        }
        .event-timeline-card .event-side.team-context-side small {
          font-size:5.4px;
        }
        .event-timeline-card .event-axis,
        .event-timeline-card .event-empty {
          margin-left:77px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function teamsFor(row) {
    const text = String(row.querySelector(':scope > summary .teams')?.textContent || '').trim();
    const match = text.match(/^(.*?)\s+(?:—|–|-)\s+(.*?)$/);
    if (!match) return null;
    const home = match[1].trim();
    const away = match[2].trim();
    if (!home || !away) return null;
    return {home, away};
  }

  function teamFor(teams, side) {
    return String(side || '').toLowerCase() === 'away' ? teams.away : teams.home;
  }

  function stripTeamPrefix(value, teams) {
    let text = String(value || '').trim();
    for (const name of [teams.home, teams.away]) {
      const prefix = `${name} · `;
      if (text.startsWith(prefix)) {
        text = text.slice(prefix.length).trim();
        break;
      }
    }
    return text.replace(/^(?:HOME|AWAY)\s*·\s*/i, '').trim();
  }

  function decorateSelected(row, teams) {
    const value = row.querySelector(':scope > summary .price-selected-value');
    if (!value) return;
    const side = String(row.dataset.side || 'home').toLowerCase() === 'away' ? 'away' : 'home';
    const team = teamFor(teams, side);
    const base = stripTeamPrefix(value.textContent, teams) || 'N/A';
    const next = `${team} · ${base}`;
    if (value.textContent.trim() !== next) value.textContent = next;
  }

  function decorateSignalLock(row, teams) {
    const cards = [...row.querySelectorAll('.detail-card')];
    const lockCard = cards.find(card =>
      String(card.querySelector('h3')?.textContent || '').trim().toUpperCase() === 'SIGNAL LOCK · LOCKED'
    );
    if (!lockCard) return;

    for (const check of lockCard.querySelectorAll('.check')) {
      const label = check.querySelector('span');
      const value = check.querySelector('b');
      if (!label || !value) continue;
      const match = String(label.textContent || '').trim().match(/^Locked\s+(HOME|AWAY)\s+AH\s*\/\s*odds$/i);
      if (!match) continue;
      const side = match[1].toLowerCase();
      const team = teamFor(teams, side);
      const base = stripTeamPrefix(value.textContent, teams);
      const next = `${team} · ${base}`;
      if (value.textContent.trim() !== next) value.textContent = next;
    }
  }

  function decorateRolling(row, teams) {
    for (const title of row.querySelectorAll('.detail-card > h3')) {
      const text = String(title.textContent || '').trim();
      const match = text.match(/^(HOME|AWAY)\s+ROLLING DELTA\s*·\s*(.+?\s+MIN)(?:\s*·\s*.*)?$/i);
      if (!match) continue;
      const side = match[1].toLowerCase();
      const sideLabel = side.toUpperCase();
      const base = `${sideLabel} ROLLING DELTA · ${match[2].trim()}`;
      const team = teamFor(teams, side);
      const wanted = `${base} · ${team}`;
      if (title.textContent.trim() === wanted && title.querySelector('.team-context-inline')) continue;
      title.innerHTML = `${esc(base)}<span class="team-context-inline"> · ${esc(team)}</span>`;
    }
  }

  function decorateTimeline(row, teams) {
    const timeline = row.querySelector('[data-event-timeline="1"]');
    if (!timeline) return;
    for (const side of ['home', 'away']) {
      const label = timeline.querySelector(`.event-row.${side} .event-side`);
      if (!label) continue;
      const team = teamFor(teams, side);
      if (label.dataset.teamContext === team) continue;
      label.classList.add('team-context-side');
      label.dataset.teamContext = team;
      label.innerHTML = `<strong>${side.toUpperCase()}</strong><small title="${esc(team)}">${esc(team)}</small>`;
    }
  }

  function decorateRow(row) {
    const teams = teamsFor(row);
    if (!teams) return;
    decorateSelected(row, teams);
    decorateSignalLock(row, teams);
    decorateRolling(row, teams);
    decorateTimeline(row, teams);
  }

  function renderAll() {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(decorateRow);
  }

  let queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderAll();
    });
  }

  const start = () => {
    injectStyle();
    renderAll();
    const list = document.querySelector('.match-list');
    if (list) new MutationObserver(queue).observe(list, {childList:true, subtree:true, characterData:true});
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
