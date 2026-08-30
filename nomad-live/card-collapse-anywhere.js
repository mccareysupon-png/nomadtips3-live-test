(() => {
  'use strict';

  // Presentation-only interaction for expanded live cards.
  // The native <details>/<summary> behavior stays untouched: summary clicks
  // continue to open/close normally, while a click inside the expanded detail
  // area closes that card. No engine/feed/signal/odds state is modified.

  function start() {
    const list = document.querySelector('.match-list');
    if (!list) return;

    list.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      // Never interfere with the native summary toggle. Only clicks in the
      // expanded detail panel are handled here.
      const detail = target.closest('.match-detail');
      if (!detail || !list.contains(detail)) return;

      const row = detail.closest('.match-wrap[open]');
      if (!row || !list.contains(row)) return;

      row.open = false;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, {once:true});
  } else {
    start();
  }
})();
