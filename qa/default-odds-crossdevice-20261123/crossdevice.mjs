const ANIMATION = 'b46-odds-card-pulse-6x';
const marker = 'data-b46-odds-move';
const quote = `html body .match-row[data-match-id] .market-cell :is(#b46-odds-specificity, [${marker}])`;

export const crossDeviceOddsStyles = `
@keyframes ${ANIMATION} {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(.62); }
}
${quote} {
  position: relative !important;
  isolation: isolate;
  border-radius: 6px !important;
  background: transparent !important;
  animation: ${ANIMATION} 1s ease-in-out var(--b46-odds-delay, 0s) 6 both !important;
}
${quote}[${marker}="up"] {
  --b46-move-fill: rgba(42,163,103,.20);
  --b46-move-ink: #79e1ac;
  --b46-move-arrow: polygon(50% 0,100% 100%,0 100%);
}
${quote}[${marker}="down"] {
  --b46-move-fill: rgba(178,65,74,.19);
  --b46-move-ink: #ff9fa5;
  --b46-move-arrow: polygon(0 0,100% 0,50% 100%);
}
html[data-theme="light"] ${quote.replace('html ', '')}[${marker}="up"] {
  --b46-move-ink: #147348;
}
html[data-theme="light"] ${quote.replace('html ', '')}[${marker}="down"] {
  --b46-move-ink: #ae304a;
}
${quote} > strong[data-nomad-odds-raw] {
  color: var(--b46-move-ink) !important;
}
${quote}::before, ${quote}::after {
  content: "" !important;
  position: absolute !important;
  display: block !important;
  pointer-events: none !important;
  border: 0 !important;
  box-shadow: none !important;
}
${quote}::before {
  inset: 0 -1px 0 0 !important;
  border-radius: inherit !important;
  background: var(--b46-move-fill) !important;
  z-index: -1 !important;
}
${quote}::after {
  inset: var(--b46-odds-arrow-y, 50%) auto auto var(--b46-odds-arrow-x, 100%) !important;
  transform: translateY(-50%) !important;
  width: 5px !important;
  height: 5px !important;
  background: var(--b46-move-ink) !important;
  clip-path: var(--b46-move-arrow) !important;
  z-index: 2 !important;
}
@media (prefers-reduced-motion: reduce) {
  ${quote} { animation: none !important; }
}
`;

