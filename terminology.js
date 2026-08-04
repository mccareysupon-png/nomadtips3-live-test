(()=>{
  'use strict';

  let observer;
  let scheduled=false;

  const replaceExact=(selector,from,to)=>{
    document.querySelectorAll(selector).forEach(node=>{
      if(node.textContent.trim()===from) node.textContent=to;
    });
  };

  function sanitize(){
    scheduled=false;
    observer?.disconnect();

    document.title=document.title
      .replace(/Today's \d+ Picks/gi,'Today’s Match Predictions')
      .replace(/Today's Picks/gi,'Match Predictions');

    replaceExact('.main-nav a,.suite-nav a,.back-home,.action-link.home',"Today's Picks",'Match Predictions');
    replaceExact('.main-nav a,.suite-nav a,.back-home,.action-link.home','← Today’s Picks','← Match Predictions');
    replaceExact('.main-nav a,.suite-nav a,.back-home,.action-link.home','← Back to Today’s Picks','← Back to Match Predictions');
    replaceExact('[data-action="publish"]','Lock & Publish Test Pages','Finalize & Publish Analysis');

    document.querySelectorAll('.league').forEach(node=>{
      node.textContent=node.textContent.replace(/\bPICK\s+(\d+)/gi,'PREDICTION $1');
    });

    document.querySelectorAll('.pick-data').forEach(grid=>{
      const cells=[...grid.children];
      if(cells[0]){
        cells[0].classList.add('prediction-primary');
        const label=cells[0].querySelector('small');
        if(label) label.textContent='Match Prediction';
      }
      cells.forEach(cell=>{
        const label=cell.querySelector('small')?.textContent.trim().toLowerCase();
        if(label==='locked odds'||label==='odds'||label==='bookmaker') cell.remove();
      });
    });

    document.querySelectorAll('.markets').forEach(node=>node.remove());

    document.querySelectorAll('.pick small').forEach(node=>{
      if(node.textContent.trim()==='CORE PICK') node.textContent='MATCH PREDICTION';
    });
    document.querySelectorAll('.reason small').forEach(node=>{
      if(node.textContent.includes('MANUAL SET 2 REASON')) node.textContent='MATCH ANALYSIS';
    });

    const minOdds=document.getElementById('minimumOdds');
    minOdds?.closest('label')?.remove();

    document.querySelectorAll('#reviewRows td[data-label="Odds"]').forEach(node=>node.remove());
    document.querySelectorAll('#reviewRows td[data-label="Pick"]').forEach(node=>node.dataset.label='Prediction');

    document.querySelectorAll('.result-card footer>span').forEach(node=>{
      const cleaned=node.textContent
        .replace(/^Odds\s+[^·]+·\s*/i,'')
        .replace(/\bPick\b/gi,'Prediction');
      if(cleaned!==node.textContent) node.textContent=cleaned;
    });
    document.querySelectorAll('[data-unlock-pick]').forEach(button=>button.textContent='Reopen Prediction');

    document.querySelectorAll('p,.empty-state,.progress-label').forEach(node=>{
      node.textContent=node.textContent
        .replace(/locked Draft picks/gi,'finalized match predictions')
        .replace(/Draft picks/gi,'match predictions')
        .replace(/Today’s Picks/gi,'Match Predictions')
        .replace(/\bpicks\b/gi,'predictions');
    });

    const hero=document.querySelector('.hero>div:first-child,.hero .intro');
    if(hero&&!hero.querySelector('.analysis-disclaimer')){
      const note=document.createElement('p');
      note.className='analysis-disclaimer';
      note.textContent='Sports analysis and match-result forecasting only. No gambling services, betting links, stakes or financial incentives.';
      hero.appendChild(note);
    }

    observer?.observe(document.body,{childList:true,subtree:true,characterData:true});
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(sanitize);
  }

  const start=()=>{
    observer=new MutationObserver(schedule);
    sanitize();
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
