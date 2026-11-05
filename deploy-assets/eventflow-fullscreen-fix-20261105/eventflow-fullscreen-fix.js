/* B46_EVENTFLOW_FULLSCREEN_FIX_20261105 */
(() => {
  'use strict';

  const VERSION = 'b46-eventflow-fullscreen-fix-20261105a';
  const CARD_SELECTORS = [
    '.expand-flow-card',
    '[data-event-flow]',
    '.event-flow-card'
  ].join(',');

  const BUTTON_HINT = /fullscreen|full[ -]?screen|maximi[sz]e|expand|zoom/i;

  let activeCard = null;
  let placeholder = null;
  let originParent = null;
  let originNextSibling = null;
  let savedScrollX = 0;
  let savedScrollY = 0;
  let fallbackActive = false;
  let cleanupQueued = false;

  const fullscreenElement = () =>
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    null;

  const nativeActive = () =>
    Boolean(activeCard && fullscreenElement() === activeCard);

  function lockPage() {
    document.documentElement.classList.add('b46-eventflow-fullscreen-lock');
    document.body.classList.add('b46-eventflow-fullscreen-lock');
  }

  function unlockPage() {
    document.documentElement.classList.remove('b46-eventflow-fullscreen-lock');
    document.body.classList.remove('b46-eventflow-fullscreen-lock');
  }

  function fireResize() {
    const fire = () => {
      try { window.dispatchEvent(new Event('resize')); } catch {}
    };
    requestAnimationFrame(() => {
      fire();
      requestAnimationFrame(fire);
    });
    setTimeout(fire, 180);
  }

  function setButtonState(card, expanded) {
    if (!card) return;
    const buttons = card.querySelectorAll(
      '[data-b46-eventflow-fullscreen-button], button, [role="button"], a'
    );
    for (const button of buttons) {
      const hay = [
        button.getAttribute('aria-label'),
        button.getAttribute('title'),
        button.className,
        button.textContent,
        ...[...button.attributes]
          .filter(a => a.name.startsWith('data-'))
          .map(a => a.value)
      ].join(' ');

      if (
        button.hasAttribute('data-b46-eventflow-fullscreen-button') ||
        BUTTON_HINT.test(hay)
      ) {
        button.setAttribute('aria-pressed', expanded ? 'true' : 'false');
        if (expanded) {
          button.setAttribute('aria-label', 'Exit Event Flow fullscreen');
          button.title = 'Exit fullscreen';
        }
      }
    }
  }

  function rememberOrigin(card) {
    originParent = card.parentNode;
    originNextSibling = card.nextSibling;
    savedScrollX = window.scrollX || window.pageXOffset || 0;
    savedScrollY = window.scrollY || window.pageYOffset || 0;

    placeholder = document.createElement('span');
    placeholder.className = 'b46-eventflow-fullscreen-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    originParent?.insertBefore(placeholder, card);
  }

  function restoreOrigin() {
    if (!activeCard) return;

    try {
      if (originParent?.isConnected) {
        if (originNextSibling?.parentNode === originParent) {
          originParent.insertBefore(activeCard, originNextSibling);
        } else if (placeholder?.parentNode === originParent) {
          originParent.insertBefore(activeCard, placeholder);
        } else {
          originParent.appendChild(activeCard);
        }
      }
    } catch {}

    placeholder?.remove();
    placeholder = null;
    originParent = null;
    originNextSibling = null;
  }

  function clearCardState(card) {
    if (!card) return;
    card.classList.remove('b46-eventflow-fullscreen');
    card.removeAttribute('data-b46-eventflow-fullscreen-active');
    setButtonState(card, false);
  }

  function finishExit({ restoreScroll = true } = {}) {
    const card = activeCard;

    if (fallbackActive) {
      fallbackActive = false;
      restoreOrigin();
    }

    clearCardState(card);
    unlockPage();
    activeCard = null;

    if (restoreScroll) {
      requestAnimationFrame(() => {
        try { window.scrollTo(savedScrollX, savedScrollY); } catch {}
        fireResize();
      });
    } else {
      fireResize();
    }
  }

  async function exitNative() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (typeof exit !== 'function') {
      finishExit();
      return;
    }
    try {
      const result = exit.call(document);
      if (result && typeof result.then === 'function') await result;
    } catch {
      finishExit();
    }
  }

  function enterFallback(card) {
    if (!card || fallbackActive) return;

    if (!activeCard) {
      activeCard = card;
      rememberOrigin(card);
    }

    fallbackActive = true;
    lockPage();

    // Critical fix: portal the card to <body> so transformed/contained
    // workspace ancestors cannot become the containing block for fixed.
    if (card.parentNode !== document.body) {
      document.body.appendChild(card);
    }

    card.classList.add('b46-eventflow-fullscreen');
    card.setAttribute('data-b46-eventflow-fullscreen-active', 'fallback');
    setButtonState(card, true);
    fireResize();
  }

  async function enter(card) {
    if (!card) return;

    if (activeCard && activeCard !== card) {
      await collapse();
    }

    activeCard = card;
    rememberOrigin(card);
    lockPage();

    const request = card.requestFullscreen || card.webkitRequestFullscreen;

    if (typeof request === 'function') {
      try {
        const result = request.call(card);
        if (result && typeof result.then === 'function') await result;

        await new Promise(resolve =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        );

        if (fullscreenElement() === card) {
          card.classList.add('b46-eventflow-fullscreen');
          card.setAttribute('data-b46-eventflow-fullscreen-active', 'native');
          setButtonState(card, true);
          fireResize();
          return;
        }
      } catch {}
    }

    // Native fullscreen unavailable/failed. Remove the unused placeholder
    // before fallback creates its portal state from the same origin.
    placeholder?.remove();
    placeholder = null;
    originParent = null;
    originNextSibling = null;
    activeCard = null;
    enterFallback(card);
  }

  async function collapse() {
    if (!activeCard) {
      unlockPage();
      return;
    }

    if (nativeActive()) {
      await exitNative();
      return;
    }

    finishExit();
  }

  async function toggle(card) {
    if (activeCard === card && (fallbackActive || nativeActive())) {
      await collapse();
      return;
    }
    await enter(card);
  }

  function cardForControl(control) {
    if (!control) return null;

    const own = control.closest(CARD_SELECTORS);
    if (own) return own;

    const region = control.closest(
      '.match-expanded, .featured-card, [data-featured], [class*="event-flow"], [class*="eventflow"]'
    );

    return region?.querySelector(CARD_SELECTORS) || null;
  }

  function looksLikeFullscreenControl(control, card) {
    if (!control || !card) return false;
    if (control.hasAttribute('data-b46-eventflow-fullscreen-button')) return true;

    const hay = [
      control.getAttribute('aria-label'),
      control.getAttribute('title'),
      control.className,
      control.textContent,
      ...[...control.attributes]
        .filter(a => a.name.startsWith('data-'))
        .flatMap(a => [a.name, a.value])
    ].join(' ');

    return BUTTON_HINT.test(hay);
  }

  function onClick(event) {
    const control = event.target?.closest?.('button,[role="button"],a');
    if (!control) return;

    const card = cardForControl(control);
    if (!looksLikeFullscreenControl(control, card)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    toggle(card);
  }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      if (fallbackActive) {
        event.preventDefault();
        collapse();
      }
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;

    const control = event.target?.closest?.('button,[role="button"],a');
    if (!control) return;

    const card = cardForControl(control);
    if (!looksLikeFullscreenControl(control, card)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    toggle(card);
  }

  function syncNativeState() {
    if (cleanupQueued) return;

    cleanupQueued = true;
    requestAnimationFrame(() => {
      cleanupQueued = false;

      if (!activeCard) {
        unlockPage();
        return;
      }

      if (nativeActive()) {
        activeCard.classList.add('b46-eventflow-fullscreen');
        activeCard.setAttribute('data-b46-eventflow-fullscreen-active', 'native');
        lockPage();
        setButtonState(activeCard, true);
        fireResize();
        return;
      }

      if (!fallbackActive) {
        finishExit();
      }
    });
  }

  function hardCleanup() {
    if (fullscreenElement() === activeCard) {
      try {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        exit?.call(document);
      } catch {}
    }
    finishExit({ restoreScroll: false });
  }

  function start() {
    // Capture phase intentionally replaces the old broken handler only
    // for Event Flow fullscreen controls. All unrelated clicks are untouched.
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeydown, true);
    document.addEventListener('fullscreenchange', syncNativeState);
    document.addEventListener('webkitfullscreenchange', syncNativeState);
    window.addEventListener('pagehide', hardCleanup);
    window.addEventListener('beforeunload', hardCleanup);
  }

  window.NOMAD_EVENTFLOW_FULLSCREEN = Object.freeze({
    version: VERSION,
    isExpanded: () => Boolean(activeCard && (fallbackActive || nativeActive())),
    expand: card => enter(card || document.querySelector(CARD_SELECTORS)),
    collapse,
    toggle: card => toggle(card || document.querySelector(CARD_SELECTORS)),
    cleanup: hardCleanup
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
