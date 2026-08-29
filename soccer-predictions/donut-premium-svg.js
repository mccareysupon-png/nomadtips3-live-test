(() => {
  const parsePct = el => {
    const value = Number.parseFloat(String(el?.textContent || '').replace('%',''));
    return Number.isFinite(value) ? value : null;
  };

  const arc = (key, value, offset, selectedKey, gradientId) => {
    const selected = key === selectedKey;
    const klass = selected ? 'selected' : key === 'draw' ? 'neutral' : 'opponent';
    const radius = selected ? 46 : 45;
    const width = selected ? 12.24 : 12;
    const dash = `${value} ${100 - value}`;
    const dashOffset = -offset;
    const common = `cx="60" cy="60" r="${radius}" pathLength="100" stroke-dasharray="${dash}" stroke-dashoffset="${dashOffset}" transform="rotate(-90 60 60)"`;

    if (!selected) {
      return `<circle class="donut-arc donut-arc-${klass}" ${common}></circle>`;
    }

    return `
      <circle class="donut-arc donut-arc-selected-shadow" ${common}></circle>
      <circle class="donut-arc donut-arc-selected" ${common} stroke="url(#${gradientId})" style="stroke-width:${width}"></circle>
      <circle class="donut-arc donut-arc-selected-highlight" ${common}></circle>`;
  };

  const enhanceDonut = donut => {
    if (!donut || donut.dataset.premiumSvg === '1') return;

    const card = donut.closest('.prediction-card');
    const rows = card?.querySelectorAll('.legend-row');
    if (!card || !rows || rows.length < 3) return;

    const home = parsePct(rows[0].querySelector('strong'));
    const draw = parsePct(rows[1].querySelector('strong'));
    const away = parsePct(rows[2].querySelector('strong'));
    if (![home, draw, away].every(Number.isFinite)) return;

    const selectedKey = card.classList.contains('selected-away') ? 'away' : 'home';
    const uid = `donut-${Math.random().toString(36).slice(2, 9)}`;
    const gradientId = `${uid}-selected-green`;
    const segments = [
      {key:'home', value:home, offset:0},
      {key:'draw', value:draw, offset:home},
      {key:'away', value:away, offset:home + draw}
    ];

    const svg = `
      <svg class="donut-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#c7ffd0"></stop>
            <stop offset="22%" stop-color="#aef4b9"></stop>
            <stop offset="52%" stop-color="#8be19b"></stop>
            <stop offset="78%" stop-color="#72c483"></stop>
            <stop offset="100%" stop-color="#5ea96f"></stop>
          </linearGradient>
        </defs>
        ${segments.map(s => arc(s.key, s.value, s.offset, selectedKey, gradientId)).join('')}
      </svg>`;

    donut.style.background = 'none';
    donut.insertAdjacentHTML('afterbegin', svg);
    donut.classList.add('donut-svg-ready');
    donut.dataset.premiumSvg = '1';
  };

  const enhanceAll = root => {
    (root || document).querySelectorAll('.donut').forEach(enhanceDonut);
  };

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('predictionList');
    if (!root) return;

    enhanceAll(root);
    const observer = new MutationObserver(() => enhanceAll(root));
    observer.observe(root, {childList:true, subtree:true});
  });
})();
