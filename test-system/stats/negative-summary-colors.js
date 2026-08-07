(() => {
  'use strict';

  const HOST_ID = 'statsSummary';
  const NEGATIVE_LABEL = /^(Incorrect|Loss\s*\/\s*Half Loss)$/i;
  const NEGATIVE_NOTE = /^(\d+)\s+(Incorrect|Loss\s*\/\s*Half Loss)(.*)$/i;

  function installStyles() {
    if (document.getElementById('nomad-negative-summary-colors')) return;
    const style = document.createElement('style');
    style.id = 'nomad-negative-summary-colors';
    style.textContent = `
      #statsSummary .summary-negative-result{
        color:var(--stats-red,#ff8e96)!important;
        font-weight:950!important;
      }
      #statsSummary .metric > span > .summary-negative-result{
        display:inline!important;
        margin-top:0!important;
      }
      #statsSummary .metric[data-negative-result-card="true"] > small,
      #statsSummary .metric[data-negative-result-card="true"] > b{
        color:var(--stats-red,#ff8e96)!important;
      }
    `;
    document.head.appendChild(style);
  }

  function decorateMetric(metric) {
    const label = metric.querySelector(':scope > small');
    const value = metric.querySelector(':scope > b');
    const note = metric.querySelector(':scope > span');

    if (label && NEGATIVE_LABEL.test(label.textContent.trim())) {
      metric.dataset.negativeResultCard = 'true';
      if (value) value.classList.add('summary-negative-result');
    } else {
      delete metric.dataset.negativeResultCard;
    }

    if (!note || note.querySelector('.summary-negative-result')) return;
    const text = note.textContent.trim();
    const match = text.match(NEGATIVE_NOTE);
    if (!match) return;

    const negative = document.createElement('span');
    negative.className = 'summary-negative-result';
    negative.textContent = `${match[1]} ${match[2]}`;

    note.textContent = '';
    note.appendChild(negative);
    if (match[3]) note.appendChild(document.createTextNode(match[3]));
  }

  function decorate() {
    const host = document.getElementById(HOST_ID);
    if (!host) return;
    host.querySelectorAll('.metric').forEach(decorateMetric);
  }

  installStyles();
  decorate();

  const host = document.getElementById(HOST_ID);
  if (host) {
    const observer = new MutationObserver(decorate);
    observer.observe(host, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('pageshow', decorate);
  window.addEventListener('nomad-results-updated', decorate);
  window.addEventListener('nomad-official-finals-updated', decorate);
})();
