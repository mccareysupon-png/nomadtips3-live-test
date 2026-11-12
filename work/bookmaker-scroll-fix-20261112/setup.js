document.addEventListener('DOMContentLoaded',()=>{
 const markets=offset=>Object.fromEntries(Array.from({length:35},(_,i)=>['goal_total_'+i,{LIVE:{line:i+.5,over:offset,under:1.96}}]));
 const fixture={fixtureId:'qa',providerOdds:{bookmakers:{bet365:markets(1.91),pinnacle:markets(2.02)}}};
 window.NOMAD343_FULL_MARKET_BOOKMAKER.update(q('.match-expanded'),fixture);renderFullMarket();q('#theme').onclick=()=>document.documentElement.dataset.theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
});
