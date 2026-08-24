(() => {
  'use strict';

  if (!document.body.classList.contains('public-live-signals')) return;

  const PUBLIC_ROOTS = [
    '#signalHero',
    '#candidateList',
    '#fixtureList',
    '#ruleRows',
    '#panel-system',
    '#historyList',
    '#historyNote',
    '#freshnessLabel',
    '#historyFreshness',
    '#headerStatus',
    '#engineStatus',
    '#runtimeEngine',
    '#runtimeScan',
  ];

  const INTERNAL_LABEL = /(?:^|\b)(?:source|provider|endpoint|parser|fallback|feed|worker|scraper|route|api[- ]?football|odds[- ]?api|the odds api|totalcorner|nowgoal|goaloo|s[1-5])(?:\b|$)/i;
  const BOOKMAKER = '(Bet365|Pinnacle|SBOBET|M88|188BET|12BET|1xBet)';

  function cleanPublicText(value) {
    let text = String(value ?? '');

    // Preserve bookmaker identity while removing the transport/provider wrapper.
    text = text
      .replace(new RegExp(`${BOOKMAKER}\\s*\\((?:Goaloo|Nowgoal)\\)`, 'gi'), '$1')
      .replace(new RegExp(`(?:Goaloo|Nowgoal)\\s*[·|/,:-]+\\s*${BOOKMAKER}`, 'gi'), '$1')
      .replace(new RegExp(`${BOOKMAKER}\\s*[·|/,:-]+\\s*(?:Goaloo|Nowgoal)`, 'gi'), '$1')
      .replace(/Goaloo\s+current\s+fetch/gi, 'Current price')
      .replace(/Nowgoal\s+current\s+fetch/gi, 'Current price')
      .replace(/ENGINE\s*3/gi, 'LIVE SYSTEM')
      .replace(/ENGINE ONLINE/gi, 'SYSTEM ONLINE')
      .replace(/WAITING_API/gi, 'WAITING')
      .replace(/source ledger/gi, 'recorded history')
      .replace(/source records?/gi, match => match.toLowerCase().endsWith('s') ? 'records' : 'record');

    return text;
  }

  function sanitizeTextNodes(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const cleaned = cleanPublicText(node.nodeValue);
      if (cleaned !== node.nodeValue) node.nodeValue = cleaned;
    }
  }

  function maskTechnicalRows() {
    document.querySelectorAll('#ruleRows .status-row, #panel-system .status-row').forEach(row => {
      const label = row.querySelector('span')?.textContent?.trim() || '';
      if (INTERNAL_LABEL.test(label)) {
        row.classList.add('public-hidden-internal');
        row.setAttribute('aria-hidden', 'true');
      } else {
        row.classList.remove('public-hidden-internal');
        row.removeAttribute('aria-hidden');
      }
    });
  }

  function normalizePublicStatuses() {
    const headline = document.getElementById('signalHeadline');
    if (headline && /connecting to live system/i.test(headline.textContent || '')) {
      headline.textContent = 'Connecting to live data…';
    }

    const historyNote = document.getElementById('historyNote');
    if (historyNote) historyNote.textContent = cleanPublicText(historyNote.textContent);
  }

  function sanitizePublicView() {
    for (const selector of PUBLIC_ROOTS) {
      sanitizeTextNodes(document.querySelector(selector));
    }
    maskTechnicalRows();
    normalizePublicStatuses();
  }

  let queued = false;
  function queueSanitize() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sanitizePublicView();
    });
  }

  sanitizePublicView();

  const main = document.querySelector('main');
  if (main) {
    const observer = new MutationObserver(queueSanitize);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
  }
})();
