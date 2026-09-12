(()=>{
'use strict';
const VERSION='343-league-flags-v1';
const STYLE_ID='nomad343-league-flags-style';
const FLAG_BASE='https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.5.0/flags/4x3/';
const WORLD=new Set(['international','world','worldwide','uefa','fifa','europe','global','international clubs','club international']);
const CODES={
  'afghanistan':'af','albania':'al','algeria':'dz','andorra':'ad','angola':'ao','argentina':'ar','armenia':'am','australia':'au','austria':'at','azerbaijan':'az',
  'bahrain':'bh','bangladesh':'bd','belarus':'by','belgium':'be','bolivia':'bo','bosnia and herzegovina':'ba','bosnia-herzegovina':'ba','botswana':'bw','brazil':'br','bulgaria':'bg','burkina faso':'bf','burundi':'bi',
  'cambodia':'kh','cameroon':'cm','canada':'ca','cape verde':'cv','cabo verde':'cv','chile':'cl','china':'cn','colombia':'co','congo':'cg','congo republic':'cg','dr congo':'cd','congo dr':'cd','democratic republic of the congo':'cd','costa rica':'cr','croatia':'hr','cuba':'cu','cyprus':'cy','czech republic':'cz','czechia':'cz',
  'denmark':'dk','dominican republic':'do','ecuador':'ec','egypt':'eg','el salvador':'sv','england':'gb-eng','estonia':'ee','ethiopia':'et','faroe islands':'fo','finland':'fi','france':'fr',
  'georgia':'ge','germany':'de','ghana':'gh','gibraltar':'gi','greece':'gr','guatemala':'gt','guinea':'gn','honduras':'hn','hong kong':'hk','hungary':'hu',
  'iceland':'is','india':'in','indonesia':'id','iran':'ir','iran islamic republic of':'ir','iraq':'iq','ireland':'ie','republic of ireland':'ie','israel':'il','italy':'it','ivory coast':'ci','cote d ivoire':'ci','côte d’ivoire':'ci','côte d\'ivoire':'ci',
  'jamaica':'jm','japan':'jp','jordan':'jo','kazakhstan':'kz','kenya':'ke','kosovo':'xk','kuwait':'kw','kyrgyzstan':'kg',
  'latvia':'lv','lebanon':'lb','libya':'ly','liechtenstein':'li','lithuania':'lt','luxembourg':'lu','macau':'mo','macao':'mo','malaysia':'my','mali':'ml','malta':'mt','mexico':'mx','moldova':'md','moldova republic of':'md','montenegro':'me','morocco':'ma','mozambique':'mz','myanmar':'mm',
  'netherlands':'nl','new zealand':'nz','nicaragua':'ni','nigeria':'ng','north korea':'kp','korea dpr':'kp','north macedonia':'mk','northern ireland':'gb','norway':'no',
  'oman':'om','pakistan':'pk','palestine':'ps','panama':'pa','paraguay':'py','peru':'pe','philippines':'ph','poland':'pl','portugal':'pt','puerto rico':'pr','qatar':'qa',
  'romania':'ro','russia':'ru','russian federation':'ru','rwanda':'rw','saudi arabia':'sa','scotland':'gb-sct','senegal':'sn','serbia':'rs','singapore':'sg','slovakia':'sk','slovenia':'si','south africa':'za','south korea':'kr','korea republic':'kr','republic of korea':'kr','spain':'es','sudan':'sd','sweden':'se','switzerland':'ch','syria':'sy',
  'taiwan':'tw','chinese taipei':'tw','tajikistan':'tj','tanzania':'tz','thailand':'th','tunisia':'tn','turkey':'tr','türkiye':'tr','turkiye':'tr','turkmenistan':'tm','uganda':'ug','ukraine':'ua','united arab emirates':'ae','uae':'ae','united states':'us','united states of america':'us','usa':'us','uruguay':'uy','uzbekistan':'uz','venezuela':'ve','vietnam':'vn','viet nam':'vn','wales':'gb-wls','zambia':'zm','zimbabwe':'zw'
};
const clean=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .league-scoreboard.league-flag-ready{display:flex;align-items:center;gap:4px;min-width:0}
    .league-scoreboard .league-flag{width:1.08em;height:.81em;flex:0 0 1.08em;object-fit:cover;border-radius:1px;box-shadow:0 0 0 1px rgba(255,255,255,.10),0 1px 3px rgba(0,0,0,.48);filter:saturate(.90) brightness(.96)}
    .league-scoreboard .league-globe{display:inline-flex;width:1.08em;height:.81em;flex:0 0 1.08em;align-items:center;justify-content:center;color:#77857c}
    .league-scoreboard .league-globe svg{display:block;width:.88em;height:.88em;fill:none;stroke:currentColor;stroke-width:1.5}
    .league-scoreboard .league-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:760px){.league-scoreboard.league-flag-ready{gap:3px}.league-scoreboard .league-flag,.league-scoreboard .league-globe{width:1em;height:.75em;flex-basis:1em}}
  `;
  document.head.appendChild(style);
}
function globe(){
  const span=document.createElement('span');
  span.className='league-globe';
  span.setAttribute('aria-hidden','true');
  span.innerHTML='<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.5 8.2 12S9.5 18.5 12 21"/></svg>';
  return span;
}
function codeFor(country){
  const key=clean(country);
  if(!key||key==='—')return null;
  if(WORLD.has(key))return 'WORLD';
  return CODES[key]||null;
}
function flag(code){
  if(code==='WORLD'||!code)return globe();
  const img=document.createElement('img');
  img.className='league-flag';
  img.alt='';
  img.setAttribute('aria-hidden','true');
  img.loading='lazy';
  img.decoding='async';
  img.referrerPolicy='no-referrer';
  img.src=`${FLAG_BASE}${code}.svg`;
  img.addEventListener('error',()=>img.replaceWith(globe()),{once:true});
  return img;
}
function decorateLine(line){
  if(!line||line.dataset.leagueFlagDone==='1')return;
  const raw=line.textContent.trim();
  if(!raw)return;
  const country=raw.split(' · ')[0].trim();
  const code=codeFor(country);
  const label=document.createElement('span');
  label.className='league-label';
  label.textContent=raw;
  line.textContent='';
  line.classList.add('league-flag-ready');
  line.dataset.leagueFlagDone='1';
  line.dataset.leagueCountry=country;
  line.dataset.leagueFlagCode=code||'unknown';
  line.appendChild(flag(code));
  line.appendChild(label);
}
function decorate(root=document){
  root.querySelectorAll?.('.match-card .league-scoreboard').forEach(decorateLine);
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
  window.NOMAD_LEAGUE_FLAGS_343={version:VERSION,refresh:()=>decorate(root),codeFor};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
