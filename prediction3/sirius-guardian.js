(()=>{
  'use strict';

  const CARD_SELECTOR='.p3-featured';

  function toRoman(value){
    const map=[
      [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
      [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
    ];
    let number=Math.max(1,Math.floor(Number(value)||1));
    let result='';
    for(const [unit,symbol] of map){
      while(number>=unit){result+=symbol;number-=unit;}
    }
    return result;
  }

  function refreshOrder(){
    const list=document.getElementById('predictionList')||document;
    [...list.querySelectorAll(CARD_SELECTOR)].forEach((card,index)=>{
      const head=card.querySelector('.p3-match-head');
      if(!head)return;
      let badge=head.querySelector('.p3-sirius-order');
      if(!badge){
        badge=document.createElement('span');
        badge.className='p3-sirius-order';
        head.appendChild(badge);
      }
      badge.textContent=toRoman(index+1);
      badge.setAttribute('aria-label',`Match ${index+1}`);
    });
  }

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

    const pickText=card.querySelector('.p3-pick-hero h2')?.textContent?.trim();
    if(pickText&&!head.querySelector('.p3-sirius-floating-pick')){
      const floating=document.createElement('div');
      floating.className='p3-sirius-floating-pick';
      floating.setAttribute('aria-hidden','true');

      const kicker=document.createElement('span');
      kicker.textContent='SIRIUS PICK';

      const value=document.createElement('strong');
      value.textContent=pickText;

      floating.append(kicker,value);
      head.appendChild(floating);
    }

    const manual=head.querySelector('.p3-manual-pill');
    if(manual)manual.textContent='SIRIUS VERDICT';

    const pickLabel=card.querySelector('.p3-pick-hero .p3-section-label span');
    if(pickLabel)pickLabel.textContent="THE QUEEN'S PICK";

    const finalLabel=card.querySelector('.p3-final-heading span');
    if(finalLabel)finalLabel.textContent='SIRIUS FINAL CALL';

    const priceRule=card.querySelector('.p3-price-rule');
    if(priceRule){
      const finalCallText=card.querySelector('.p3-final-heading strong')?.textContent?.trim()||'';
      const match=finalCallText.match(/(\d+(?:\.\d+)?)\s*\+/);
      const floor=match?Number(match[1]).toFixed(2):'1.70';
      priceRule.innerHTML=`Official pick requires <strong>${floor}+</strong>. Raw Best Market may be shown separately when it falls below the price gate.`;
    }

    const note=card.querySelector('.prediction3-card-note');
    if(note)note.textContent='Queen Sirius guardian presentation · Prediction3 multi-market record · official odds and results remain factual.';
  }

  function scan(root=document){
    if(root.matches?.(CARD_SELECTOR))decorate(root);
    root.querySelectorAll?.(CARD_SELECTOR).forEach(decorate);
  }

  scan();
  refreshOrder();
  const target=document.getElementById('predictionList')||document.body;
  const observer=new MutationObserver(mutations=>{
    let changed=false;
    for(const mutation of mutations){
      mutation.addedNodes.forEach(node=>{
        if(node.nodeType===1){scan(node);changed=true;}
      });
    }
    if(changed)refreshOrder();
  });
  observer.observe(target,{childList:true,subtree:true});
})();
