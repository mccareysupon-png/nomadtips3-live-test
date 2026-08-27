(() => {
  'use strict';

  const STORE_KEY = 'nomad341EventTimelineV1';
  const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function loadStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function scorePair(text) {
    const match = String(text || '').match(/(\d+)\s*[–-]\s*(\d+)/);
    return match ? {home:Number(match[1]), away:Number(match[2])} : null;
  }

  function lockState(detail) {
    const cards = [...detail.querySelectorAll(':scope > .detail-card')];
    const lockCard = cards.find(card => (card.querySelector('h3')?.textContent || '').trim().toUpperCase() === 'SIGNAL LOCK · LOCKED');
    if (!lockCard) return null;

    const rows = [...lockCard.querySelectorAll('.check')];
    const entry = rows.find(row => /Entry minute\s*\/\s*score/i.test(row.querySelector('span')?.textContent || ''));
    const value = entry?.querySelector('b')?.textContent || '';
    const minuteMatch = value.match(/(\d{1,3})\s*[′']/);
    const score = scorePair(value);
    if (!minuteMatch || !score) return null;

    lockCard.classList.add('detail-signal-lock-card');
    return {card:lockCard, minute:Number(minuteMatch[1]), score};
  }

  function currentScore(row) {
    return scorePair(row.querySelector(':scope > summary .score')?.textContent || '');
  }

  function observedGoals(matchId, lockMinute) {
    const entry = loadStore()?.[matchId];
    const goals = Array.isArray(entry?.goals) ? entry.goals : [];
    return goals
      .filter(goal => ['home','away'].includes(goal?.side) && finite(goal?.minute) && Number(goal.minute) > lockMinute)
      .map(goal => ({
        side:goal.side,
        minute:Number(goal.minute),
        count:Math.max(1, Math.min(5, Number(goal.count) || 1)),
        observedAt:Number(goal.observedAt) || 0,
      }))
      .sort((a,b) => a.minute - b.minute || a.observedAt - b.observedAt);
  }

  function eventRow(type, minute, score, extraClass='') {
    const label = type === 'lock' ? '◆ SIGNAL LOCK' : '● GOAL';
    return `<div class="signal-match-event ${extraClass}"><span class="signal-match-minute">${esc(`${minute}′`)}</span><b>${esc(label)}</b><strong>${esc(`${score.home}–${score.away}`)}</strong></div>`;
  }

  function renderCard(row, detail, lock) {
    const matchId = String(row.dataset.matchId || '');
    if (!matchId) return;

    const goals = observedGoals(matchId, lock.minute);
    const score = {home:lock.score.home, away:lock.score.away};
    const events = [eventRow('lock', lock.minute, score, 'is-lock')];

    for (const goal of goals) {
      score[goal.side] += goal.count;
      events.push(eventRow('goal', goal.minute, score, goal.side === 'home' ? 'is-home' : 'is-away'));
    }

    const nowScore = currentScore(row);
    const complete = nowScore && score.home === nowScore.home && score.away === nowScore.away;
    const note = !nowScore || complete
      ? ''
      : `<div class="signal-match-note">CURRENT ${esc(`${nowScore.home}–${nowScore.away}`)} · goal minute unavailable for unobserved score change</div>`;
    const signature = [
      lock.minute,lock.score.home,lock.score.away,
      ...goals.flatMap(goal=>[goal.side,goal.minute,goal.count,goal.observedAt]),
      nowScore?.home??'x',nowScore?.away??'x',complete?'1':'0'
    ].join('|');

    const existing = detail.querySelector(':scope > [data-signal-match-events="1"]');
    if (existing?.dataset?.signalEventsSignature === signature) {
      detail.classList.add('has-signal-match-events');
      return;
    }

    const holder = document.createElement('div');
    holder.innerHTML = `<section class="detail-card signal-match-events-card" data-signal-match-events="1"><h3>MATCH EVENTS · SINCE LOCK</h3><div class="signal-match-events-list">${events.join('')}</div>${note}</section>`;
    const next = holder.firstElementChild;
    next.dataset.signalEventsSignature = signature;
    if (existing) existing.replaceWith(next);
    else lock.card.insertAdjacentElement('afterend', next);
    detail.classList.add('has-signal-match-events');
  }

  function renderRow(row) {
    const detail = row.querySelector('.match-detail.is-flow-columns');
    if (!detail) return;
    const lock = lockState(detail);
    if (!lock) {
      detail.querySelector(':scope > [data-signal-match-events="1"]')?.remove();
      detail.classList.remove('has-signal-match-events');
      return;
    }
    renderCard(row, detail, lock);
  }

  function renderAll() {
    document.querySelectorAll('.match-wrap[data-match-id]').forEach(renderRow);
  }

  function schedule() {
    requestAnimationFrame(renderAll);
    setTimeout(renderAll, 350);
  }

  const observer = new MutationObserver(schedule);
  const start = () => {
    const list = document.querySelector('.match-list');
    if (list) observer.observe(list, {childList:true, subtree:true});
    schedule();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
