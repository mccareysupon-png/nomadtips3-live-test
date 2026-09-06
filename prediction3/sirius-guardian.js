(()=>{
  'use strict';

  const CARD_SELECTOR='.p3-featured';

  function decorate(card){
    if(!(card instanceof HTMLElement)||card.dataset.siriusGuardian==='1')return;
    const head=card.querySelector('.p3-match-head');
    if(!head)return;

    card.dataset.siriusGuardian='1';
    card.classList.add('p3-sirius-card');
    head.classList.add('p3-sirius-head');

    const home=card.querySelector('.p3-match-teams .p3-team:not(.away) strong')?.textContent?.trim()||'Home';
    const away=card.querySelector('.p3-match-teams .p3-team.away strong')?.textContent?.trim()||'Away';
    head.setAttribute('aria-label',`Queen Sirius presents the prediction for ${home} versus ${away}`);

    if(!head.querySelector('.p3-sirius-intro')){
      const intro=document.createElement('div');
      intro.className='p3-sirius-intro';
      intro.innerHTML='<span>QUEEN SIRIUS · GOLDEN GUARDIAN</span><strong>BESTOWED MATCH PREDICTION</strong><small>The Queen grants this match selection.</small>';
      head.insertBefore(intro,head.firstChild);
    }

    const manual=head.querySelector('.p3-manual-pill');
    if(manual)manual.textContent='SIRIUS VERDICT';

    const pickLabel=card.querySelector('.p3-pick-hero .p3-section-label span');
    if(pickLabel)pickLabel.textContent="THE QUEEN'S PICK";

    const finalLabel=card.querySelector('.p3-final-heading span');
    if(finalLabel)finalLabel.textContent='SIRIUS FINAL CALL';

    const note=card.querySelector('.prediction3-card-note');
    if(note)note.textContent='Queen Sirius guardian presentation · Prediction3 manual record · odds and results remain factual.';
  }

  function scan(root=document){
    if(root.matches?.(CARD_SELECTOR))decorate(root);
    root.querySelectorAll?.(CARD_SELECTOR).forEach(decorate);
  }

  scan();
  const target=document.getElementById('predictionList')||document.body;
  const observer=new MutationObserver(mutations=>{
    for(const mutation of mutations){
      mutation.addedNodes.forEach(node=>{
        if(node.nodeType===1)scan(node);
      });
    }
  });
  observer.observe(target,{childList:true,subtree:true});
})();
