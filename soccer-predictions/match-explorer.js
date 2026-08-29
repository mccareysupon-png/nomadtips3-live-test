(() => {
  'use strict';

  const PAGE_SIZE = 24;
  const state = {
    scope: 'nomad',
    selected: [],
    nomad: [],
    league: 'ALL',
    command: 'ALL',
    query: '',
    visible: PAGE_SIZE,
    coverageComplete: false,
    coverageLabel: 'CURATED MATCHES',
    coverageNote: '',
    enrichedCount: 0
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

  async function loadJson(path){
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function waitForBaseReady(timeoutMs = 3500){
    const count = document.getElementById('todayCount');
    if(count && count.textContent.trim() !== '—') return Promise.resolve();
    return new Promise(resolve => {
      let done = false;
      const observer = new MutationObserver(() => {
        if(count && count.textContent.trim() !== '—') finish();
      });
      const timer = setTimeout(finish, timeoutMs);
      function finish(){
        if(done) return;
        done = true;
        observer.disconnect();
        clearTimeout(timer);
        resolve();
      }
      if(count) observer.observe(count, {childList:true, subtree:true, characterData:true});
    });
  }

  function searchable(match){
    return [match.home, match.away, match.league, match.kickoff, match.pick, match.sourcePick]
      .filter(Boolean).join(' ').toLowerCase();
  }

  function analysed(match){
    return Boolean(match?.pick) && finite(match?.confidence) && finite(match?.odds);
  }

  function sourceSummaryCard(match){
    const prob = match.sourceProbability || {};
    const home = finite(prob.home) ? Number(prob.home) : null;
    const draw = finite(prob.draw) ? Number(prob.draw) : null;
    const away = finite(prob.away) ? Number(prob.away) : null;
    const probabilityText = [
      home === null ? null : `H ${home}%`,
      draw === null ? null : `D ${draw}%`,
      away === null ? null : `A ${away}%`
    ].filter(Boolean).join(' · ');
    const sourcePick = String(match.sourcePick || 'SOURCE SNAPSHOT');
    const odds = finite(match.odds) ? Number(match.odds).toFixed(2) : '—';
    const sourceUrl = typeof match.source === 'string' ? match.source : '';

    return `<article class="prediction-card fixture-pending source-summary" data-search="${esc(searchable(match))}">
      <div class="card-head">
        <div>
          <div class="league-line"><span>${esc(match.league || '—')}</span><span>•</span><span>${esc(match.kickoff || '—')}</span><span class="badge">SOURCE</span></div>
          <div class="match-title"><div class="team"><span class="team-name">${esc(match.home || '—')}</span></div><div class="vs">VS</div><div class="team away"><span class="team-name">${esc(match.away || '—')}</span></div></div>
        </div>
        <div class="pick-box fixture-wait-box">
          <div class="pick-main"><strong>${esc(sourcePick)}</strong></div>
          <div class="pick-stat"><span>SOURCE ODDS</span><strong>${odds}</strong></div>
          <div class="pick-stat"><span>STATUS</span><strong>REVIEW</strong></div>
        </div>
      </div>
      <div class="analysis"><strong>SOURCE SNAPSHOT · </strong>${esc(probabilityText || '1X2 probability unavailable')}. Forebet's source probability is shown only as input data; it is not NOMAD Confidence. Detailed form, H2H, shooting and NOMAD scoring remain pending enrichment.</div>
      ${sourceUrl ? `<div class="source-line"><a href="${esc(sourceUrl)}" target="_blank" rel="noopener">Source reference</a></div>` : ''}
    </article>`;
  }

  function pendingCard(match){
    return `<article class="prediction-card fixture-pending" data-search="${esc(searchable(match))}">
      <div class="card-head">
        <div>
          <div class="league-line"><span>${esc(match.league || '—')}</span><span>•</span><span>${esc(match.kickoff || '—')}</span></div>
          <div class="match-title"><div class="team"><span class="team-name">${esc(match.home || '—')}</span></div><div class="vs">VS</div><div class="team away"><span class="team-name">${esc(match.away || '—')}</span></div></div>
        </div>
        <div class="pick-box fixture-wait-box"><div class="pick-main"><strong>ANALYSIS PENDING</strong></div><div class="pick-stat"><span>STATUS</span><strong>WAIT</strong></div></div>
      </div>
      <div class="analysis"><strong>ANALYSIS · </strong>This match was manually shortlisted, but the reviewed card data is not complete yet. No missing confidence, odds or analytical values are fabricated.</div>
    </article>`;
  }

  function renderCard(match){
    if(match?.analysisData && analysed(match) && typeof window.card === 'function') return window.card(match);
    if(match?.metricsStatus === 'source-summary' || match?.sourceProbability) return sourceSummaryCard(match);
    if(analysed(match) && typeof window.card === 'function') return window.card(match);
    return pendingCard(match);
  }

  function leagueCounts(){
    const counts = new Map();
    for(const match of state.selected){
      const league = String(match.league || 'Other');
      counts.set(league, (counts.get(league) || 0) + 1);
    }
    return [...counts.entries()].sort((a,b) => a[0].localeCompare(b[0]));
  }

  function matchesForView(){
    let rows = [...state.selected];
    if(state.league !== 'ALL') rows = rows.filter(match => String(match.league || 'Other') === state.league);
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
    host.innerHTML = [
      `<button class="league-chip ${state.league === 'ALL' ? 'active' : ''}" type="button" data-league="ALL">ALL <span>${state.selected.length}</span></button>`,
      ...leagueCounts().map(([league,count]) => `<button class="league-chip ${state.league === league ? 'active' : ''}" type="button" data-league="${esc(league)}">${esc(league)} <span>${count}</span></button>`)
    ].join('');
  }

  function updateCommandStrip(){
    document.querySelectorAll('.command-chip').forEach(btn => btn.classList.toggle('active', btn.dataset.command === state.command));
  }

  function updateSelectedHeading(total){
    const label = document.getElementById('heroLabel');
    const count = document.getElementById('pickCount');
    const small = document.getElementById('heroSmall');
    const eyebrow = document.getElementById('sectionEyebrow');
    const title = document.getElementById('sectionTitle');
    const input = document.getElementById('searchInput');
    if(label) label.textContent = 'SELECTED MATCHES';
    if(count) count.textContent = total;
    if(small) small.textContent = 'selected matches in view';
    if(eyebrow) eyebrow.textContent = 'MATCH EXPLORER';
    if(title) title.textContent = state.league === 'ALL' ? '' : state.league;
    if(input) input.placeholder = 'team / league';
  }

  function renderSelected(){
    const list = document.getElementById('predictionList');
    const results = document.getElementById('resultList');
    const loadMore = document.getElementById('loadMoreMatches');
    if(!list) return;
    const rows = matchesForView();
    const visible = rows.slice(0, state.visible);
    list.hidden = false;
    if(results) results.hidden = true;
    list.innerHTML = visible.length ? visible.map(renderCard).join('') : '<div class="empty">No selected matches found for this filter.</div>';
    if(loadMore){
      loadMore.hidden = visible.length >= rows.length;
      loadMore.textContent = visible.length < rows.length ? `Load more · ${rows.length - visible.length} remaining` : 'Load more';
    }
    updateSelectedHeading(rows.length);
    renderLeagueStrip();
    updateCommandStrip();
  }

  function setScope(scope){
    state.scope = scope;
    state.query = '';
    state.visible = PAGE_SIZE;
    const input = document.getElementById('searchInput');
    const loadMore = document.getElementById('loadMoreMatches');
    if(input) input.value = '';
    document.querySelectorAll('.scope-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.scope === scope));
    const tools = document.getElementById('matchExplorerTools');
    document.body.classList.toggle('selected-matches-mode', scope === 'selected');

    if(scope === 'selected'){
      if(tools) tools.hidden = false;
      renderSelected();
      return;
    }

    if(tools) tools.hidden = true;
    if(loadMore) loadMore.hidden = true;
    state.league = 'ALL';
    state.command = 'ALL';
    const todayTab = document.querySelector('.day-tab[data-view="today"]');
    if(todayTab) todayTab.click();
    const list = document.getElementById('predictionList');
    const results = document.getElementById('resultList');
    if(list){
      list.hidden = false;
      list.innerHTML = state.nomad.length ? state.nomad.map(renderCard).join('') : '<div class="empty">No NOMAD predictions available.</div>';
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
    if(label) label.textContent = state.coverageLabel || 'CURATED MATCHES';
    if(note){
      const base = state.coverageNote || 'Only manually shortlisted matches are included.';
      note.textContent = `${base} · Detailed cards ${state.enrichedCount}/${state.selected.length}`;
    }
  }

  function bind(){
    document.querySelectorAll('.scope-tab').forEach(btn => btn.addEventListener('click', () => setScope(btn.dataset.scope)));
    const leagueStrip = document.getElementById('leagueStrip');
    if(leagueStrip) leagueStrip.addEventListener('click', event => {
      const btn = event.target.closest('[data-league]'); if(!btn) return;
      state.league = btn.dataset.league; state.visible = PAGE_SIZE; renderSelected();
    });
    const commandStrip = document.getElementById('commandStrip');
    if(commandStrip) commandStrip.addEventListener('click', event => {
      const btn = event.target.closest('[data-command]'); if(!btn) return;
      state.command = btn.dataset.command; state.visible = PAGE_SIZE; renderSelected();
    });
    const loadMore = document.getElementById('loadMoreMatches');
    if(loadMore) loadMore.addEventListener('click', () => { state.visible += PAGE_SIZE; renderSelected(); });
    const input = document.getElementById('searchInput');
    if(input) input.addEventListener('input', event => {
      if(state.scope !== 'selected') return;
      event.stopImmediatePropagation();
      state.query = input.value; state.visible = PAGE_SIZE; renderSelected();
    }, true);
  }

  async function init(){
    try{
      const [selectedData, nomadData, enrichedData] = await Promise.all([
        loadJson('data/selected-matches.json?v=20260829-all-main-v1'),
        loadJson('data/predictions.json?v=20260829-confidence40-v1'),
        loadJson('data/enriched-matches.json?v=20260829-enrichment-v1').catch(() => ({matches:[]}))
      ]);
      state.nomad = Array.isArray(nomadData.picks) ? nomadData.picks : [];
      const nomadIds = new Set(state.nomad.map(match => String(match.id || '')));
      const overlays = Array.isArray(enrichedData.matches) ? enrichedData.matches : [];
      const overlayById = new Map(overlays.map(match => [String(match.id || ''), match]));
      const rows = Array.isArray(selectedData.matches) ? selectedData.matches : [];
      state.selected = rows.map(match => {
        const id = String(match.id || '');
        const overlay = overlayById.get(id);
        const merged = overlay ? {...match, ...overlay} : {...match};
        if(overlay?.analysisData?.form){
          const form = overlay.analysisData.form;
          merged.analysisData = {
            ...overlay.analysisData,
            form: {
              ...form,
              home: Array.isArray(form.home) ? form.home.slice(0,5) : [],
              away: Array.isArray(form.away) ? form.away.slice(0,5) : []
            }
          };
        }
        merged.nomadPick = match.nomadPick === true || overlay?.nomadPick === true || nomadIds.has(id);
        return merged;
      });
      state.enrichedCount = state.selected.filter(match => Boolean(match.analysisData) && analysed(match)).length;
      state.coverageComplete = selectedData.coverageComplete === true && state.enrichedCount === state.selected.length;
      state.coverageLabel = String(selectedData.coverageLabel || 'CURATED MATCHES');
      state.coverageNote = String(selectedData.coverageNote || '');
    }catch(err){
      state.selected = [];
      state.enrichedCount = 0;
      state.coverageComplete = false;
      state.coverageLabel = 'SELECTED FEED UNAVAILABLE';
      state.coverageNote = `Unable to load Selected Matches: ${err.message}`;
    }

    await waitForBaseReady();
    const nomadCount = document.getElementById('nomadScopeCount');
    const selectedCount = document.getElementById('selectedScopeCount');
    if(nomadCount) nomadCount.textContent = state.nomad.length;
    if(selectedCount) selectedCount.textContent = state.selected.length;
    updateCoverage(); renderLeagueStrip(); bind();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