function installOddsMovement(animationName, marker) {
  if (window.__b46OddsCrossDeviceStats) return;
  const QUOTE = '.b46-v3-quote,.market-quote,.market-price-row';
  const ROW = '.match-row[data-match-id]';
  const SELECTOR = `${ROW} .market-cell strong[data-nomad-odds-raw]`;
  const DURATION_MS = 6000;
  const MAX_QUOTE_AGE_MS = 180000;
  const memory = new Map();
  const mounted = new WeakMap();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stats = window.__b46OddsCrossDeviceStats = {
    ready: false, scans: 0, baselines: 0, flashes: 0, ups: 0, downs: 0, completed: 0
  };

  function detach(element) {
    const move = mounted.get(element);
    if (!move) return;
    mounted.delete(element);
    move.elements.delete(element);
    element.removeAttribute(marker);
    element.style.removeProperty('--b46-odds-delay');
    element.style.removeProperty('--b46-odds-arrow-x');
    element.style.removeProperty('--b46-odds-arrow-y');
  }

  function finish(move) {
    if (move.state.move !== move) return;
    delete move.state.move;
    clearTimeout(move.timeout);
    for (const element of move.elements) detach(element);
  }

  function present(move, element, numeral, now) {
    const mountedMove = mounted.get(element);
    if (mountedMove && mountedMove !== move) detach(element);
    const box = element.getBoundingClientRect();
    const text = numeral.getBoundingClientRect();
    if (!box.width || !box.height || !text.width || !text.height) {
      detach(element);
      return;
    }

    element.style.setProperty('--b46-odds-arrow-x', (text.right - box.left + 1.5).toFixed(2) + 'px');
    element.style.setProperty('--b46-odds-arrow-y', (text.top + text.height / 2 - box.top).toFixed(2) + 'px');
    if (mountedMove === move) return;

    // A refreshed row may replace the quote node mid-animation. Continue from the
    // original animation clock instead of replaying the first pulse.
    const elapsed = move.startedAt === null ? 0 : Math.max(0, now - move.startedAt);
    if (elapsed >= DURATION_MS) return;
    element.style.setProperty('--b46-odds-delay', -elapsed + 'ms');
    // Flush the unmarked style so a new change in the same direction can restart.
    void element.offsetWidth;
    move.elements.add(element);
    mounted.set(element, move);
    element.setAttribute(marker, move.direction);
  }

  function begin(state, direction, now) {
    const move = {state, direction, createdAt: now, startedAt: null, elements: new Set()};
    state.move = move;
    // animationend owns normal cleanup. The watchdog only handles missing events,
    // such as a closed row or a browser that cannot play the animation.
    move.timeout = setTimeout(() => finish(move), reducedMotion.matches ? DURATION_MS : DURATION_MS + 2500);
    stats.flashes++;
    stats[direction === 'up' ? 'ups' : 'downs']++;
  }

  function handleAnimation(event) {
    if (event.animationName !== animationName || event.pseudoElement) return;
    const move = mounted.get(event.target);
    if (!move) return;
    const now = performance.now();
    if (event.type === 'animationstart') {
      if (move.startedAt === null) move.startedAt = now - event.elapsedTime * 1000;
      return;
    }
    // Ignore a completion already queued for a previous movement on this node.
    if (now - (move.startedAt ?? move.createdAt) < DURATION_MS - 150) return;
    stats.completed++;
    finish(move);
  }

  function scan() {
    stats.scans++;
    const now = performance.now();
    const format = window.NOMAD343_ODDS?.format || 'decimal';
    for (const strong of document.querySelectorAll(SELECTOR)) {
      const element = strong.closest(QUOTE);
      const cell = strong.closest('.market-cell');
      const row = strong.closest(ROW);
      const title = cell.title.trim();
      const market = [...cell.classList].find(name => /^market-cell-(1x2|ah|ou|btts|cards|corners)$/.test(name));
      const side = element?.dataset.side || strong.dataset.b46Align?.split('-').at(-1) ||
        element?.querySelector('i')?.textContent.trim();
      if (!element || !market || !side) continue;
      const key = [row.dataset.matchId, market, side].join('|');
      const previous = memory.get(key);
      const raw = Number(strong.dataset.nomadOddsRaw);
      const label = strong.textContent.trim();
      const live = row.dataset.b46Kind === 'live' && /^.+?\s*·\s*(LIVE|NOW)$/i.test(title);
      if (!live || !Number.isFinite(raw) || raw <= 1 || raw >= 1000 || !/^[+-]?\d+(?:[./]\d+)?$/.test(label)) {
        if (previous?.move) finish(previous.move);
        memory.delete(key);
        detach(element);
        continue;
      }

      const displayed = label.includes('/') ? label : Number(label);
      const line = element.querySelector('em')?.textContent.trim() || '';
      if (!previous || previous.title !== title || previous.line !== line ||
          previous.format !== format || now - previous.seenAt > MAX_QUOTE_AGE_MS) {
        if (previous?.move) finish(previous.move);
        memory.set(key, {raw, displayed, title, line, format, seenAt: now});
        stats.baselines++;
        continue;
      }

      previous.seenAt = now;
      if (raw === previous.raw) {
        previous.displayed = displayed;
      } else if (previous.displayed !== displayed) {
        if (previous.move) finish(previous.move);
        begin(previous, raw > previous.raw ? 'up' : 'down', now);
        previous.raw = raw;
        previous.displayed = displayed;
      }
      if (previous.move) present(previous.move, element, strong, now);
    }
    if (memory.size > 4000) {
      for (const [key, record] of memory) {
        if (now - record.seenAt > MAX_QUOTE_AGE_MS && !record.move) memory.delete(key);
      }
    }
  }

  let scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      scan();
    });
  }

  function boot() {
    scan();
    stats.ready = true;
    document.addEventListener('animationstart', handleAnimation);
    document.addEventListener('animationend', handleAnimation);
    window.addEventListener('resize', schedule, {passive: true});
    const observer = new MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        if (target?.closest('.market-cell')) return true;
        if (record.type === 'attributes') return target?.matches(ROW);
        return [...record.addedNodes].some(node =>
          node.nodeType === 1 && (node.matches(`${ROW}, .market-cell`) || node.querySelector(SELECTOR)));
      })) schedule();
    });
    observer.observe(document.body, {
      subtree: true, childList: true, characterData: true, attributes: true,
      attributeFilter: ['data-nomad-odds-raw', 'data-b46-kind', 'title'],
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once: true});
  else boot();
}

export const crossDeviceOddsScript =
  `(${installOddsMovement.toString()})(${JSON.stringify(ANIMATION)},${JSON.stringify(marker)});`;
