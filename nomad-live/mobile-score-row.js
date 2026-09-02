(() => {
  'use strict';

  const MQ = window.matchMedia('(max-width:520px)');
  const SCORE_RE = /^(\d+)\s*[–-]\s*(\d+)$/;

  const splitScore = row => {
    if (!MQ.matches || !row) return;
    const score = row.querySelector(':scope > summary .score');
    const value = score?.querySelector('.score-live-value');
    if (!score || !value || value.dataset.mobileScoreReady === '1') return;

    const raw = String(value.dataset.mobileScorePlain || value.textContent || '').trim();
    const match = raw.match(SCORE_RE);
    if (!match) return;

    value.dataset.mobileScorePlain = raw;
    value.dataset.mobileScoreReady = '1';
    value.classList.add('mobile-score-pair');
    value.innerHTML = `<span class="mobile-score-home">${match[1]}</span><span class="mobile-score-away">${match[2]}</span>`;
    score.classList.add('mobile-score-layout-ready');
  };

  const restoreScore = row => {
    const score = row?.querySelector(':scope > summary .score');
    const value = score?.querySelector('.score-live-value');
    if (!score || !value || value.dataset.mobileScoreReady !== '1') return;

    const raw = value.dataset.mobileScorePlain || '';
    value.textContent = raw;
    value.classList.remove('mobile-score-pair');
    delete value.dataset.mobileScoreReady;
    delete value.dataset.mobileScorePlain;
    score.classList.remove('mobile-score-layout-ready');
  };

  const applyRow = row => {
    if (MQ.matches) splitScore(row);
    else restoreScore(row);
  };

  const renderAll = () => {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(applyRow);
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
    if (list) new MutationObserver(queue).observe(list, {childList:true, subtree:true, characterData:true});
    if (typeof MQ.addEventListener === 'function') MQ.addEventListener('change', queue);
    else if (typeof MQ.addListener === 'function') MQ.addListener(queue);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
