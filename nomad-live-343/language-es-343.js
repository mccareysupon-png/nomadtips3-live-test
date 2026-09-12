(()=>{
'use strict';
const VERSION='343-language-es-v1';
const CODE='es';
const STORAGE_KEY='nomad343_language_v1';
const SELECT_ID='nomad343-language-select';

const ES=new Map(Object.entries({
  'Live Scores':'Resultados en vivo',
  'Signals':'Señales',
  'Statistics':'Estadísticas',
  "Today's Matches":'Partidos de hoy',
  "Live scores, match statistics and Bet365 markets for today's fixtures.":'Resultados en vivo, estadísticas del partido y mercados de Bet365 para los partidos de hoy.',
  'Connecting to Live Data':'Conectando con los datos en vivo',
  'Search teams or leagues…':'Buscar equipos o ligas…',
  'Today':'Hoy',
  'Local Time':'Hora local',
  'Bet365 Live Markets':'Mercados en vivo de Bet365',
  'Live':'En vivo',
  'Upcoming':'Próximos',
  'Finished':'Finalizados',
  'Unconfirmed':'Sin confirmar',
  'No Live Matches':'No hay partidos en vivo',
  "Waiting for Today's Fixtures":'Esperando los partidos de hoy',
  'No Finished Matches':'No hay partidos finalizados',
  'No Unconfirmed Matches':'No hay partidos sin confirmar',
  'No More Upcoming Matches':'No hay más partidos próximos',
  'Select a match to view match details, statistics, event flow and Bet365 markets.':'Selecciona un partido para ver los detalles, las estadísticas, el flujo del partido y los mercados de Bet365.',

  'Latest Match Data':'Últimos datos del partido',
  'Match Statistics':'Estadísticas del partido',
  'Shots on Target':'Tiros a puerta',
  'Shots off Target':'Tiros fuera',
  'Corners':'Córners',
  'Attacks':'Ataques',
  'Dangerous Attacks':'Ataques peligrosos',
  'Possession':'Posesión',
  'Attack Percentage':'Porcentaje de ataques',
  'Dangerous Attack Percentage':'Porcentaje de ataques peligrosos',
  'Possession Percentage':'Porcentaje de posesión',
  'Building Event History':'Recopilando historial de eventos',
  'No Bookmaker Odds Available':'No hay cuotas disponibles de la casa de apuestas',
  'Building Odds Movement History':'Recopilando historial de movimientos de cuotas',
  'Live Data Unavailable':'Datos en vivo no disponibles',
  'Live Data Delayed':'Datos en vivo con retraso',
  'Live data':'Datos en vivo',
  'Waiting for Data':'Esperando datos',
  'Signal Locked':'Señal bloqueada',
  'No Signal':'Sin señal',
  'Signal —':'Señal —',
  'Half-Time':'Descanso',
  'Full-Time':'Final',
  'Event Flow':'Flujo del partido',
  'Event Flow · Match History':'Flujo del partido · Historial del partido',
  'Event Flow · Attack Momentum':'Flujo del partido · Dinámica ofensiva',
  'Attack intensity from recent match data':'Intensidad ofensiva según los datos recientes del partido',
  'Attack Momentum graph':'Gráfico de dinámica ofensiva',
  'Odds Movement':'Movimiento de cuotas',
  'Observed Odds':'Cuotas observadas',
  'Building Attack Momentum History':'Recopilando historial de dinámica ofensiva',
  'Loading Attack Momentum History…':'Cargando historial de dinámica ofensiva…',
  'Event Flow Unavailable':'Flujo del partido no disponible',

  'Active Signals':'Señales activas',
  'Live selections with entry odds, entry score and current match status in one card.':'Selecciones en vivo con cuota de entrada, marcador de entrada y estado actual del partido en una sola tarjeta.',
  'Connecting to Active Signals':'Conectando con las señales activas',
  'Active Matches':'Partidos con señal',
  'One match per card':'Un partido por tarjeta',
  'All markets currently being tracked':'Todos los mercados en seguimiento',
  'Live Tracking':'Seguimiento en vivo',
  'Now':'Ahora',
  'Minute · Score · Match Data':'Minuto · Marcador · Datos del partido',
  'Results':'Resultados',
  'Settled signals move to Statistics':'Las señales resueltas pasan a Estadísticas',
  'System selections, entry odds and current match status. Select a card to view full details.':'Selecciones del sistema, cuotas de entrada y estado actual del partido. Selecciona una tarjeta para ver todos los detalles.',
  'Active Only':'Solo activas',
  'Waiting for Live Signals':'Esperando señales en vivo',
  'When a signal is settled as Win, Loss or Push, it leaves this page and moves to Statistics.':'Cuando una señal se resuelve como Ganada, Perdida o Nula, sale de esta página y pasa a Estadísticas.',
  'No Active Signals':'No hay señales activas',
  'There are no active signals right now':'No hay señales activas en este momento',
  'Active Signals Unavailable':'Señales activas no disponibles',

  'Signal Time':'Hora de la señal',
  'Entry Score':'Marcador de entrada',
  'Pick':'Selección',
  'Line':'Línea',
  'Entry Odds':'Cuota de entrada',
  'Bookmaker':'Casa de apuestas',
  'Entry Match Statistics':'Estadísticas a la entrada',
  'Signal Criteria':'Criterios de la señal',
  'Match statistics at signal entry':'Estadísticas del partido en el momento de entrada',
  'Criteria met when the signal was created':'Criterios cumplidos al generarse la señal',
  'Live Match Statistics':'Estadísticas del partido en vivo',
  'Signal Tracker':'Seguimiento de la señal',
  'Entry status compared with the current match':'Estado de entrada comparado con el partido actual',
  'Signal Details':'Detalles de la señal',
  'Entry Locked':'Entrada bloqueada',
  'Technical Details':'Detalles técnicos',
  'Provider Market':'Mercado del proveedor',
  'Rolling Window':'Ventana de análisis',
  '5USD Raw Line':'Línea original de 5USD',
  'Feed Age':'Antigüedad del dato',
  'Events':'Eventos',
  'Raw Card Count':'Recuento original de tarjetas',
  'Pass':'Cumple',
  'Not Met':'No cumple',
  'Required':'Requerido',

  'Settled Signals':'Señales resueltas',
  'Track active signals above and review settled results below.':'Sigue las señales activas arriba y revisa los resultados resueltos abajo.',
  'Connecting to Statistics':'Conectando con las estadísticas',
  'Live Signal Tracker':'Seguimiento de señales en vivo',
  'Live minute and score from the Signals page. Select a card to view details for an active match.':'Minuto y marcador en vivo desde la página de Señales. Selecciona una tarjeta para ver los detalles de un partido activo.',
  'Waiting for Active Signals':'Esperando señales activas',
  'Results already settled':'Resultados ya resueltos',
  'Wins':'Ganadas',
  'Full wins':'Ganadas completas',
  'Losses':'Perdidas',
  'Full losses':'Perdidas completas',
  'Win Rate':'Porcentaje de acierto',
  'Push excluded · half results weighted':'Nulas excluidas · resultados medios ponderados',
  'Average Entry Odds':'Cuota media de entrada',
  'Average odds when signals were created':'Cuota media cuando se generaron las señales',
  'Results History':'Historial de resultados',
  'Entry odds and settled results by market · Time shown in':'Cuotas de entrada y resultados resueltos por mercado · Hora mostrada en',
  'All Market Results':'Resultados de todos los mercados',
  'Date & Time':'Fecha y hora',
  'League / Match':'Liga / Partido',
  'Market':'Mercado',
  'Full-Time Score':'Marcador final',
  'Result':'Resultado',
  'Waiting for Settled Results':'Esperando resultados resueltos',
  'Supports Win, Loss, Push, Half Win and Half Loss. If required settlement data is unavailable, the result remains Unresolved.':'Admite Ganada, Perdida, Nula, Media ganada y Media perdida. Si faltan datos necesarios para resolver la apuesta, el resultado queda Pendiente.',
  'No Settled Results Yet':'Aún no hay resultados resueltos',
  'Statistics Unavailable':'Estadísticas no disponibles',

  'Win':'Ganada',
  'Loss':'Perdida',
  'Push':'Nula',
  'Half Win':'Media ganada',
  'Half Loss':'Media perdida',
  'Unresolved':'Pendiente',
  'All Markets':'Todos los mercados',
  'Half Results':'Resultados medios',

  'BET365 · FULL MARKET ODDS':'BET365 · CUOTAS DE TODOS LOS MERCADOS',
  'Match Result · Full Time':'Resultado del partido · Partido completo',
  'Match Result · First Half':'Resultado del partido · Primera parte',
  'Asian Handicap · Full Time':'Hándicap asiático · Partido completo',
  'Asian Handicap · First Half':'Hándicap asiático · Primera parte',
  'Goals Over / Under · Full Time':'Goles Más / Menos · Partido completo',
  'Goals Over / Under · First Half':'Goles Más / Menos · Primera parte',
  'Goals Over · Full Time':'Goles Más · Partido completo',
  'Goals Under · Full Time':'Goles Menos · Partido completo',
  'Goals Over · First Half':'Goles Más · Primera parte',
  'Goals Under · First Half':'Goles Menos · Primera parte',
  'Corners Over / Under · Full Time':'Córners Más / Menos · Partido completo',
  'Corners Over / Under · First Half':'Córners Más / Menos · Primera parte',
  'Corners Over · Full Time':'Córners Más · Partido completo',
  'Corners Under · Full Time':'Córners Menos · Partido completo',
  'Corners Over · First Half':'Córners Más · Primera parte',
  'Corners Under · First Half':'Córners Menos · Primera parte',
  'Corners Asian Handicap':'Hándicap asiático de córners',
  'Cards Over / Under · Full Time':'Tarjetas Más / Menos · Partido completo',
  'Cards Over · Full Time':'Tarjetas Más · Partido completo',
  'Cards Under · Full Time':'Tarjetas Menos · Partido completo',
  'Cards Asian Handicap':'Hándicap asiático de tarjetas',
  'Both Teams to Score':'Ambos equipos marcan',
  'Both Teams to Score · Yes':'Ambos equipos marcan · Sí',
  'Both Teams to Score · No':'Ambos equipos marcan · No',
  'In-Play Odds':'Cuotas en vivo',
  'Pre-Match Odds':'Cuotas prepartido',
  'Opening Odds':'Cuotas de apertura',
  'Home':'Local',
  'Away':'Visitante',
  'HOME':'Local',
  'AWAY':'Visitante',
  'Draw':'Empate',
  'Over':'Más',
  'Under':'Menos',
  'Yes':'Sí',
  'No':'No',
  'Loading':'Cargando',
  'Odds —':'Cuotas —',
  'Full Market Odds Unavailable':'Cuotas completas no disponibles',
  'Loading Full Bet365 Lines and Odds':'Cargando líneas y cuotas completas de Bet365',
  'Full Market Odds Are Unavailable for This Match':'No hay cuotas completas disponibles para este partido'
}));

const RULES=[
  [/^(\d+) Active Signal(?:s)? in this match$/i,(_,n)=>`${n} señal${Number(n)===1?'':'es'} en este partido`],
  [/^(\d+) Signal(?:s)? · Details$/i,(_,n)=>`${n} señal${Number(n)===1?'':'es'} · Detalles`],
  [/^Active Signals · (\d+) match(?:es)?(?: · (\d+) signal(?:s)?)?(?: · data age (\d+)s)?$/i,(_,m,s,a)=>`Señales activas · ${m} partido${Number(m)===1?'':'s'}${s?` · ${s} señal${Number(s)===1?'':'es'}`:''}${a?` · datos de hace ${a} s`:''}`],
  [/^(\d+) Points$/i,'$1 puntos'],
  [/^(\d+) Markets$/i,'$1 mercados'],
  [/^Half-Time\s+(.+)$/i,'Descanso $1'],
  [/^Full Time · (.+)$/i,'Partido completo · $1'],
  [/^First Half · (.+)$/i,'Primera parte · $1'],
  [/^Revised from (.+?) · /i,'Revisado desde $1 · '],
  [/^Attack trend from recent match data · (\d+)-minute rate · smoothed trend$/i,'Tendencia ofensiva de los datos recientes · ritmo de $1 minutos · curva suavizada'],
  [/^Timeline uses observed match data · both teams measured independently$/i,'La línea temporal usa datos observados del partido · ambos equipos se miden por separado'],
  [/^Momentum = Dangerous Attacks 30 · Shots on Target 25 · Attacks 20 · Shots off Target 10 · Corners 10 · Possession 5$/i,'Dinámica = Ataques peligrosos 30 · Tiros a puerta 25 · Ataques 20 · Tiros fuera 10 · Córners 10 · Posesión 5'],
  [/^Event Flow uses observed match history · Bookmaker odds show observed data only/i,'El flujo del partido usa el historial observado · las cuotas de la casa de apuestas muestran solo datos observados'],
  [/ · this match is unconfirmed and cannot be settled$/i,' · este partido no está confirmado y no puede resolverse'],
  [/\bMatch Statistics\b/g,'Estadísticas del partido'],
  [/5USD Full Market Odds/g,'Cuotas completas de 5USD'],
  [/\s+vs\s+/gi,' contra '],
  [/→\s*Live$/i,'→ En vivo'],
  [/\bHalf Win\b/g,'Media ganada'],
  [/\bHalf Loss\b/g,'Media perdida'],
  [/\bUnresolved\b/g,'Pendiente'],
  [/\bWin\b/g,'Ganada'],
  [/\bLoss\b/g,'Perdida'],
  [/\bPush\b/g,'Nula'],
  [/\bNot Met\b/g,'No cumple'],
  [/\bRequired\b/g,'Requerido'],
  [/\bPass\b/g,'Cumple'],
  [/·\s*Full Time\b/g,'· Partido completo'],
  [/·\s*First Half\b/g,'· Primera parte'],
  [/·\s*FT\b/g,'· Partido completo'],
  [/·\s*HT\b/g,'· Primera parte'],
  [/\bAll Markets\b/g,'Todos los mercados'],
  [/\bUnresolved (\d+)\b/gi,'Pendiente $1'],
  [/ · Half Results (\d+\/\d+)$/i,' · Resultados medios $1']
];

const TITLES={
  live:'nomadtips3 · Resultados en vivo 3.43',
  signal:'nomadtips3 · Señales 3.43',
  statistics:'nomadtips3 · Estadísticas 3.43'
};

const TEXT_SOURCE=new WeakMap();
const ATTR_SOURCE=new WeakMap();
let active=false;
let observer=null;
let baseApi=null;
let baseSet=null;
let baseCurrent=null;

function translate(text){
  let next=ES.get(text)??text;
  for(const [pattern,replacement] of RULES)next=next.replace(pattern,replacement);
  return next;
}
function skip(el){return !el||Boolean(el.closest('[data-language-343],script,style,noscript,textarea,code,pre'))}
function translateTextNode(node){
  if(!active||!node||node.nodeType!==Node.TEXT_NODE||skip(node.parentElement))return;
  const current=node.nodeValue||'',previous=TEXT_SOURCE.get(node);
  const source=previous&&current===previous.rendered?previous.source:current;
  const rendered=translate(source);
  TEXT_SOURCE.set(node,{source,rendered});
  if(current!==rendered)node.nodeValue=rendered;
}
function restoreTextNode(node){
  if(!node||node.nodeType!==Node.TEXT_NODE||skip(node.parentElement))return;
  const previous=TEXT_SOURCE.get(node);
  if(previous&&node.nodeValue===previous.rendered)node.nodeValue=previous.source;
  TEXT_SOURCE.delete(node);
}
function translateAttribute(el,attr){
  if(!active||skip(el)||!el.hasAttribute(attr))return;
  let record=ATTR_SOURCE.get(el);if(!record){record=new Map();ATTR_SOURCE.set(el,record)}
  const current=el.getAttribute(attr)??'',previous=record.get(attr);
  const source=previous&&current===previous.rendered?previous.source:current;
  const rendered=translate(source);record.set(attr,{source,rendered});
  if(current!==rendered)el.setAttribute(attr,rendered);
}
function restoreAttribute(el,attr){
  const record=ATTR_SOURCE.get(el),previous=record?.get(attr);if(!previous)return;
  if(el.getAttribute(attr)===previous.rendered)el.setAttribute(attr,previous.source);
  record.delete(attr);
}
function visit(root,mode){
  if(!root)return;
  const textFn=mode==='restore'?restoreTextNode:translateTextNode;
  const attrFn=mode==='restore'?restoreAttribute:translateAttribute;
  if(root.nodeType===Node.TEXT_NODE){textFn(root);return}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
  const applyEl=el=>{if(skip(el))return;attrFn(el,'placeholder');attrFn(el,'aria-label');attrFn(el,'title')};
  if(root.nodeType===Node.ELEMENT_NODE)applyEl(root);
  root.querySelectorAll?.('*').forEach(applyEl);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode()))textFn(node);
}
function setTitle(){const page=document.body?.dataset.page||'';if(TITLES[page])document.title=TITLES[page]}
function enableOption(){
  const select=document.getElementById(SELECT_ID),option=select?.querySelector(`option[value="${CODE}"]`);
  if(option)option.disabled=false;
  const language=baseApi?.languages?.find?.(x=>x.code===CODE);if(language)language.ready=true;
}
function activate({persist=true,emit=true}={}){
  if(baseSet&&baseCurrent&&baseCurrent()!=='en')baseSet('en');
  active=true;enableOption();
  document.documentElement.lang=CODE;document.documentElement.dataset.language343=CODE;
  setTitle();visit(document.body,'translate');
  const select=document.getElementById(SELECT_ID);if(select)select.value=CODE;
  if(persist){try{localStorage.setItem(STORAGE_KEY,CODE)}catch{}}
  if(emit)document.dispatchEvent(new CustomEvent('nomad343:language-change',{detail:{language:CODE}}));
}
function deactivate(code){
  if(active)visit(document.body,'restore');active=false;
  if(baseSet)baseSet(code);else{try{localStorage.setItem(STORAGE_KEY,code)}catch{}}
}
function intercept(event){
  const select=event.target?.id===SELECT_ID?event.target:null;if(!select)return;
  const code=select.value;
  if(code===CODE){event.stopImmediatePropagation();activate({persist:true,emit:true});return}
  if(active){event.stopImmediatePropagation();deactivate(code)}
}
function startObserver(){
  if(observer||!document.body)return;
  observer=new MutationObserver(records=>{
    if(!active)return;
    for(const record of records){
      if(record.type==='characterData'){translateTextNode(record.target);continue}
      for(const node of record.addedNodes||[]){try{window.NOMAD343_FOOTBALL_EN?.normalize?.(node)}catch{}visit(node,'translate')}
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
}
function patchApi(){
  baseApi=window.NOMAD343_LANGUAGE||null;if(!baseApi)return;
  baseSet=typeof baseApi.set==='function'?baseApi.set.bind(baseApi):null;
  baseCurrent=typeof baseApi.current==='function'?baseApi.current.bind(baseApi):()=> 'en';
  enableOption();
  baseApi.current=()=>active?CODE:baseCurrent();
  baseApi.set=code=>code===CODE?activate({persist:true,emit:true}):deactivate(code);
}
function mount(){
  patchApi();enableOption();startObserver();
  let saved='';try{saved=localStorage.getItem(STORAGE_KEY)||''}catch{}
  if(saved===CODE)activate({persist:false,emit:false});
}

document.addEventListener('change',intercept,true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.NOMAD343_LANGUAGE_ES={version:VERSION,code:CODE};
})();
