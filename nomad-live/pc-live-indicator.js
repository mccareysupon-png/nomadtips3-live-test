(() => {
  'use strict';

  const mq = window.matchMedia('(min-width:1025px)');
  const mode = document.querySelector('.hero .mode');
  const strong = mode?.querySelector(':scope > strong');
  const pill = document.querySelector('.source-pill');
  if (!mode || !strong || !pill) return;

  const originalText = strong.textContent;
  const originalTitle = mode.getAttribute('title');

  const sourceState = () => {
    const text = String(pill.textContent || '').trim().replace(/\s+/g, ' ');
    if (/\bLIVE DATA\s*·\s*LIVE\b/i.test(text)) return 'live';
    if (/\b(?:WAIT|OFFLINE|SOURCE WAIT|ENGINE OFFLINE)\b/i.test(text)) return 'offline';
    return 'connecting';
  };

  const apply = () => {
    mode.classList.remove('pc-live-indicator', 'is-live', 'is-offline', 'is-connecting');

    if (!mq.matches) {
      strong.textContent = originalText;
      if (originalTitle == null) mode.removeAttribute('title');
      else mode.setAttribute('title', originalTitle);
      return;
    }

    strong.textContent = "Live'";
    const state = sourceState();
    mode.classList.add('pc-live-indicator', `is-${state}`);
    mode.setAttribute(
      'title',
      state === 'live' ? 'Live data connected' : state === 'offline' ? 'Live data disconnected' : 'Connecting live data'
    );
  };

  new MutationObserver(apply).observe(pill, {childList:true, subtree:true, characterData:true, attributes:true});
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', apply);
  else if (typeof mq.addListener === 'function') mq.addListener(apply);

  apply();
})();
