(() => {
  const readPercent = el => {
    const value = parseFloat(String(el?.textContent || ''));
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
  };

  const enhanceCard = card => {
    const donut = card.querySelector('.donut');
    if (!donut) return;

    const values = [...card.querySelectorAll('.legend-row strong')].map(readPercent);
    if (values.length < 3 || values.some(value => value === null)) return;

    const [home, draw] = values;
    donut.style.setProperty('--home-end', `${home}%`);
    donut.style.setProperty('--away-start', `${Math.min(100, home + draw)}%`);
    donut.classList.add('green-emphasis-ready');
  };

  const enhanceAll = () => {
    document.querySelectorAll('.prediction-card').forEach(enhanceCard);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('predictionList');
    if (!root) return;

    enhanceAll();
    const observer = new MutationObserver(enhanceAll);
    observer.observe(root, { childList: true, subtree: true });
  });
})();
