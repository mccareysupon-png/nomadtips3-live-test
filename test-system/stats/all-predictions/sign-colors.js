(() => {
  const POSITIVE_COLOR = 'var(--green)';
  const NEGATIVE_COLOR = 'var(--red)';

  function numberFromText(value) {
    const match = String(value || '').replace(/,/g, '').match(/[+-]?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  function colorSigned(element, value) {
    if (!element) return;
    const number = typeof value === 'number' ? value : numberFromText(value ?? element.textContent);
    if (!Number.isFinite(number) || number === 0) {
      element.style.removeProperty('color');
      return;
    }
    element.style.color = number > 0 ? POSITIVE_COLOR : NEGATIVE_COLOR;
  }

  function applySignColors() {
    colorSigned(document.querySelector('#profitLoss'));
    colorSigned(document.querySelector('#roi'));

    document.querySelectorAll('#marketBreakdown .market-stat').forEach(card => {
      const profitLine = [...card.querySelectorAll('span')]
        .find(element => element.textContent.trim().startsWith('Profit / Loss'));
      const percentage = card.querySelector('strong.market-odds-line');
      colorSigned(profitLine);
      colorSigned(percentage);
    });

    document.querySelectorAll('#historyRows tr').forEach(row => {
      const profitCell = row.lastElementChild;
      if (!profitCell) return;
      const value = numberFromText(profitCell.textContent);
      colorSigned(profitCell, value);
    });
  }

  const observer = new MutationObserver(applySignColors);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  applySignColors();
  window.addEventListener('storage', applySignColors);
  window.addEventListener('nomad-results-updated', applySignColors);
  window.setInterval(applySignColors, 1000);
})();
