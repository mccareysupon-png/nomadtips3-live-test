(() => {
  'use strict';

  // Prediction2 uses only the KING auto-feed as its public data source.
  // Remove any retired live-score presentation artifacts if an older cached page injected them.
  document.querySelector('script[data-king-live-score-adapter]')?.remove();
  document.getElementById('king-live-score-style')?.remove();
  document.querySelectorAll('.king-live-score-inline').forEach(node => node.remove());

  // Keep the retired preview rail / drawer isolated from the current TODAY feed surface.
  document.querySelector('.king-preview-grid')?.remove();
  document.getElementById('kingAnalysisDrawer')?.remove();
})();
