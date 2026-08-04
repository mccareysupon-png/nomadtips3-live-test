(()=>{
  'use strict';

  const textFor = index => `MATCH ${index + 1}`;

  function label(index, className) {
    const node = document.createElement('span');
    node.className = className;
    node.textContent = textFor(index);
    return node;
  }

  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }

  function applyPredictionOrder() {
    document.querySelectorAll('#pickGrid .pick-card').forEach((card, index) => {
      setText(card.querySelector('.pick-rank'), textFor(index));
    });
  }

  function applyHistoryOrder() {
    setText(document.querySelector('.history thead th:first-child'), 'Order');
    document.querySelectorAll('#historyRows tr').forEach((row, index) => {
      const cell = row.cells?.[0];
      if (!cell) return;
      let rank = cell.querySelector('.history-match');
      if (!rank) {
        cell.textContent = '';
        rank = label(index, 'history-match');
        cell.appendChild(rank);
      } else {
        setText(rank, textFor(index));
      }
    });
  }

  function applyPosterOrder() {
    document.querySelectorAll('#posterList .poster-pick').forEach((item, index) => {
      let rank = item.querySelector('.poster-order');
      if (!rank) {
        const first = item.firstElementChild;
        rank = label(index, 'poster-order');
        if (first) first.replaceWith(rank);
        else item.prepend(rank);
      } else {
        setText(rank, textFor(index));
      }
    });
  }

  function applyLiveOrder() {
    document.querySelectorAll('#matches .match-card').forEach((card, index) => {
      const head = card.querySelector('.match-head');
      const league = head?.querySelector('[data-k="league"]');
      if (!head || !league) return;

      let group = head.querySelector('.match-head-main');
      if (!group) {
        group = document.createElement('div');
        group.className = 'match-head-main';
        head.insertBefore(group, head.firstChild);
        group.appendChild(league);
        league.classList.add('live-league');
      }

      let rank = group.querySelector('.live-match-order');
      if (!rank) {
        rank = label(index, 'live-match-order');
        group.insertBefore(rank, group.firstChild);
      } else {
        setText(rank, textFor(index));
      }
    });
  }

  let queued = false;
  function applyAll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyPredictionOrder();
      applyHistoryOrder();
      applyPosterOrder();
      applyLiveOrder();
    });
  }

  applyAll();
  new MutationObserver(applyAll).observe(document.documentElement, {childList:true, subtree:true});
  window.addEventListener('storage', applyAll);
  window.addEventListener('nomad-results-updated', applyAll);
  window.addEventListener('nomad:card-added', applyAll);
})();
