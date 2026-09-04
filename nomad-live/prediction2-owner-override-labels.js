(() => {
  'use strict';

  const STYLE_ID = 'prediction2-today-only-style';

  function enforceTodayOnly() {
    // Retired live-score artifacts must never survive on Prediction2.
    document.querySelector('script[data-king-live-score-adapter]')?.remove();
    document.getElementById('king-live-score-style')?.remove();
    document.querySelectorAll('.king-live-score-inline').forEach(node => node.remove());

    // Retired preview / analysis surfaces.
    document.querySelector('.king-preview-grid')?.remove();
    document.getElementById('kingAnalysisDrawer')?.remove();

    // Prediction2 is a standalone KING surface. Do not route its navigation into
    // the unrelated NOMAD LIVE result ledger, which legitimately contains prior
    // live-signal records such as yesterday's settled matches.
    document.querySelectorAll('body[data-page="prediction2"] a[href^="statistics.html"]').forEach(node => node.remove());

    // Prediction2 public surface is TODAY only. Keep legacy nodes available to old
    // inline code so it cannot crash, but never expose settled/history data here.
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        body[data-page="prediction2"] .king-scorebar,
        body[data-page="prediction2"] .king-tabs button[data-tab="history"],
        body[data-page="prediction2"] .king-tabs button[data-tab="daily"],
        body[data-page="prediction2"] .king-panel[data-panel="history"],
        body[data-page="prediction2"] .king-panel[data-panel="daily"] {
          display:none!important;
        }
      `;
      document.head.appendChild(style);
    }

    const todayTab = document.querySelector('.king-tabs button[data-tab="today"]');
    const todayPanel = document.querySelector('.king-panel[data-panel="today"]');
    document.querySelectorAll('.king-tabs button').forEach(button => {
      button.classList.toggle('active', button === todayTab);
      if (button !== todayTab) button.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.king-panel').forEach(panel => {
      panel.classList.toggle('active', panel === todayPanel);
      if (panel !== todayPanel) panel.setAttribute('aria-hidden', 'true');
    });

    // Purge rendered legacy result data from this page only. The KING feed/history
    // source remains untouched and can still be used elsewhere by the engine.
    const historyRows = document.getElementById('historyRows');
    const dailyRows = document.getElementById('dailyRows');
    if (historyRows?.childElementCount) historyRows.replaceChildren();
    if (dailyRows?.childElementCount) dailyRows.replaceChildren();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enforceTodayOnly, {once: true});
  } else {
    enforceTodayOnly();
  }

  // Old inline renderers may populate history after their fetch resolves. Remove
  // those rows immediately if that happens, without touching TODAY rows.
  const observer = new MutationObserver(enforceTodayOnly);
  observer.observe(document.documentElement, {subtree: true, childList: true});
  window.addEventListener('pagehide', () => observer.disconnect(), {once: true});
})();
