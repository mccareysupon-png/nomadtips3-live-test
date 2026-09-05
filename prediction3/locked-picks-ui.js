(()=>{
  'use strict';

  const LOCK_SELECTOR='.api-football-candidate-card';
  const API_TEXT_RE=/(?:API[- ]?FOOTBALL|ONE[- ]SHOT REFEREE|API STOPPED FOR THIS MATCH|upstream requests?|fixture cache)/i;
  let queued=false;

  const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim();
  const num=value=>{const n=Number(value);return Number.isFinite(n)?n:null;};
  const fmtOdds=value=>{const n=num(value);return n===null?'—':n.toFixed(2);};

  function onePickLabel(raw){
    const pick=String(raw||'').trim().toUpperCase();
    if(/^(?:HOME|1|HOME WIN)$/.test(pick))return 'HOME WIN';
    if(/^(?:AWAY|2|AWAY WIN)$/.test(pick))return 'AWAY WIN';
    if(/^(?:DRAW|X)$/.test(pick))return 'DRAW';
    return pick||'—';
  }

  function totalPickLabel(raw,line){
    const pick=String(raw||'').trim().toUpperCase();
    const side=pick.startsWith('UNDER')?'UNDER':pick.startsWith('OVER')?'OVER':pick;
    return [side,line].filter(Boolean).join(' ')||'—';
  }

  function lineFrom(textValue){
    const match=String(textValue||'').match(/(?:OVER\s*\/\s*UNDER|O\s*\/\s*U|TOTALS?)\s*(-?\d+(?:\.\d+)?)/i);
    return match?.[1]||'';
  }

  function oddsMap(textValue){
    const value=String(textValue||'');
    const out={};
    for(const [key,label] of [['HOME','1'],['DRAW','X'],['AWAY','2'],['OVER','O'],['UNDER','U']]){
      const match=value.match(new RegExp(`(?:^|\\s|·)${label}\\s*@\\s*(\\d+(?:\\.\\d+)?)`,'i'));
      if(match)out[key]=Number(match[1]);
    }
    return out;
  }

  function selectedOdds(pick,odds){
    const p=String(pick||'').toUpperCase();
    if(p.includes('HOME'))return odds.HOME;
    if(p.includes('AWAY'))return odds.AWAY;
    if(p.includes('DRAW')||p==='X')return odds.DRAW;
    if(p.includes('OVER'))return odds.OVER;
    if(p.includes('UNDER'))return odds.UNDER;
    return null;
  }

  function teamName(card,side){
    const home=side==='HOME';
    const selectors=home?
      ['.teams-line > strong:first-child','[data-home-name]','.team-home .team-name','.home-team .team-name','.team.home strong','.p3-team:not(.away) strong']:
      ['.teams-line > strong:last-child','[data-away-name]','.team-away .team-name','.away-team .team-name','.team.away strong','.p3-team.away strong'];
    const scope=card.closest('.event-compact,.prediction-card,.p3-featured,article')||document;
    for(const selector of selectors){
      const value=text(scope.querySelector(selector));
      if(value&&!/^(?:HOME|AWAY)$/.test(value.toUpperCase()))return value;
    }
    return '';
  }

  function marketArticle(article,index,card){
    const children=[...article.children];
    const marketNode=children[0]||article.querySelector('span');
    const pickNode=children.find(node=>node.tagName==='STRONG')||article.querySelector('strong');
    const probabilityNode=children.find(node=>node.tagName==='SMALL')||article.querySelector('small');
    const oddsNode=children.find(node=>node.tagName==='DIV'&&!node.classList.contains('p3-locked-selected-odds'))||article.querySelector('div');
    const marketText=text(marketNode);
    const rawPick=text(pickNode);
    const probability=text(probabilityNode);
    const rawOdds=text(oddsNode);
    const odds=oddsMap(rawOdds);
    const isOne=index===0||/^1X2$/i.test(marketText);
    const line=isOne?'':lineFrom(marketText);
    const pickLabel=isOne?onePickLabel(rawPick):totalPickLabel(rawPick,line);
    const odd=selectedOdds(pickLabel,odds);

    article.classList.add('p3-locked-market');
    article.replaceChildren();

    const market=document.createElement('span');
    market.className='p3-locked-market-name';
    market.textContent=isOne?'1X2':`O/U${line?` ${line}`:''}`;

    const pick=document.createElement('strong');
    pick.className='p3-locked-pick';
    pick.textContent=`PICK: ${pickLabel}`;

    article.append(market,pick);

    if(isOne&&(pickLabel==='HOME WIN'||pickLabel==='AWAY WIN')){
      const name=teamName(card,pickLabel.startsWith('HOME')?'HOME':'AWAY');
      if(name){
        const team=document.createElement('b');
        team.className='p3-locked-team';
        team.textContent=name;
        article.append(team);
      }
    }

    if(probability){
      const prob=document.createElement('small');
      prob.className='p3-locked-probability';
      prob.textContent=`PROBABILITY · ${probability}`;
      article.append(prob);
    }

    const selected=document.createElement('div');
    selected.className='p3-locked-selected-odds';
    selected.innerHTML=`<span>ODDS</span><strong>${fmtOdds(odd)}</strong>`;
    article.append(selected);

    if(rawOdds){
      const all=document.createElement('div');
      all.className='p3-locked-market-odds';
      all.textContent=rawOdds;
      article.append(all);
    }
    return pickLabel;
  }

  function scrubApiCopy(card){
    card.querySelectorAll('.afc-foot').forEach(node=>node.remove());
    const walker=document.createTreeWalker(card,NodeFilter.SHOW_TEXT);
    const remove=[];
    while(walker.nextNode()){
      const node=walker.currentNode;
      if(API_TEXT_RE.test(node.nodeValue||''))remove.push(node);
    }
    for(const node of remove){
      const parent=node.parentElement;
      node.nodeValue='';
      if(parent&&parent!==card&&!text(parent))parent.remove();
    }
  }

  function enhance(card){
    if(!(card instanceof HTMLElement)||card.dataset.p3LockedPicksUi==='1')return;
    if(!/PREDICTION\s+LOCKED/i.test(text(card)))return;
    const grid=card.querySelector('.afc-grid');
    const articles=grid?[...grid.querySelectorAll(':scope > article')]:[];
    if(articles.length<2)return;

    const picks=articles.slice(0,2).map((article,index)=>marketArticle(article,index,card));
    const head=card.querySelector('.afc-head');
    if(head){
      let copy=head.querySelector(':scope > div');
      if(!copy){copy=document.createElement('div');head.prepend(copy);}
      copy.replaceChildren();
      const summary=document.createElement('span');
      summary.className='p3-locked-summary';
      summary.textContent=`LOCKED PICKS · ${picks.join(' · ')}`;
      copy.append(summary);
      let status=head.querySelector(':scope > strong');
      if(!status){status=document.createElement('strong');head.append(status);}
      status.textContent='PREDICTION LOCKED';
      status.classList.add('p3-locked-status-pulse');
    }

    scrubApiCopy(card);
    card.classList.add('p3-locked-picks-ready');
    card.dataset.p3LockedPicksUi='1';
  }

  function scan(){
    queued=false;
    if(document.body?.dataset?.page!=='prediction3')return;
    document.querySelectorAll(LOCK_SELECTOR).forEach(enhance);
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(scan);
  }

  function start(){
    if(document.body?.dataset?.page!=='prediction3')return;
    scan();
    new MutationObserver(queue).observe(document.body,{childList:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
