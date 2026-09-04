(() => {
  'use strict';

  function cleanupPrediction2Legacy() {
    // Retired live-score artifacts must never survive on Prediction2.
    document.querySelector('script[data-king-live-score-adapter]')?.remove();
    document.getElementById('king-live-score-style')?.remove();
    document.querySelectorAll('.king-live-score-inline').forEach(node => node.remove());

    // Retired preview / static-analysis surfaces remain quarantined.
    document.querySelector('.king-preview-grid')?.remove();
    document.getElementById('kingAnalysisDrawer')?.remove();

    // Statistics V3 owns the scorebar / HISTORY / DAILY surfaces now.
    document.getElementById('prediction2-today-only-style')?.remove();
    document.getElementById('prediction2-today-only-hardlock')?.remove();
    document.querySelectorAll('.king-tabs button, .king-panel').forEach(node => {
      node.removeAttribute('aria-hidden');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanupPrediction2Legacy, {once: true});
  } else {
    cleanupPrediction2Legacy();
  }
})();
