(()=>{
'use strict';
const VERSION='343-team-kits-v6-vintage24-frontname-20261004a';
const KITS=[
  {bg:'repeating-linear-gradient(90deg,#c62828 0 17%,#f3ead8 17% 34%,#c62828 34% 51%,#f3ead8 51% 68%,#c62828 68% 85%,#f3ead8 85% 100%)',collar:'#f3ead8'},
  {bg:'linear-gradient(180deg,#1f56b5 0 100%)',collar:'#f3ead8'},
  {bg:'repeating-linear-gradient(90deg,#d32f2f 0 18%,#181818 18% 36%,#d32f2f 36% 54%,#181818 54% 72%,#d32f2f 72% 90%,#181818 90% 100%)',collar:'#171717'},
  {bg:'linear-gradient(180deg,#f2ecdf 0 100%)',collar:'#171717'},
  {bg:'repeating-linear-gradient(180deg,#19763f 0 16%,#f1eadb 16% 32%,#19763f 32% 48%,#f1eadb 48% 64%,#19763f 64% 80%,#f1eadb 80% 100%)',collar:'#f1eadb'},
  {bg:'linear-gradient(90deg,#c62828 0 50%,#e4ad1a 50% 100%)',collar:'#f3ead8'},
  {bg:'linear-gradient(180deg,#c92d2d 0 100%)',collar:'#f3ead8'},
  {bg:'repeating-linear-gradient(90deg,#181818 0 18%,#f0eadf 18% 36%,#181818 36% 54%,#f0eadf 54% 72%,#181818 72% 90%,#f0eadf 90% 100%)',collar:'#f0eadf'},
  {bg:'linear-gradient(180deg,#1f57b7 0 39%,#e1b11d 39% 59%,#1f57b7 59% 100%)',collar:'#e1b11d'},
  {bg:'linear-gradient(180deg,#79bce0 0 20%,#8d2747 20% 100%)',collar:'#79bce0'},
  {bg:'linear-gradient(135deg,#171717 0 42%,#cb2f2f 42% 55%,#171717 55% 100%)',collar:'#171717'},
  {bg:'repeating-linear-gradient(90deg,#1e5fbe 0 18%,#f1eadc 18% 36%,#1e5fbe 36% 54%,#f1eadc 54% 72%,#1e5fbe 72% 90%,#f1eadc 90% 100%)',collar:'#f1eadc'},
  {bg:'linear-gradient(180deg,#e2b51b 0 100%)',collar:'#17613b'},
  {bg:'linear-gradient(145deg,transparent 0 37%,#f3eadc 38% 47%,transparent 48%),linear-gradient(215deg,transparent 0 37%,#f3eadc 38% 47%,transparent 48%),linear-gradient(180deg,#2558ad 0 100%)',collar:'#f3eadc'},
  {bg:'conic-gradient(from 0deg at 50% 50%,#c92d2d 0 25%,#f2ebde 25% 50%,#c92d2d 50% 75%,#f2ebde 75% 100%)',collar:'#f2ebde'},
  {bg:'repeating-linear-gradient(90deg,#16713b 0 22%,#e9e3d6 22% 27%,#16713b 27% 49%,#e9e3d6 49% 54%,#16713b 54% 76%,#e9e3d6 76% 81%,#16713b 81% 100%)',collar:'#f0eadf'},
  {bg:'linear-gradient(180deg,#6d3a98 0 100%)',collar:'#f1eadb'},
  {bg:'repeating-linear-gradient(90deg,#1f5fb9 0 18%,#171717 18% 36%,#1f5fb9 36% 54%,#171717 54% 72%,#1f5fb9 72% 90%,#171717 90% 100%)',collar:'#171717'},
  {bg:'linear-gradient(135deg,#f2ecdf 0 39%,#2457b1 39% 53%,#f2ecdf 53% 100%)',collar:'#f2ecdf'},
  {bg:'linear-gradient(180deg,#e96e22 0 100%)',collar:'#171717'},
  {bg:'repeating-linear-gradient(90deg,#a91f3e 0 18%,#2452a4 18% 36%,#a91f3e 36% 54%,#2452a4 54% 72%,#a91f3e 72% 90%,#2452a4 90% 100%)',collar:'#a91f3e'},
  {bg:'linear-gradient(180deg,#f1eadf 0 38%,#171717 38% 58%,#f1eadf 58% 100%)',collar:'#171717'},
  {bg:'repeating-linear-gradient(90deg,#dfae1c 0 18%,#171717 18% 36%,#dfae1c 36% 54%,#171717 54% 72%,#dfae1c 72% 90%,#171717 90% 100%)',collar:'#171717'},
  {bg:'linear-gradient(180deg,#66aee0 0 100%)',collar:'#f2ecdf'}
];
const STYLE_ID='nomad343-team-kits-style';
const hash=value=>{let h=2166136261;for(const ch of String(value||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0};
function ensureStyle(){
  let style=document.getElementById(STYLE_ID);
  if(!style){style=document.createElement('style');style.id=STYLE_ID;document.head.appendChild(style)}
  style.textContent=`
    .team-slot.kit-ready{gap:5px}
    .team-kit-icon{display:inline-block;position:relative;width:1.66em;height:1.66em;flex:0 0 1.66em;order:0;background:var(--kit-bg);clip-path:polygon(25% 8%,37% 2%,46% 8%,54% 8%,63% 2%,75% 8%,100% 24%,87% 40%,76% 33%,76% 100%,24% 100%,24% 33%,13% 40%,0 24%);border-radius:.1em;box-shadow:inset 0 0 0 1px rgba(255,248,232,.52),inset 0 -.1em 0 rgba(0,0,0,.17),0 0 0 1px rgba(9,11,10,.28),0 .08em .14em rgba(0,0,0,.36),0 .14em .27em rgba(0,0,0,.4);opacity:.99;filter:saturate(.9) brightness(.98)}
    .team-kit-icon::before{content:"";position:absolute;left:50%;top:.055em;transform:translateX(-50%);width:.4em;height:.2em;background:var(--kit-collar,#f2eadf);border-radius:0 0 .14em .14em;box-shadow:0 0 0 1px rgba(45,35,22,.16),0 .03em .08em rgba(0,0,0,.18)}
    .team-kit-icon::after{content:"";position:absolute;inset:.035em;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),inset 0 .16em 0 rgba(255,255,255,.045),inset 0 -.08em .08em rgba(0,0,0,.12)}
    .team-slot.kit-ready>.team-kit-icon+.team-name{min-width:0}
    @media(max-width:760px){.team-slot.kit-ready{gap:4px}.team-kit-icon{width:1.58em;height:1.58em;flex-basis:1.58em}}
  `;
}
function icon(index,teamKey){
  const kit=KITS[index];
  const el=document.createElement('span');
  el.className='team-kit-icon';
  el.setAttribute('aria-hidden','true');
  el.dataset.kit=String(index+1).padStart(2,'0');
  el.dataset.kitVersion=VERSION;
  el.dataset.teamKey=String(teamKey);
  el.style.setProperty('--kit-bg',kit.bg);
  el.style.setProperty('--kit-collar',kit.collar);
  return el;
}
function decorateCard(card){
  const homeSlot=card.querySelector('.home-slot');
  const awaySlot=card.querySelector('.away-slot');
  const homeName=homeSlot?.querySelector('.team-name');
  const awayName=awaySlot?.querySelector('.team-name');
  if(!homeSlot||!awaySlot||!homeName||!awayName)return;
  const homeText=homeName.textContent.trim(),awayText=awayName.textContent.trim();
  const homeKey=hash(homeText),awayKey=hash(awayText);
  const homeExisting=homeSlot.querySelector('.team-kit-icon');
  const awayExisting=awaySlot.querySelector('.team-kit-icon');
  const homeCurrent=homeExisting?.dataset.kitVersion===VERSION&&homeExisting.dataset.teamKey===String(homeKey)&&homeExisting.nextElementSibling===homeName;
  const awayCurrent=awayExisting?.dataset.kitVersion===VERSION&&awayExisting.dataset.teamKey===String(awayKey)&&awayExisting.nextElementSibling===awayName;
  if(homeCurrent&&awayCurrent)return;
  homeSlot.querySelectorAll('.team-kit-icon').forEach(el=>el.remove());
  awaySlot.querySelectorAll('.team-kit-icon').forEach(el=>el.remove());
  let homeIndex=homeKey%KITS.length;
  let awayIndex=awayKey%KITS.length;
  if(awayIndex===homeIndex)awayIndex=(awayIndex+11)%KITS.length;
  homeSlot.classList.add('kit-ready');
  awaySlot.classList.add('kit-ready');
  homeSlot.insertBefore(icon(homeIndex,homeKey),homeName);
  awaySlot.insertBefore(icon(awayIndex,awayKey),awayName);
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
  observer.observe(root,{childList:true,subtree:true,characterData:true});
  window.NOMAD_TEAM_KITS_343={version:VERSION,refresh:()=>decorate(root),variantCount:KITS.length};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
