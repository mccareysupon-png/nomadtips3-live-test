(() => {
  'use strict';

  // Presentation-only league flag renderer for NOMAD Live 3.42.
  // Reads the flag emoji already rendered by event-monitor.js and swaps only
  // that visual glyph for an image. No feed, engine, polling, market, event,
  // match state, or source data is read or modified here.

  const STYLE_ID = 'nomad342-league-flag-image-style';
  const API_SPORTS = code => `https://media.api-sports.io/flags/${code.toLowerCase()}.svg`;
  const FLAG_CDN = code => `https://flagcdn.com/${code.toLowerCase()}.svg`;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      body[data-page="live"] .event-league.has-league-flag-image {
        display:flex!important;
        align-items:center!important;
        gap:4px!important;
      }
      body[data-page="live"] .event-league .league-flag-image {
        display:block;
        width:15px;
        height:10px;
        flex:0 0 15px;
        object-fit:cover;
        border-radius:1px;
        box-shadow:0 0 0 1px rgba(255,255,255,.12);
      }
      body[data-page="live"] .event-league .league-flag-name {
        min-width:0;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
      }
      body[data-page="live"] .event-league .league-flag-code {
        display:inline-flex;
        align-items:center;
        justify-content:center;
        min-width:15px;
        height:10px;
        padding:0 2px;
        flex:0 0 auto;
        border-radius:1px;
        background:rgba(255,255,255,.08);
        color:#c8d0c9;
        font-size:6px;
        font-weight:900;
        line-height:1;
      }
      @media(max-width:760px) {
        body[data-page="live"] .event-league .league-flag-image {
          width:14px;
          height:9px;
          flex-basis:14px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function parseLeadingFlag(text) {
    const raw = String(text || '');
    const trimmed = raw.trimStart();
    const chars = Array.from(trimmed);
    if (chars.length < 2) return null;

    const first = chars[0].codePointAt(0);
    const second = chars[1].codePointAt(0);
    const regional = value => value >= 0x1F1E6 && value <= 0x1F1FF;
    if (!regional(first) || !regional(second)) return null;

    const code = String.fromCharCode(
      65 + (first - 0x1F1E6),
      65 + (second - 0x1F1E6)
    );
    const emoji = chars.slice(0, 2).join('');
    const label = chars.slice(2).join('').trimStart();
    return { code, emoji, label };
  }

  function fallbackCode(el, image, parsed) {
    image.remove();
    if (el.querySelector('.league-flag-code')) return;
    const code = document.createElement('span');
    code.className = 'league-flag-code';
    code.textContent = parsed.code;
    code.setAttribute('aria-label', `${parsed.code} league country`);
    el.prepend(code);
  }

  function decorate(el) {
    if (!el || el.dataset.leagueFlagImage === '1') return;
    const parsed = parseLeadingFlag(el.textContent);
    if (!parsed) return;

    const image = document.createElement('img');
    image.className = 'league-flag-image';
    image.src = API_SPORTS(parsed.code);
    image.alt = `${parsed.code} flag`;
    image.width = 15;
    image.height = 10;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';

    let fallbackTried = false;
    image.addEventListener('error', () => {
      if (!fallbackTried) {
        fallbackTried = true;
        image.src = FLAG_CDN(parsed.code);
        return;
      }
      fallbackCode(el, image, parsed);
    });

    const name = document.createElement('span');
    name.className = 'league-flag-name';
    name.textContent = parsed.label || '—';

    el.textContent = '';
    el.classList.add('has-league-flag-image');
    el.dataset.leagueFlagImage = '1';
    el.append(image, name);
  }

  function renderAll() {
    document.querySelectorAll('.event-league').forEach(decorate);
  }

  let queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderAll();
    });
  }

  function start() {
    injectStyle();
    renderAll();
    const list = document.getElementById('matchList');
    if (list) new MutationObserver(queue).observe(list, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
