(()=>{
  'use strict';

  // Completed matches must not remain on the Live Analysis page.
  // Final scores are retained by the result/statistics pipeline instead.
  const host=document.getElementById('matches');
  if(!host)return;

  function removeCompletedCards(){
    host.querySelectorAll('.cloudflare-completed-card,[data-cloudflare-completed]').forEach(card=>card.remove());
  }

  removeCompletedCards();
  window.addEventListener('pageshow',removeCompletedCards);
  window.addEventListener('storage',removeCompletedCards);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)removeCompletedCards()});
})();
