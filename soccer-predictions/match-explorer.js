(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const state = {
    scope: 'nomad',
    daily: [],
    nomad: [],
    league: 'ALL',
    command: 'ALL',
    query: '',
    visible: PAGE_SIZE,
    coverageComplete: false,
    coverageLabel: 'DAILY MATCHES',
    coverageNote: ''
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const finite = value => Number.isFinite(Number(value));

  async function loadJson(path){
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function searchable(match){
    return [match.home, match.away, match.league, match.kickoff, match.pick]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function analysed(match){
    return Boolean(match?.pick) && finite(match?.confidence) && finite(match?.odds);
  }

  function fixturePendingCard(match){
    const search = searchable(match);
    return `<article class="prediction-card fixture-pending" data-search="${esc(search)}">
      <div class="card-head">
        <div>
          <div class="league-line"><span>${esc(match.league || '—')}</span><span>•</span><span>${esc(match.kickoff || '—')}</span></div>
          <div class="match-title">
            <div class="team"><span class="team-name">${esc(match.home || '—')}</span></div>
            <div class="vs">VS</div>
            <div class="team away"><span class="team-name">${esc(match.away || '—')}</span></div>
          </div>
        </div>
        <div class="pick-box fixture-wait-box">
          <div class="pick-main"><strong>ANALYSIS PENDING</strong></div>
          <div class="pick-stat"><span>STATUS</span><strong>WAIT</strong></div>
        </div>
      </div>
      <div class="analysis"><strong>ANALYSIS · </strong>Fixture is included in today's coverage, but analytical metrics have not been supplied yet. No confidence, odds or prediction values are fabricated.</div>
    </article>`;
  }

  function renderCard(match){
    if(analysed(match) && typeof window.card === 'function') return window.card(match);
    return fixturePendingCard(match);
  }

  function leagueCounts(){
    const counts = new Map();
    for(const match of state.daily){
      const league = String(match.league || 'Other');
      counts.set(league, (counts.get(league) || 0) + 1);
    }
    return [...counts.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  }

  function matchesForView(){
    let rows = [...state.daily];

    if(state.league !== 'ALL'){
      rows = rows.filter(match => String(match.league || 'Other') === state.league);
    }

    if(state.command === 'NOMAD') rows = rows.filter(match => match.nomadPick === true);
    if(state.command === 'CONF55') rows = rows.filter(match => finite(match.confidence) && Number(match.confidence) >= 55);
    if(state.command === 'ODDS2') rows = rows.filter(match => finite(match.odds) && Number(match.odds) >= 2);

    const q = state.query.trim().toLowerCase();
    if(q) rows = rows.filter(match => searchable(match).includes(q));

    return rows.sort((a,b) => {
      const ta = Date.parse(a.kickoffAt || '') || Number.MAX_SAFE_INTEGER;
      const tb = Date.parse(b.kickoffAt || '') || Number.MAX_SAFE_INTEGER;
      return ta - tb || String(a.league || '').localeCompare(String(b.league || ''));
    });
  }

  function renderLeagueStrip(){
    const host = document.getElementById('leagueStrip');
    if(!host) return;
    const entries = leagueCounts();
    host.innerHTML = [
      `<button class="league-chip ${state.league === 'ALL' ? 'active' : ''}" type="button" data-league="ALL">ALL <span>${state.daily.length}</span></button>`,
      ...entries.map(([league,count]) => `<button class="league-chip ${state.league === league ? 'active' : ''}" type="button" data-league="${esc(league)}">${esc(league)} <span>${count}</span></button>`)
    ].join('');
  }

  function updateCommandStrip(){
    document.querySelectorAll('.command-chip').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.command === state.command);
    });
  }

  function updateAllMatchesHeading(total){
    const label = document.getElementById('heroLabel');
    const count = document.getElementById('pickCount');
    const small = document.getElementById('heroSmall');
    const eyebrow = document.getElementById('sectionEyebrow');
    const title = document.getElementById('sectionTitle');
    const input = document.getElementById('searchInput');

    if(label) label.textContent = 'ALL MATCHES';
    if(count) count.textContent = total;
    if(small) small.textContent = 'matches in view';
    if(eyebrow) eyebrow.textContent = 'DAILY MATCH EXPLORER';
    if(title) title.textContent = state.league === 'ALL' ? '' : state.league;
    if(input) input.placeholder = 'team / league';
  }

  function renderAllMatches(){
    const list = document.getElementById('predictionList');
    const results = document.getElementById('resultList');
    const loadMore = document.getElementById('loadMoreMatches');
    if(!list) return;

    const rows = matchesForView();
    const visible = rows.slice(0, state.visible);

    list.hidden = false;
    if(results) results.hidden = true;
    list.innerHTML = visible.length
      ? visible.map(renderCard).join('')
      : '<div class="empty">No matches found for this filter.</div>';

    if(loadMore){
      loadMore.hidden = visible.length >= rows.length;
      loadMore.textContent = visible.length < rows.length
        ? `Load more · ${rows.length - visible.length} remaining`
        : 'Load more';
    }

    updateAllMatchesHeading(rows.length);
    renderLeagueStrip();
    updateCommandStrip();
  }

  function setScope(scope){
    state.scope = scope;
    state.query = '';
    state.visible = PAGE_SIZE;
    const input = document.getElementById('searchInput');
    if(input) input.value = '';

    document.querySelectorAll('.scope-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scope === scope);
    });

    const tools = document.getElementById('matchExplorerTools');
    document.body.classList.toggle('all-matches-mode', scope === 'all');

    if(scope === 'all'){
      if(tools) tools.hidden = false;
      renderAllMatches();
      return;
    }

    if(tools) tools.hidden = true;
    state.league = 'ALL';
    state.command = 'ALL';

    const todayTab = document.querySelector('.day-tab[data-view="today"]');
    if(todayTab) todayTab.click();

    const list = document.getElementById('predictionList');
    const results = document.getElementById('resultList');
    if(list){
      list.hidden = false;
      list.innerHTML = state.nomad.length
        ? state.nomad.map(renderCard).join('')
        : '<div class="empty">No NOMAD predictions available.</div>';
    }
    if(results) results.hidden = true;

    const label = document.getElementById('heroLabel');
    const count = document.getElementById('pickCount');
    const small = document.getElementById('heroSmall');
    const eyebrow = document.getElementById('sectionEyebrow');
    const title = document.getElementById('sectionTitle');
    if(label) label.textContent = "TODAY'S PREDICTIONS";
    if(count) count.textContent = state.nomad.length;
    if(small) small.textContent = 'qualified picks';
    if(eyebrow) eyebrow.textContent = "TODAY'S SELECTIONS";
    if(title) title.textContent = '';
  }

  function updateCoverage(){
    const box = document.getElementById('explorerStatus');
    const label = document.getElementById('coverageLabel');
    const note = document.getElementById('coverageNote');
    if(!box) return;
    box.classList.toggle('partial', !state.coverageComplete);
    if(label) label.textContent = state.coverageComplete ? 'FULL DAY COVERAGE' : state.coverageLabel;
    if(note) note.textContent = state.coverageNote || (state.coverageComplete ? 'Full daily fixture coverage loaded.' : 'Fixture coverage is not yet complete.');
  }

  function bind(){
    document.querySelectorAll('.scope-tab').forEach(btn => {
      btn.addEventListener('click', () => setScope(btn.dataset.scope));
    });

    const leagueStrip = document.getElementById('leagueStrip');
    if(leagueStrip){
      leagueStrip.addEventListener('click', event => {
        const btn = event.target.closest('[data-league]');
        if(!btn) return;
        state.league = btn.dataset.league;
        state.visible = PAGE_SIZE;
        renderAllMatches();
      });
    }

    const commandStrip = document.getElementById('commandStrip');
    if(commandStrip){
      commandStrip.addEventListener('click', event => {
        const btn = event.target.closest('[data-command]');
        if(!btn) return;
        state.command = btn.dataset.command;
        state.visible = PAGE_SIZE;
        renderAllMatches();
      });
    }

    const loadMore = document.getElementById('loadMoreMatches');
    if(loadMore){
      loadMore.addEventListener('click', () => {
        state.visible += PAGE_SIZE;
        renderAllMatches();
      });
    }

    const input = document.getElementById('searchInput');
    if(input){
      input.addEventListener('input', event => {
        if(state.scope !== 'all') return;
        event.stopImmediatePropagation();
        state.query = input.value;
        state.visible = PAGE_SIZE;
        renderAllMatches();
      }, true);
    }
  }

  async function init(){
    try{
      const [dailyData, nomadData] = await Promise.all([
        loadJson('data/daily-matches.json?v=20260829-explorer-v1'),
        loadJson('data/predictions.json?v=20260828-team-logos-v1')
      ]);
      state.daily = Array.isArray(dailyData.matches) ? dailyData.matches : [];
      state.nomad = Array.isArray(nomadData.picks) ? nomadData.picks : [];
      state.coverageComplete = dailyData.coverageComplete === true;
      state.coverageLabel = String(dailyData.coverageLabel || 'DAILY MATCHES');
      state.coverageNote = String(dailyData.coverageNote || '');
    }catch(err){
      state.daily = [];
      state.coverageComplete = false;
      state.coverageLabel = 'FEED UNAVAILABLE';
      state.coverageNote = `Unable to load daily match feed: ${err.message}`;
    }

    const nomadCount = document.getElementById('nomadScopeCount');
    const allCount = document.getElementById('allScopeCount');
    if(nomadCount) nomadCount.textContent = state.nomad.length;
    if(allCount) allCount.textContent = state.daily.length;

    updateCoverage();
    renderLeagueStrip();
    bind();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
