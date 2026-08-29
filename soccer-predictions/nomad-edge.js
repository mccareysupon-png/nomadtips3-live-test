(() => {
  const parsePct = text => {
    const n = parseFloat(String(text || '').replace('%','').trim());
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  };

  const teamName = (card, away = false) => {
    const teams = card.querySelectorAll('.match-title .team');
    return teams[away ? 1 : 0]?.textContent?.trim() || (away ? 'Opponent' : 'Selected');
  };

  const upgrade = card => {
    if (card.querySelector('.nomad-edge')) return;

    const isAway = card.classList.contains('selected-away');
    const isHome = card.classList.contains('selected-home');
    if (!isAway && !isHome) return;

    const rows = [...card.querySelectorAll('.comparison-list > .compare-row')];
    if (!rows.length) return;

    let selectedTotal = 0;
    let opponentTotal = 0;
    let count = 0;

    rows.forEach(row => {
      const nums = [...row.querySelectorAll('.bar-num')].map(el => parsePct(el.textContent));
      if (nums.length < 2 || nums[0] === null || nums[1] === null) return;
      const selected = isAway ? nums[1] : nums[0];
      const opponent = isAway ? nums[0] : nums[1];
      selectedTotal += selected;
      opponentTotal += opponent;
      count++;
    });

    if (!count) return;
    const combined = selectedTotal + opponentTotal;
    if (!(combined > 0)) return;

    const selectedShare = Math.max(0, Math.min(100, (selectedTotal / combined) * 100));
    const opponentShare = 100 - selectedShare;
    const selected = teamName(card, isAway);
    const opponent = teamName(card, !isAway);
    const analysis = card.querySelector('.analysis');
    if (!analysis) return;

    const meter = document.createElement('section');
    meter.className = 'nomad-edge';
    meter.setAttribute('aria-label', `NOMAD edge composite: ${selected} ${selectedShare.toFixed(1)} percent, ${opponent} ${opponentShare.toFixed(1)} percent`);
    meter.title = `Composite of ${count} rendered comparison metrics · ${selected} ${selectedShare.toFixed(1)}% · ${opponent} ${opponentShare.toFixed(1)}%`;
    meter.innerHTML = `
      <div class="nomad-edge-head">
        <div class="nomad-edge-title"><strong>NOMAD EDGE</strong><span>${count}-METRIC COMPOSITE</span></div>
        <div class="nomad-edge-score"><strong>${selectedShare.toFixed(1)}%</strong><span>SELECTED SIDE</span></div>
      </div>
      <div class="nomad-edge-track" aria-hidden="true">
        <span class="nomad-edge-opponent"></span>
        <span class="nomad-edge-selected"></span>
        <i class="nomad-edge-mid"></i>
      </div>
      <div class="nomad-edge-labels"><span>${opponent}</span><span>50</span><span>${selected}</span></div>`;

    card.insertBefore(meter, analysis);

    requestAnimationFrame(() => {
      meter.querySelector('.nomad-edge-opponent').style.width = `${opponentShare}%`;
      meter.querySelector('.nomad-edge-selected').style.width = `${selectedShare}%`;
    });
  };

  const scan = () => document.querySelectorAll('.prediction-card').forEach(upgrade);

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('predictionList');
    if (!root) return;
    scan();
    new MutationObserver(scan).observe(root, { childList:true, subtree:true });
  });
})();
