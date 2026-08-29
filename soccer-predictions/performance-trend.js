(() => {
  const SCORE = { w: 82, d: 55, l: 28 };

  const getResults = row => [...row.querySelectorAll('.form-pill')]
    .map(el => String(el.textContent || '').trim().toLowerCase())
    .map(v => SCORE[v] ?? 50);

  const makePath = scores => {
    const xs = [8, 144, 280, 416, 552];
    const y = score => 12 + (100 - score) * 1.18;
    return scores.map((score, i) => `${i ? 'L' : 'M'} ${xs[i]} ${y(score).toFixed(1)}`).join(' ');
  };

  const enhanceCard = card => {
    if (card.querySelector('.performance-trend')) return;

    const teams = [...card.querySelectorAll('.match-title .team')].map(el => el.textContent.trim());
    const formRows = card.querySelectorAll('.mini-card .form-row');
    const pick = card.querySelector('.pick-main strong')?.textContent.trim() || '';
    const cardGrid = card.querySelector('.card-grid');
    if (teams.length < 2 || formRows.length < 2 || !cardGrid) return;

    const homeScores = getResults(formRows[0]);
    const awayScores = getResults(formRows[1]);
    if (homeScores.length !== 5 || awayScores.length !== 5) return;

    const selectedIsAway = pick.toLowerCase().startsWith(teams[1].toLowerCase());
    const selectedTeam = selectedIsAway ? teams[1] : teams[0];
    const opponentTeam = selectedIsAway ? teams[0] : teams[1];
    const selectedScores = selectedIsAway ? awayScores : homeScores;
    const opponentScores = selectedIsAway ? homeScores : awayScores;

    const selectedPath = makePath(selectedScores);
    const opponentPath = makePath(opponentScores);
    const areaPath = `${selectedPath} L 552 138 L 8 138 Z`;

    const trend = document.createElement('section');
    trend.className = 'performance-trend';
    trend.setAttribute('aria-label', `Last five match trend: ${selectedTeam} compared with ${opponentTeam}`);
    trend.innerHTML = `
      <div class="trend-head">
        <div class="trend-title-wrap">
          <h3>PERFORMANCE TREND · LAST 5</h3>
          <p>Selected team compared with the opponent across the recent result sequence.</p>
        </div>
        <span class="trend-index">RESULT INDEX</span>
      </div>
      <div class="trend-legend">
        <div class="trend-legend-item selected"><span class="trend-dot"></span><strong>${selectedTeam}</strong><span class="trend-selected-tag">Selected</span></div>
        <div class="trend-legend-item opponent"><span class="trend-dot"></span><strong>${opponentTeam}</strong></div>
      </div>
      <div class="trend-chart-shell">
        <div class="trend-y-axis" aria-hidden="true"><span>100</span><span>75</span><span>50</span><span>25</span></div>
        <div class="trend-plot">
          <svg viewBox="0 0 560 150" preserveAspectRatio="none" role="img" aria-label="Two-line recent performance trend">
            <line class="trend-grid-line" x1="0" y1="12" x2="560" y2="12"></line>
            <line class="trend-grid-line" x1="0" y1="41.5" x2="560" y2="41.5"></line>
            <line class="trend-grid-line" x1="0" y1="71" x2="560" y2="71"></line>
            <line class="trend-grid-line" x1="0" y1="100.5" x2="560" y2="100.5"></line>
            <path class="trend-fill" d="${areaPath}"></path>
            <path class="trend-line-opponent" d="${opponentPath}"></path>
            <path class="trend-line-selected" d="${selectedPath}"></path>
          </svg>
        </div>
      </div>
      <div class="trend-x-labels" aria-hidden="true"><span>Match 5</span><span>Match 4</span><span>Match 3</span><span>Match 2</span><span>Latest</span></div>
      <div class="trend-scale-note">Result index: Win 82 · Draw 55 · Loss 28</div>`;

    card.insertBefore(trend, cardGrid);
  };

  const enhanceAll = () => document.querySelectorAll('.prediction-card').forEach(enhanceCard);

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('predictionList');
    if (!root) return;
    enhanceAll();
    const observer = new MutationObserver(enhanceAll);
    observer.observe(root, { childList: true, subtree: true });
  });
})();
