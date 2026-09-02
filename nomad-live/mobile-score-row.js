(() => {
  'use strict';

  const MQ = window.matchMedia('(max-width:520px)');
  const SCORE_RE = /^(\d+)\s*[–-]\s*(\d+)$/;

  const readScore = value => {
    if (!value) return null;

    const oldHome = value.querySelector?.('.mobile-score-home')?.textContent?.trim();
    const oldAway = value.querySelector?.('.mobile-score-away')?.textContent?.trim();
    if (/^\d+$/.test(oldHome || '') && /^\d+$/.test(oldAway || '')) {
      return {home:oldHome, away:oldAway, plain:`${oldHome} – ${oldAway}`};
    }

    const raw = String(value.dataset.mobileScorePlain || value.textContent || '').trim();
    const match = raw.match(SCORE_RE);
    if (!match) return null;
    return {home:match[1], away:match[2], plain:`${match[1]} – ${match[2]}`};
  };

  const normalizeLegacySource = (value, parsed) => {
    if (!value || !parsed) return;
    if (value.dataset.mobileScoreReady === '1' || value.classList.contains('mobile-score-pair')) {
      value.textContent = parsed.plain;
      value.classList.remove('mobile-score-pair');
      delete value.dataset.mobileScoreReady;
      delete value.dataset.mobileScorePlain;
    }
  };

  const ensureMirroredScore = (line, sideClass, text) => {
    if (!line) return;
    let node = line.querySelector(':scope > .mobile-team-score');
    if (!node) {
      node = document.createElement('span');
      node.className = `mobile-team-score ${sideClass}`;
      node.setAttribute('aria-hidden', 'true');
      line.appendChild(node);
    }
    if (node.textContent !== text) node.textContent = text;
    line.classList.add('mobile-team-score-ready');
  };

  const removeMirroredScore = line => {
    if (!line) return;
    line.querySelector(':scope > .mobile-team-score')?.remove();
    line.classList.remove('mobile-team-score-ready');
  };

  const restoreRow = row => {
    const score = row?.querySelector(':scope > summary .score');
    const value = score?.querySelector('.score-live-value');
    const parsed = readScore(value);
    normalizeLegacySource(value, parsed);
    value?.classList.remove('mobile-score-source-hidden');
    score?.classList.remove('mobile-score-layout-ready');

    const teams = row?.querySelector(':scope > summary .teams');
    removeMirroredScore(teams?.querySelector(':scope > .mobile-team-home'));
    removeMirroredScore(teams?.querySelector(':scope > .mobile-team-away'));
  };

  const syncRow = row => {
    if (!row) return;
    if (!MQ.matches) {
      restoreRow(row);
      return;
    }

    const teams = row.querySelector(':scope > summary .teams.mobile-team-shirts-ready');
    const homeLine = teams?.querySelector(':scope > .mobile-team-home');
    const awayLine = teams?.querySelector(':scope > .mobile-team-away');
    const score = row.querySelector(':scope > summary .score');
    const value = score?.querySelector('.score-live-value');
    if (!teams || !homeLine || !awayLine || !score || !value) return;

    const parsed = readScore(value);
    if (!parsed) return;

    normalizeLegacySource(value, parsed);
    ensureMirroredScore(homeLine, 'mobile-team-score-home', parsed.home);
    ensureMirroredScore(awayLine, 'mobile-team-score-away', parsed.away);

    /* Keep the real live score node in place for live-score-status.js.
       It is only hidden visually on mobile; the two team-row scores above mirror it. */
    value.classList.add('mobile-score-source-hidden');
    score.classList.add('mobile-score-layout-ready');
  };

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
    if (list) new MutationObserver(queue).observe(list, {childList:true, subtree:true, characterData:true});
    if (typeof MQ.addEventListener === 'function') MQ.addEventListener('change', queue);
    else if (typeof MQ.addListener === 'function') MQ.addListener(queue);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
