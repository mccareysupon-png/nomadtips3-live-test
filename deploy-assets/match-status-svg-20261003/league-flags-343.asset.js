(()=>{
'use strict';
const VERSION='343-league-flags-menu-143-20261003a';
const STYLE_ID='nomad343-league-flags-style';
const FLAG_BASE='https://cdn.jsdelivr.net/npm/flag-icons@7.5.0/flags/4x3/';
const FLAG_FALLBACK='https://flagcdn.com/';
const WORLD=new Set(['international','world','worldwide','uefa','fifa','europe','global','international clubs','club international']);
const CODES={
  "afghanistan":"af",  "albania":"al",  "algeria":"dz",  "andorra":"ad",  "angola":"ao",  "argentina":"ar",
  "armenia":"am",  "australia":"au",  "austria":"at",  "azerbaijan":"az",  "bahrain":"bh",  "bangladesh":"bd",
  "belarus":"by",  "belgium":"be",  "bolivia":"bo",  "bosnia and herzegovina":"ba",  "bosnia-herzegovina":"ba",  "botswana":"bw",
  "brazil":"br",  "bulgaria":"bg",  "burkina faso":"bf",  "burundi":"bi",  "cambodia":"kh",  "cameroon":"cm",
  "canada":"ca",  "cape verde":"cv",  "cabo verde":"cv",  "chile":"cl",  "china":"cn",  "colombia":"co",
  "congo":"cg",  "congo republic":"cg",  "dr congo":"cd",  "congo dr":"cd",  "democratic republic of the congo":"cd",  "costa rica":"cr",
  "croatia":"hr",  "cuba":"cu",  "cyprus":"cy",  "czech republic":"cz",  "czechia":"cz",  "denmark":"dk",
  "dominican republic":"do",  "ecuador":"ec",  "egypt":"eg",  "el salvador":"sv",  "england":"gb-eng",  "estonia":"ee",
  "ethiopia":"et",  "faroe islands":"fo",  "finland":"fi",  "france":"fr",  "georgia":"ge",  "germany":"de",
  "ghana":"gh",  "gibraltar":"gi",  "greece":"gr",  "guatemala":"gt",  "guinea":"gn",  "honduras":"hn",
  "hong kong":"hk",  "hungary":"hu",  "iceland":"is",  "india":"in",  "indonesia":"id",  "iran":"ir",
  "iran islamic republic of":"ir",  "iraq":"iq",  "ireland":"ie",  "republic of ireland":"ie",  "israel":"il",  "italy":"it",
  "ivory coast":"ci",  "cote d ivoire":"ci",  "côte d’ivoire":"ci",  "côte d'ivoire":"ci",  "jamaica":"jm",  "japan":"jp",
  "jordan":"jo",  "kazakhstan":"kz",  "kenya":"ke",  "kosovo":"xk",  "kuwait":"kw",  "kyrgyzstan":"kg",
  "latvia":"lv",  "lebanon":"lb",  "libya":"ly",  "liechtenstein":"li",  "lithuania":"lt",  "luxembourg":"lu",
  "macau":"mo",  "macao":"mo",  "malaysia":"my",  "mali":"ml",  "malta":"mt",  "mexico":"mx",
  "moldova":"md",  "moldova republic of":"md",  "montenegro":"me",  "morocco":"ma",  "mozambique":"mz",  "myanmar":"mm",
  "netherlands":"nl",  "new zealand":"nz",  "nicaragua":"ni",  "nigeria":"ng",  "north korea":"kp",  "korea dpr":"kp",
  "north macedonia":"mk",  "northern ireland":"gb-nir",  "norway":"no",  "oman":"om",  "pakistan":"pk",  "palestine":"ps",
  "panama":"pa",  "paraguay":"py",  "peru":"pe",  "philippines":"ph",  "poland":"pl",  "portugal":"pt",
  "puerto rico":"pr",  "qatar":"qa",  "romania":"ro",  "russia":"ru",  "russian federation":"ru",  "rwanda":"rw",
  "saudi arabia":"sa",  "scotland":"gb-sct",  "senegal":"sn",  "serbia":"rs",  "singapore":"sg",  "slovakia":"sk",
  "slovenia":"si",  "south africa":"za",  "south korea":"kr",  "korea republic":"kr",  "republic of korea":"kr",  "spain":"es",
  "sudan":"sd",  "sweden":"se",  "switzerland":"ch",  "syria":"sy",  "taiwan":"tw",  "chinese taipei":"tw",
  "tajikistan":"tj",  "tanzania":"tz",  "thailand":"th",  "tunisia":"tn",  "turkey":"tr",  "türkiye":"tr",
  "turkiye":"tr",  "turkmenistan":"tm",  "uganda":"ug",  "ukraine":"ua",  "united arab emirates":"ae",  "uae":"ae",
  "united states":"us",  "united states of america":"us",  "usa":"us",  "uruguay":"uy",  "uzbekistan":"uz",  "venezuela":"ve",
  "vietnam":"vn",  "viet nam":"vn",  "wales":"gb-wls",  "zambia":"zm",  "zimbabwe":"zw"
};
const ICON_CODES=Object.freeze(["ad","ae","af","al","am","ao","ar","at","au","az","ba","bd","be","bf","bg","bh","bi","bo","br","bw","by","ca","cd","cg","ch","ci","cl","cm","cn","co","cr","cu","cv","cy","cz","de","dk","do","dz","ec","ee","eg","es","et","fi","fo","fr","gb-eng","gb-nir","gb-sct","gb-wls","ge","gh","gi","gn","gr","gt","hk","hn","hr","hu","id","ie","il","in","iq","ir","is","it","jm","jo","jp","ke","kg","kh","kp","kr","kw","kz","lb","li","lt","lu","lv","ly","ma","md","me","mk","ml","mm","mo","mt","mx","my","mz","ng","ni","nl","no","nz","om","pa","pe","ph","pk","pl","pr","ps","pt","py","qa","ro","rs","ru","rw","sa","sd","se","sg","si","sk","sv","sy","th","tj","tm","tn","tr","tw","tz","ua","ug","us","uy","uz","ve","vn","xk","za","zm","zw"]);
const clean=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
const uniqueCodes=()=>[...new Set(Object.values(CODES))].sort();
const iconUrl=code=>`${FLAG_BASE}${code}.svg`;
function verifyRegistry(){
  const actual=uniqueCodes();
  if(Object.keys(CODES).length!==167||actual.length!==143||actual.join('|')!==ICON_CODES.join('|')){
    console.error('BALL46_LEAGUE_FLAG_REGISTRY_MISMATCH',{aliases:Object.keys(CODES).length,icons:actual.length});
    return false;
  }
  return true;
}
function ensureStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .league-flag-ready{display:flex!important;align-items:center!important;gap:5px!important;min-width:0}
    .league-flag-ready>.league-flag{display:block;width:16px;height:12px;flex:0 0 16px;object-fit:cover;border-radius:2px;box-shadow:0 0 0 1px rgba(127,127,127,.18),0 1px 3px rgba(0,0,0,.14)}
    .league-flag-ready>.league-globe{display:inline-flex;width:16px;height:12px;flex:0 0 16px;align-items:center;justify-content:center;color:var(--muted,#77857c)}
    .league-flag-ready>.league-globe svg{display:block;width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:1.5}
    .league-flag-ready>.league-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    [data-league-filter]>.league-flag-ready{flex:1 1 auto}
    [data-featured-league].league-flag-ready{justify-content:flex-start}
    @media(max-width:760px){
      .league-flag-ready{gap:4px!important}
      .league-flag-ready>.league-flag,.league-flag-ready>.league-globe{width:15px;height:11px;flex-basis:15px}
      .league-flag-ready>.league-globe svg{width:11px;height:11px}
    }
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
  const placeholder=globe();
  const img=document.createElement('img');
  img.className='league-flag';
  img.alt='';
  img.setAttribute('aria-hidden','true');
  img.width=16;
  img.height=12;
  img.loading='lazy';
  img.decoding='async';
  img.referrerPolicy='no-referrer';
  let fallbackTried=false;
  img.addEventListener('load',()=>{if(placeholder.isConnected)placeholder.replaceWith(img)});
  img.addEventListener('error',()=>{
    if(!fallbackTried){fallbackTried=true;img.src=`${FLAG_FALLBACK}${code}.svg`}
  });
  img.src=iconUrl(code);
  return placeholder;
}
function decorateLine(line){
  if(!line)return;
  if(line.classList.contains('league-flag-ready')&&line.querySelector(':scope > .league-label'))return;
  const raw=line.textContent.trim();
  if(!raw)return;
  const country=raw.split(' · ')[0].trim();
  const code=codeFor(country);
  const label=document.createElement('span');
  label.className='league-label';
  label.textContent=raw;
  line.textContent='';
  line.classList.add('league-flag-ready');
  line.dataset.leagueCountry=country;
  line.dataset.leagueFlagCode=code||'unknown';
  line.append(flag(code),label);
}
function decorate(root=document){
  const selectors=[
    '[data-league-filter] > span',
    '.league-block .league-head > strong',
    '.match-card .league-scoreboard',
    '[data-featured-league]'
  ];
  root.querySelectorAll?.(selectors.join(',')).forEach(decorateLine);
}
function boot(){
  ensureStyle();
  verifyRegistry();
  decorate();
  const root=document.body;
  let queued=false;
  const observer=new MutationObserver(()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;decorate(root)});
  });
  observer.observe(root,{childList:true,subtree:true});
  window.NOMAD_LEAGUE_FLAGS_343={
    version:VERSION,
    iconCount:ICON_CODES.length,
    aliasCount:Object.keys(CODES).length,
    iconCodes:ICON_CODES,
    iconUrl,
    codeFor,
    refresh:()=>decorate(root)
  };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
