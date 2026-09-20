/* BALL46_STAT_WORKSPACE_V2
   Phase 2: mounts desktop sidebar shell only.
   No routing, fetch, API, odds, engine or settlement behavior. */
(() => {
  'use strict';

  function mount() {
    const body = document.body;
    if (!body || !body.classList.contains('ball46-product-statistics')) return;

    const main = document.querySelector('main.next-shell');
    if (!main || main.querySelector(':scope > .b46-stat-sidebar-v2')) return;

    const head = main.querySelector(':scope > .next-page-head');
    if (!head) return;

    const aside = document.createElement('aside');
    aside.className = 'b46-stat-sidebar-v2';
    aside.setAttribute('aria-label', 'Statistics workspace');
    aside.innerHTML = `
      <div class="b46-stat-sidebar-v2__head">
        <span class="b46-stat-sidebar-v2__eyebrow">PERFORMANCE</span>
        <strong class="b46-stat-sidebar-v2__title">Statistics Center</strong>
      </div>
      <div class="b46-stat-sidebar-v2__list" role="list">
        <button type="button" class="b46-stat-nav-card-v2 is-active" data-b46-view="overview" aria-current="page" aria-disabled="true">
          <span class="b46-stat-nav-card-v2__icon" aria-hidden="true">▦</span>
          <span class="b46-stat-nav-card-v2__copy"><span class="b46-stat-nav-card-v2__label">OVERVIEW</span><span class="b46-stat-nav-card-v2__meta">Overall performance</span></span>
        </button>
        <button type="button" class="b46-stat-nav-card-v2" data-b46-view="markets" aria-disabled="true">
          <span class="b46-stat-nav-card-v2__icon" aria-hidden="true">↗</span>
          <span class="b46-stat-nav-card-v2__copy"><span class="b46-stat-nav-card-v2__label">MARKETS</span><span class="b46-stat-nav-card-v2__meta">AH · O/U · 1X2</span></span>
        </button>
        <button type="button" class="b46-stat-nav-card-v2" data-b46-view="engine" aria-disabled="true">
          <span class="b46-stat-nav-card-v2__icon" aria-hidden="true">◇</span>
          <span class="b46-stat-nav-card-v2__copy"><span class="b46-stat-nav-card-v2__label">ENGINE</span><span class="b46-stat-nav-card-v2__meta">Analysis performance</span></span>
        </button>
        <button type="button" class="b46-stat-nav-card-v2" data-b46-view="history" aria-disabled="true">
          <span class="b46-stat-nav-card-v2__icon" aria-hidden="true">◷</span>
          <span class="b46-stat-nav-card-v2__copy"><span class="b46-stat-nav-card-v2__label">HISTORY</span><span class="b46-stat-nav-card-v2__meta">Live · Settled</span></span>
        </button>
      </div>`;

    aside.addEventListener('click', (event) => {
      const button = event.target.closest('[data-b46-view]');
      if (button) event.preventDefault();
    });

    head.insertAdjacentElement('afterend', aside);
    document.documentElement.classList.add('b46-stat-workspace-v2-mounted');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
})();
