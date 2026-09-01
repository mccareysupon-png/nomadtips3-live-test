(() => {
  'use strict';

  // Presentation-only wording for the compact/default live card.
  // Does not change feed, detector, signal, price selection, CHECKS, or expanded-card logic.
  const labelFor = row => {
    if (String(row?.dataset?.signalStatus || '').toUpperCase() === 'LOCKED') return 'LOCKED SIDE';
    if (String(row?.dataset?.state || '').toUpperCase() === 'SIGNAL') return 'SIGNAL SIDE';
    return 'ON WATCH';
  };

  const decorate = row => {
    if (!row) return;
    const label = row.querySelector(':scope > summary .price-selected-name');
    if (!label) return;

    const current = String(label.textContent || '').trim();
    const sourceMatch = current.match(/(?:^|\s)·\s*(S[^·\s]+)\s*$/i);
    const sourceTag = sourceMatch ? sourceMatch[1].toUpperCase() : '';
    const base = labelFor(row);
    const wanted = sourceTag ? `${base} · ${sourceTag}` : base;

    if (current !== wanted) label.textContent = wanted;
  };

  const renderAll = () => {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(decorate);
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
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
