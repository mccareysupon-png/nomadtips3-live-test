(() => {
  'use strict';

  const SOURCE_KEY = 'nomadtips3.nomad-control.draft.v2';
  const AI_KEY = 'nomadtips3.ai-learning-lab.v1';
  const MODEL_VERSION = 'add-k-ai-v0.1';
  const LEARNING_RATE = 0.22;
  const FEATURE_NAMES = ['abc','standing','favorite','highOdds','marketGap','form'];
  const $ = selector => document.querySelector(selector);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sigmoid = value => 1 / (1 + Math.exp(-value));
  const logit = p => Math.log(p / (1 - p));
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[char]);
  const numberOrNull = value => Number.isFinite(Number(value)) ? Number(value) : null;

  function emptyState() {
    return {
      version: MODEL_VERSION,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      weights: Object.fromEntries(FEATURE_NAMES.map(name => [name, 0])),
      snapshots: {},
      trainedIds: [],
      logs: [],
      trainingSamples: 0
    };
  }

  function loadAIState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(AI_KEY) || 'null');
      if (!parsed || parsed.version !== MODEL_VERSION) return emptyState();
      return {
        ...emptyState(),
        ...parsed,
        weights: {...emptyState().weights, ...(parsed.weights || {})},
        snapshots: parsed.snapshots || {},
        trainedIds: Array.isArray(parsed.trainedIds) ? parsed.trainedIds : [],
        logs: Array.isArray(parsed.logs) ? parsed.logs : [],
        trainingSamples: Number(parsed.trainingSamples || 0)
      };
    } catch {
      return emptyState();
    }
  }

  function saveAIState(state) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(AI_KEY, JSON.stringify(state));
  }

  function readSource() {
    try {
      const raw = localStorage.getItem(SOURCE_KEY);
      if (!raw) return {found:false, records:[], datasetId:null};
      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed?.publishedPicks) ? parsed.publishedPicks : [];
      return {found:true, records, datasetId:parsed.datasetId || null};
    } catch {
      return {found:false, records:[], datasetId:null};
    }
  }

  function normalizePickSide(record) {
    const pick = String(record.pick || record.pick_1x2 || record.pickLabel || '').toUpperCase();
    if (pick.includes('AWAY') || pick === '2') return 'AWAY';
    if (pick.includes('DRAW') || pick === 'X') return 'DRAW';
    return 'HOME';
  }

  function rankValue(record, side) {
    const keys = side === 'home'
      ? ['homeRank','home_rank','homeStanding','home_standing','homePosition','home_position']
      : ['awayRank','away_rank','awayStanding','away_standing','awayPosition','away_position'];
    for (const key of keys) {
      const value = numberOrNull(record[key]);
      if (value && value > 0) return value;
    }
    return null;
  }

  function pointsValue(record, side) {
    const keys = side === 'home'
      ? ['homePoints','home_points','homePts','home_pts']
      : ['awayPoints','away_points','awayPts','away_pts'];
    for (const key of keys) {
      const value = numberOrNull(record[key]);
      if (value !== null) return value;
    }
    return null;
  }

  function goalDiffValue(record, side) {
    const keys = side === 'home'
      ? ['homeGoalDifference','home_goal_difference','homeGD','home_gd']
      : ['awayGoalDifference','away_goal_difference','awayGD','away_gd'];
    for (const key of keys) {
      const value = numberOrNull(record[key]);
      if (value !== null) return value;
    }
    return null;
  }

  function abcScore(text) {
    const value = String(text || '').toUpperCase();
    if (!value || value === '—' || value.includes('LIMITED') || value.includes('NO RELIABLE')) return 0;
    if (/(STRONG|CLEAR|POSITIVE|ADVANTAGE|FAVOU?R|BETTER|SUPERIOR|SUPPORT)/.test(value)) return 1;
    if (/(NEGATIVE|DISADVANTAGE|WEAKER|WORSE|AGAINST|CAUTION)/.test(value)) return -1;
    return 0;
  }

  function formScore(record) {
    const direct = numberOrNull(record.formEdge ?? record.form_edge ?? record.recentFormEdge ?? record.recent_form_edge);
    if (direct !== null) return clamp(direct, -1, 1);
    const home = numberOrNull(record.homeFormScore ?? record.home_form_score);
    const away = numberOrNull(record.awayFormScore ?? record.away_form_score);
    if (home !== null && away !== null) {
      const edge = clamp((home - away) / Math.max(1, Math.abs(home) + Math.abs(away)), -1, 1);
      return normalizePickSide(record) === 'AWAY' ? -edge : edge;
    }
    return 0;
  }

  function standingScore(record) {
    const homeRank = rankValue(record, 'home');
    const awayRank = rankValue(record, 'away');
    if (!homeRank || !awayRank) return 0;
    const raw = clamp((awayRank - homeRank) / 15, -1, 1);
    const side = normalizePickSide(record);
    return side === 'AWAY' ? -raw : side === 'DRAW' ? 0 : raw;
  }

  function oddsZone(odds) {
    if (!odds || odds <= 0) return {key:'unknown', label:'N/A'};
    if (odds <= 1.80) return {key:'favorite', label:'1.20–1.80'};
    if (odds < 2.00) return {key:'bridge', label:'1.81–1.99'};
    return {key:'value', label:'2.00+'};
  }

  function impliedProbability(odds) {
    return odds > 0 ? clamp(1 / odds, 0.02, 0.98) : null;
  }

  function outcomeValue(outcome) {
    const value = String(outcome || '').toLowerCase();
    if (['correct','win','won'].includes(value)) return 1;
    if (['incorrect','loss','lost'].includes(value)) return 0;
    return null;
  }

  function snapshotFromRecord(record, existing = {}) {
    const odds = numberOrNull(record.odds ?? record.lockedOdds ?? record.locked_odds);
    const confidenceRaw = numberOrNull(record.confidence);
    const baseline = clamp((confidenceRaw || 50) / 100, 0.05, 0.95);
    const market = impliedProbability(odds);
    const homeRank = rankValue(record, 'home');
    const awayRank = rankValue(record, 'away');
    return {
      ...existing,
      fixtureId: String(record.fixtureId ?? record.id ?? existing.fixtureId ?? `${record.home}-${record.away}-${record.kickoffUtc}`),
      providerFixtureId: record.providerFixtureId ?? existing.providerFixtureId ?? null,
      datasetId: record.datasetId ?? existing.datasetId ?? null,
      pickDate: record.pickDate ?? record.date ?? existing.pickDate ?? null,
      kickoffUtc: record.kickoffUtc ?? record.kickoff_utc ?? existing.kickoffUtc ?? null,
      league: record.league ?? existing.league ?? 'Unknown league',
      home: record.home ?? record.homeTeam ?? existing.home ?? 'Home',
      away: record.away ?? record.awayTeam ?? existing.away ?? 'Away',
      pick: record.pickLabel ?? record.pick_label ?? record.pick ?? existing.pick ?? '—',
      pickSide: normalizePickSide(record),
      odds,
      baselineProbability: baseline,
      marketProbability: market,
      abcResult: record.abcResult ?? record.commonOpponentsResult ?? existing.abcResult ?? '—',
      homeRank,
      awayRank,
      homePoints: pointsValue(record,'home'),
      awayPoints: pointsValue(record,'away'),
      homeGD: goalDiffValue(record,'home'),
      awayGD: goalDiffValue(record,'away'),
      formEdge: formScore(record),
      outcome: record.outcome ?? existing.outcome ?? 'pending',
      status: record.status ?? existing.status ?? null,
      sourceUpdatedAt: record.updatedAt ?? record.resultUpdatedAt ?? new Date().toISOString(),
      firstSeenAt: existing.firstSeenAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
  }

  function featureVector(snapshot) {
    const market = snapshot.marketProbability ?? 0.5;
    const baseline = snapshot.baselineProbability ?? 0.5;
    return {
      abc: abcScore(snapshot.abcResult),
      standing: standingScore(snapshot),
      favorite: snapshot.odds && snapshot.odds <= 1.80 ? 1 : 0,
      highOdds: snapshot.odds && snapshot.odds >= 2 ? 1 : 0,
      marketGap: clamp((baseline - market) * 4, -1, 1),
      form: clamp(Number(snapshot.formEdge || 0), -1, 1)
    };
  }

  function correctionScore(features, weights) {
    return FEATURE_NAMES.reduce((sum, name) => sum + Number(features[name] || 0) * Number(weights[name] || 0), 0);
  }

  function predict(snapshot, state) {
    const base = clamp(snapshot.baselineProbability || 0.5, 0.05, 0.95);
    const features = featureVector(snapshot);
    const correction = correctionScore(features, state.weights);
    const learned = sigmoid(logit(base) + correction);
    const sampleTrust = clamp(state.trainingSamples / 80, 0, 0.7);
    const probability = base * (1 - sampleTrust) + learned * sampleTrust;
    const market = snapshot.marketProbability;
    const gap = market === null ? null : probability - market;
    return {probability, gap, features, correction};
  }

  function addLog(state, title, detail, delta = '') {
    state.logs.unshift({id:`${Date.now()}-${Math.random()}`,at:new Date().toISOString(),title,detail,delta});
    state.logs = state.logs.slice(0, 80);
  }

  function trainNewSettled(state) {
    const trained = new Set(state.trainedIds);
    const candidates = Object.values(state.snapshots)
      .filter(snapshot => outcomeValue(snapshot.outcome) !== null && !trained.has(snapshot.fixtureId))
      .sort((a,b) => new Date(a.kickoffUtc || a.firstSeenAt) - new Date(b.kickoffUtc || b.firstSeenAt));

    candidates.forEach(snapshot => {
      const target = outcomeValue(snapshot.outcome);
      const features = featureVector(snapshot);
      const before = predict(snapshot, state).probability;
      const error = target - before;

      FEATURE_NAMES.forEach(name => {
        const gradient = error * Number(features[name] || 0);
        state.weights[name] = clamp(Number(state.weights[name] || 0) + LEARNING_RATE * gradient, -1.5, 1.5);
      });

      state.trainingSamples += 1;
      state.trainedIds.push(snapshot.fixtureId);
      trained.add(snapshot.fixtureId);
      const zone = oddsZone(snapshot.odds).label;
      addLog(
        state,
        `${snapshot.home} vs ${snapshot.away}`,
        `${target ? 'Correct' : 'Incorrect'} result learned · Odds ${snapshot.odds ? snapshot.odds.toFixed(2) : 'N/A'} · Zone ${zone} · A–B–C score ${features.abc >= 0 ? '+' : ''}${features.abc} · table score ${features.standing >= 0 ? '+' : ''}${features.standing.toFixed(2)}`,
        `error ${error >= 0 ? '+' : ''}${(error * 100).toFixed(1)}pp`
      );
    });

    return candidates.length;
  }

  function mergeSourceIntoAI(state, source) {
    source.records.forEach(record => {
      const fixtureId = String(record.fixtureId ?? record.id ?? `${record.home}-${record.away}-${record.kickoffUtc}`);
      state.snapshots[fixtureId] = snapshotFromRecord(record, state.snapshots[fixtureId]);
    });
    return source.records.length;
  }

  function flagFor(snapshot, prediction) {
    const gap = prediction.gap;
    const zone = oddsZone(snapshot.odds).key;
    const abc = prediction.features.abc;
    const standing = prediction.features.standing;
    if (gap === null) return {text:'WAITING ODDS', cls:'neutral'};
    if (zone === 'value') {
      if (gap >= .05 && (abc > 0 || standing > .15)) return {text:'VALUE REVERSAL', cls:'value'};
      if (gap >= .05) return {text:'VALUE WATCH', cls:'value'};
      return {text:'NO EDGE', cls:'neutral'};
    }
    if (zone === 'favorite') {
      if (gap >= .025 && abc >= 0 && standing >= -.05) return {text:'FAVORITE VALID', cls:'favorite'};
      if (gap < -.025 || abc < 0 || standing < -.2) return {text:'FAVORITE CAUTION', cls:'caution'};
      return {text:'FAVORITE WATCH', cls:'neutral'};
    }
    if (Math.abs(gap) >= .05) return {text:'BRIDGE WATCH', cls:'neutral'};
    return {text:'NEUTRAL', cls:'neutral'};
  }

  function formatPct(value, digits = 1) {
    return value === null || value === undefined || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`;
  }

  function formatGap(value) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    const pp = value * 100;
    return `${pp >= 0 ? '+' : ''}${pp.toFixed(1)}pp`;
  }

  function rankText(snapshot) {
    if (!snapshot.homeRank || !snapshot.awayRank) return '—';
    return `#${snapshot.homeRank} / #${snapshot.awayRank}`;
  }

  function renderWatchlist(state, sourceFound) {
    const body = $('#watchlistBody');
    const snapshots = Object.values(state.snapshots)
      .sort((a,b) => new Date(b.kickoffUtc || b.firstSeenAt) - new Date(a.kickoffUtc || a.firstSeenAt));

    if (!snapshots.length) {
      body.innerHTML = `<tr><td colspan="9" class="empty">${sourceFound ? 'No published Test predictions are available yet.' : 'Open the Test prediction page on this same device/browser first, then refresh Car 4.'}</td></tr>`;
      return;
    }

    body.innerHTML = snapshots.map(snapshot => {
      const prediction = predict(snapshot, state);
      const zone = oddsZone(snapshot.odds);
      const flag = flagFor(snapshot, prediction);
      const abc = snapshot.abcResult && snapshot.abcResult !== '—' ? snapshot.abcResult : 'No A–B–C snapshot';
      const market = snapshot.marketProbability;
      return `
        <tr>
          <td class="match-cell"><b>${esc(snapshot.home)} vs ${esc(snapshot.away)}</b><span>${esc(snapshot.league)} · ${esc(snapshot.pick)}</span></td>
          <td class="number">${snapshot.odds ? snapshot.odds.toFixed(2) : 'N/A'}</td>
          <td>${esc(zone.label)}</td>
          <td class="number">${formatPct(market)}</td>
          <td class="number">${formatPct(prediction.probability)}</td>
          <td class="number ${prediction.gap !== null && prediction.gap >= 0 ? 'gap-pos' : 'gap-neg'}">${formatGap(prediction.gap)}</td>
          <td title="${esc(abc)}">${prediction.features.abc > 0 ? 'POSITIVE' : prediction.features.abc < 0 ? 'NEGATIVE' : 'LIMITED'}</td>
          <td>${esc(rankText(snapshot))}</td>
          <td><span class="flag ${flag.cls}">${esc(flag.text)}</span></td>
        </tr>`;
    }).join('');
  }

  function zoneStats(state, zoneKey) {
    const settled = Object.values(state.snapshots).filter(snapshot => oddsZone(snapshot.odds).key === zoneKey && outcomeValue(snapshot.outcome) !== null);
    let wins = 0;
    let losses = 0;
    let simulated = 0;
    settled.forEach(snapshot => {
      const result = outcomeValue(snapshot.outcome);
      if (result === 1) {
        wins += 1;
        simulated += snapshot.odds ? snapshot.odds - 1 : 0;
      } else if (result === 0) {
        losses += 1;
        simulated -= 1;
      }
    });
    const total = wins + losses;
    return {total,wins,losses,winRate:total ? wins / total : null,simulatedYield:total ? simulated / total : null};
  }

  function renderPerformance(state) {
    const zones = [
      {key:'favorite',label:'1.20–1.80',name:'Favorite'},
      {key:'bridge',label:'1.81–1.99',name:'Bridge'},
      {key:'value',label:'2.00+',name:'Value'}
    ];
    $('#zonePerformance').innerHTML = zones.map(zone => {
      const stats = zoneStats(state, zone.key);
      return `<div class="performance-card">
        <small>${zone.label} · ${zone.name}</small>
        <b>${stats.total ? `${stats.wins}W / ${stats.losses}L` : 'NO DATA'}</b>
        <div class="performance-line">
          <div><span>Win rate</span><b>${stats.winRate === null ? '—' : formatPct(stats.winRate)}</b></div>
          <div><span>Sim. yield</span><b class="${stats.simulatedYield !== null && stats.simulatedYield >= 0 ? 'gap-pos' : 'gap-neg'}">${stats.simulatedYield === null ? '—' : formatPct(stats.simulatedYield)}</b></div>
        </div>
      </div>`;
    }).join('');
  }

  function renderStandings(state) {
    const list = $('#standingsList');
    const snapshots = Object.values(state.snapshots)
      .filter(snapshot => snapshot.homeRank || snapshot.awayRank)
      .sort((a,b) => new Date(b.kickoffUtc || b.firstSeenAt) - new Date(a.kickoffUtc || a.firstSeenAt));
    if (!snapshots.length) {
      list.innerHTML = '<div class="empty">Rank fields are not present in the current Test snapshots yet. Car 4 is ready to use them automatically when homeRank / awayRank (and optional points / GD) arrive.</div>';
      return;
    }
    list.innerHTML = snapshots.slice(0,12).map(snapshot => `
      <div class="standing-item">
        <div><b>${esc(snapshot.home)} vs ${esc(snapshot.away)}</b><span>${esc(snapshot.league)} · Pick: ${esc(snapshot.pick)}</span></div>
        <div class="rank-pair">
          <div class="rank"><strong>${snapshot.homeRank ? `#${snapshot.homeRank}` : '—'}</strong>HOME</div>
          <div class="rank"><strong>${snapshot.awayRank ? `#${snapshot.awayRank}` : '—'}</strong>AWAY</div>
        </div>
      </div>`).join('');
  }

  function renderLogs(state) {
    const log = $('#learningLog');
    if (!state.logs.length) {
      log.innerHTML = '<div class="empty">No settled result has trained the model yet. Shadow snapshots can accumulate now; learning starts only after a real result is settled.</div>';
      return;
    }
    log.innerHTML = state.logs.slice(0,20).map(item => `
      <div class="log-item">
        <div class="log-time">${esc(new Date(item.at).toLocaleString())}</div>
        <div class="log-copy"><b>${esc(item.title)}</b><span>${esc(item.detail)}</span></div>
        <div class="log-delta">${esc(item.delta)}</div>
      </div>`).join('');
  }

  function renderSummary(state, source) {
    const snapshots = Object.values(state.snapshots);
    const settled = snapshots.filter(snapshot => outcomeValue(snapshot.outcome) !== null);
    const gaps = snapshots.map(snapshot => predict(snapshot,state).gap).filter(value => value !== null && Number.isFinite(value));
    const avgGap = gaps.length ? gaps.reduce((a,b) => a+b,0) / gaps.length : null;

    $('#observedCount').textContent = snapshots.length;
    $('#settledCount').textContent = settled.length;
    $('#avgGap').textContent = formatGap(avgGap);
    $('#weightBadge').textContent = `${state.trainingSamples} SAMPLE${state.trainingSamples === 1 ? '' : 'S'}`;

    let modelState = 'COLD';
    let note = 'waiting for results';
    if (state.trainingSamples >= 5) { modelState = 'WARMING'; note = 'early calibration'; }
    if (state.trainingSamples >= 30) { modelState = 'LEARNING'; note = 'usable shadow sample'; }
    if (state.trainingSamples >= 100) { modelState = 'MATURE'; note = 'review for validation'; }
    $('#modelState').textContent = modelState;
    $('#modelStateNote').textContent = note;

    const sourceTag = $('#sourceStatus');
    sourceTag.textContent = source.found ? `${source.records.length} SOURCE MATCH${source.records.length === 1 ? '' : 'ES'}` : 'SOURCE NOT FOUND';
    sourceTag.classList.toggle('warn', !source.found);
    sourceTag.classList.toggle('ok', source.found);

    $('#lastSync').textContent = source.found
      ? `Last shadow scan ${new Date().toLocaleTimeString()} · dataset ${source.datasetId || 'local draft'}`
      : `No Test localStorage source found on this browser · ${new Date().toLocaleTimeString()}`;
  }

  function renderAll(state, source) {
    renderSummary(state, source);
    renderWatchlist(state, source.found);
    renderPerformance(state);
    renderStandings(state);
    renderLogs(state);
  }

  function shadowScan() {
    const source = readSource();
    const state = loadAIState();
    const observedNow = mergeSourceIntoAI(state, source);
    const learnedNow = trainNewSettled(state);
    if (source.found && observedNow) {
      addLog(state, 'Shadow scan', `Observed ${observedNow} published prediction${observedNow === 1 ? '' : 's'} from the Test source. Source was read only.`, learnedNow ? `${learnedNow} trained` : '0 trained');
    }
    saveAIState(state);
    renderAll(state, source);
  }

  function resetCar4() {
    const okay = window.confirm('Reset only Car 4 AI snapshots, weights and learning log? Cars 1–3 will not be touched.');
    if (!okay) return;
    localStorage.removeItem(AI_KEY);
    const source = readSource();
    const state = emptyState();
    addLog(state, 'Car 4 reset', 'AI Learning Lab storage was reset. No Production/Test storage was changed.', 'isolated reset');
    saveAIState(state);
    renderAll(state, source);
  }

  function tickClock() {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL';
    $('#localClock').textContent = `${zone.toUpperCase()} · ${new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()).replace(',','')}`;
  }

  $('#refreshBtn')?.addEventListener('click', shadowScan);
  $('#resetBtn')?.addEventListener('click', resetCar4);
  window.addEventListener('storage', event => {
    if (event.key === SOURCE_KEY || event.key === AI_KEY) shadowScan();
  });

  tickClock();
  window.setInterval(tickClock, 1000);
  shadowScan();
})();
