(() => {
  'use strict';

  // Load the isolated display-only KING live-score adapter without rewriting prediction2.html.
  if (!document.querySelector('script[data-king-live-score-adapter]')) {
    const script = document.createElement('script');
    script.src = 'prediction2-live-score.js?v=20260904-display-v1';
    script.defer = true;
    script.dataset.kingLiveScoreAdapter = '1';
    document.head.appendChild(script);
  }

  // Prediction2 now uses the latest TODAY auto-feed rows as the single public pick surface.
  // Quarantine the retired preview rail / drawer so the legacy sample picks cannot reappear
  // or conflict with the current TODAY count, feed state, history, and verified metrics.
  document.querySelector('.king-preview-grid')?.remove();
  document.getElementById('kingAnalysisDrawer')?.remove();

  const drawer = document.getElementById('kingAnalysisDrawer');
  if (!drawer) return;

  const gateMarkup = (label, value, pass = true) =>
    `<div class="king-gate"><span>${label}</span><em class="${pass ? 'pass' : 'pending'}">${value}</em></div>`;

  function syncOwnerOverrideLabels() {
    const badge = drawer.querySelector('.king-analysis-sample');
    if (!badge || !badge.textContent.includes('OWNER ONE-DAY OVERRIDE')) return;

    const why = [...drawer.querySelectorAll('.king-analysis-why > span')]
      .find(node => node.textContent.trim().startsWith('PERFORMANCE'));
    if (why) why.innerHTML = 'THRESHOLD <b class="positive">OWNER RULES</b>';

    const gateBlock = [...drawer.querySelectorAll('.king-analysis-block')]
      .find(block => block.querySelector(':scope > span')?.textContent.trim() === 'PERFORMANCE GATE');
    if (!gateBlock) return;

    const title = gateBlock.querySelector(':scope > span');
    if (title) title.textContent = 'OWNER THRESHOLD GATE';

    let list = gateBlock.querySelector('.king-gate-list');
    if (!list) {
      list = document.createElement('div');
      list.className = 'king-gate-list';
      gateBlock.appendChild(list);
    }
    list.innerHTML = [
      gateMarkup('DATA QUALITY', 'PASS'),
      gateMarkup('GOALOO 1X2', 'PASS'),
      gateMarkup('CONFIDENCE ≥40%', 'PASS'),
      gateMarkup('ODDS ≥1.88', 'PASS'),
      gateMarkup('ODDS ≤3.00', 'PASS'),
      gateMarkup('DAILY CAP', 'UNLIMITED')
    ].join('');
  }

  const observer = new MutationObserver(syncOwnerOverrideLabels);
  observer.observe(drawer, {subtree: true, childList: true, attributes: true, attributeFilter: ['class']});
  drawer.addEventListener('transitionend', syncOwnerOverrideLabels);
  syncOwnerOverrideLabels();
})();
