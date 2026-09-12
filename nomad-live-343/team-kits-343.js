(()=>{
'use strict';
const VERSION='343-team-kits-v3';
const PALETTES=[
  ['#2fd276','#0c1b12','#a7f3c0'],['#2f6df6','#0c1733','#dbe8ff'],['#ef4050','#1a0c0f','#ffb0b8'],['#8c5cff','#1b1237','#ded1ff'],
  ['#ff8a2a','#21130a','#ffd0a6'],['#21c7b7','#0b201d','#b7fff4'],['#f4d63d','#1f1b07','#fff2a2'],['#29c6f4','#0b1b28','#b8edff'],
  ['#c92d4f','#210b12','#ffb1c1'],['#9be33a','#13200a','#e5ffb5'],['#3b74dd','#0d1730','#d5e3ff'],['#e24aa9','#250d20','#ffc2e8'],
  ['#7f52d9','#15102a','#baf6df'],['#ef7b24','#22130a','#fff0d6'],['#17633c','#0d1a12','#d9b86d'],['#62bdf2','#0d1c2a','#ccecff'],
  ['#d73b32','#210c0a','#ffe1dd'],['#f0c63a','#101b35','#8eb5ff'],['#279c90','#0d1d1a','#c7fff8'],['#ef5aa8','#2a1040','#ffd0e8'],
  ['#343a40','#111315','#d8dde2'],['#d4a82f','#17130a','#fff0a0'],['#4b55c7','#151733','#b6f5dd'],['#b92f3e','#1a0d10','#f1a3ad']
];
const STYLE_ID='nomad343-team-kits-style';
const hash=value=>{let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
const pick=(name)=>hash(name)%PALETTES.length;
function pattern(index,[a,b,c]){
  switch(index%8){
    case 0:return `linear-gradient(90deg,${a} 0 100%)`;
    case 1:return `repeating-linear-gradient(90deg,${a} 0 24%,${b} 24% 42%,${a} 42% 66%,${c} 66% 76%)`;
    case 2:return `repeating-linear-gradient(135deg,${a} 0 18%,${b} 18% 30%,${a} 30% 48%,${c} 48% 56%)`;
    case 3:return `linear-gradient(90deg,${a} 0 48%,${b} 48% 52%,${c} 52% 100%)`;
    case 4:return `linear-gradient(135deg,${a} 0 38%,${c} 38% 53%,${b} 53% 100%)`;
    case 5:return `linear-gradient(180deg,${a} 0 42%,${b} 42% 58%,${a} 58% 100%)`;
    case 6:return `repeating-linear-gradient(45deg,${a} 0 20%,${a} 20% 35%,${b} 35% 47%,${c} 47% 52%)`;
    default:return `linear-gradient(120deg,${a} 0 30%,${b} 30% 50%,${a} 50% 70%,${c} 70% 100%)`;
  }
}
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .team-slot.kit-ready{gap:5px}
    .team-kit-icon{display:inline-block;width:1.2792em;height:1.2792em;flex:0 0 1.2792em;clip-path:polygon(24% 7%,39% 0,61% 0,76% 7%,100% 25%,84% 43%,75% 34%,75% 100%,25% 100%,25% 34%,16% 43%,0 25%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22),0 0 3px rgba(0,0,0,.45);opacity:.98}
    .team-kit-icon::after{content:"";display:block;width:100%;height:100%;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
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
