/* B46_MEMBER_PROMO_20261103 */
(() => {
  'use strict';
  const SCRIPT = document.currentScript;
  const ASSET = SCRIPT?.dataset.asset || '/ball46-member-promo-20261103a.jpg';
  const DESTINATION = 'https://member.ball46.com/pricing';
  let queued = false;

  function createCard() {
    const card = document.createElement('a');
    card.className = 'b46-member-promo';
    card.href = DESTINATION;
    card.setAttribute('aria-label', 'Join Ball46 Member — go beyond the score');
    card.innerHTML = `
      <img class="b46-member-promo__image" src="${ASSET}" alt="" width="1200" height="677" loading="lazy" decoding="async">
      <span class="b46-member-promo__content">
        <span class="b46-member-promo__eyebrow">BALL46 MEMBER</span>
        <strong class="b46-member-promo__title">GO BEYOND<br>THE SCORE.</strong>
        <span class="b46-member-promo__copy">Member insights. Live signals. One clear view.</span>
        <span class="b46-member-promo__cta">JOIN MEMBER</span>
      </span>`;
    return card;
  }

  function render() {
    queued = false;
    const targets = document.querySelectorAll([
      '.workspace.singlepage .live-stage-grid > .right-rail > .featured-card[data-featured]',
      '#b46gn-detail .b46gn-featured > .featured-card[data-featured]',
      '[data-b46-promo-test-target] > .featured-card[data-featured]',
    ].join(','));
    for (const target of targets) {
      if (target.previousElementSibling?.classList.contains('b46-member-promo')) continue;
      target.before(createCard());
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  }

  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
})();

