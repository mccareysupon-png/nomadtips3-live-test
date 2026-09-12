(()=>{
'use strict';
const VERSION='343-team-kits-v4-vintage';
const PALETTES=[
  ['#2f6f5f','#e4d7ba','#173b33'],['#7f2f2f','#f1e3c6','#3a1717'],['#315a8a','#e9dcc0','#1b2f4a'],['#6a4c93','#efe1c8','#34204b'],
  ['#a35a2b','#f6e6c7','#4f2a12'],['#26736c','#f5e7ca','#123b37'],['#b08f2b','#f6e7b7','#54440f'],['#2c7b8f','#e8dcc4','#163d47'],
  ['#8a3047','#f0deca','#431725'],['#6e8b2f','#eee3c0','#324215'],['#4169b1','#f2e6cc','#223765'],['#b35c7d','#f1deca','#5a283d'],
  ['#7b5aa6','#eee0c8','#3b2958'],['#bf6b2c','#f4e5cc','#613414'],['#255235','#dbc08c','#132a1d'],['#6ca1bf','#f0e3cc','#31526a'],
  ['#b4473b','#f3dfd2','#5a221d'],['#c39d2d','#244b74','#f2e0ad'],['#3b8d84','#ecddc4','#1b4742'],['#c1648b','#f1dfcb','#632d48'],
  ['#4a4f56','#e7ddd0','#202327'],['#c99e3b','#efe2b6','#6a4d17'],['#5560b4','#d4c99a','#29306a'],['#92343f','#ead6c6','#47181f']
];
const STYLE_ID='nomad343-team-kits-style';
const hash=value=>{let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const pick=(name)=>hash(name)%PALETTES.length;
function pattern(index,[a,b,c]){
  switch(index%8){
    case 0:return `linear-gradient(180deg,${a} 0 100%)`;
    case 1:return `repeating-linear-gradient(90deg,${a} 0 22%,${b} 22% 38%,${a} 38% 60%,${b} 60% 76%,${a} 76% 100%)`;
    case 2:return `repeating-linear-gradient(180deg,${a} 0 24%,${b} 24% 36%,${a} 36% 48%,${b} 48% 60%,${a} 60% 100%)`;
    case 3:return `linear-gradient(90deg,${a} 0 48%,${b} 48% 52%,${c} 52% 100%)`;
    case 4:return `linear-gradient(135deg,${a} 0 42%,${b} 42% 54%,${c} 54% 100%)`;
    case 5:return `radial-gradient(circle at 50% 42%,${b} 0 9%,transparent 10%), linear-gradient(180deg,${a} 0 43%,${b} 43% 57%,${a} 57% 100%)`;
    case 6:return `repeating-linear-gradient(90deg,${a} 0 30%,${c} 30% 37%,${a} 37% 63%,${c} 63% 70%,${a} 70% 100%)`;
    default:return `linear-gradient(180deg,${a} 0 18%,${b} 18% 26%,${a} 26% 100%)`;
  }
}
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .team-slot.kit-ready{gap:5px}
    .team-kit-icon{display:inline-block;position:relative;width:1.2792em;height:1.2792em;flex:0 0 1.2792em;clip-path:polygon(25% 8%,37% 2%,46% 8%,54% 8%,63% 2%,75% 8%,100% 24%,87% 40%,76% 33%,76% 100%,24% 100%,24% 33%,13% 40%,0 24%);border-radius:.08em;box-shadow:inset 0 0 0 1px rgba(255,248,232,.55),inset 0 -.08em 0 rgba(0,0,0,.14),0 0 2px rgba(0,0,0,.30);opacity:.98;filter:saturate(.86) brightness(.98)}
    .team-kit-icon::before{content:"";position:absolute;left:50%;top:.06em;transform:translateX(-50%);width:.32em;height:.16em;background:rgba(245,235,214,.96);border-radius:0 0 .12em .12em;box-shadow:0 0 0 1px rgba(80,55,28,.10)}
    .team-kit-icon::after{content:"";position:absolute;inset:.03em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),inset 0 .14em 0 rgba(255,255,255,.05)}
    @media(max-width:760px){.team-slot.kit-ready{gap:4px}.team-kit-icon{width:1.2168em;height:1.2168em;flex-basis:1.2168em}}
  `;
  document.head.appendChild(style);
}
function icon(index){
  const el=document.createElement('span');
  el.className='team-kit-icon';
  el.setAttribute('aria-hidden','true');
  el.dataset.kit=String(index+1).padStart(2,'0');
  el.style.background=pattern(index,PALETTES[index]);
  return el;
}
function decorateCard(card){
  const homeSlot=card.querySelector('.home-slot');
  const awaySlot=card.querySelector('.away-slot');
  const homeName=homeSlot?.querySelector('.team-name');
  const awayName=awaySlot?.querySelector('.team-name');
  if(!homeSlot||!awaySlot||!homeName||!awayName)return;
  if(homeSlot.querySelector('.team-kit-icon')||awaySlot.querySelector('.team-kit-icon'))return;
  let homeIndex=pick(homeName.textContent.trim());
  let awayIndex=pick(awayName.textContent.trim());
  if(awayIndex===homeIndex)awayIndex=(awayIndex+11)%PALETTES.length;
  homeSlot.classList.add('kit-ready');
  awaySlot.classList.add('kit-ready');
  homeSlot.appendChild(icon(homeIndex));
  awaySlot.insertBefore(icon(awayIndex),awayName);
}
function decorate(root=document){
  root.querySelectorAll?.('.match-card .fixture-scoreboard').forEach(board=>decorateCard(board.closest('.match-card')));
}
function boot(){
  ensureStyle();
  decorate();
  const root=document.querySelector('.score-board')||document.body;
  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate(root)});
  });
  observer.observe(root,{childList:true,subtree:true});
  window.NOMAD_TEAM_KITS_343={version:VERSION,refresh:()=>decorate(root),paletteCount:PALETTES.length};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
