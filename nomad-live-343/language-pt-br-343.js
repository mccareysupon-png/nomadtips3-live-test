(()=>{
'use strict';
const VERSION='343-language-pt-br-v1';
const CODE='pt-BR';
const STORAGE_KEY='nomad343_language_v1';
const SELECT_ID='nomad343-language-select';

const PT=new Map(Object.entries({
  'Live Scores':'Placar ao vivo',
  'Signals':'Sinais',
  'Statistics':'Estatísticas',
  "Today's Matches":'Jogos de hoje',
  "Live scores, match statistics and Bet365 markets for today's fixtures.":'Placares ao vivo, estatísticas da partida e mercados da Bet365 para os jogos de hoje.',
  'Connecting to Live Data':'Conectando aos dados ao vivo',
  'Search teams or leagues…':'Buscar times ou ligas…',
  'Today':'Hoje',
  'Local Time':'Hora local',
  'Bet365 Live Markets':'Mercados ao vivo da Bet365',
  'Live':'Ao vivo',
  'Upcoming':'Próximos',
  'Finished':'Encerrados',
  'Unconfirmed':'Não confirmados',
  'No Live Matches':'Não há jogos ao vivo',
  "Waiting for Today's Fixtures":'Aguardando os jogos de hoje',
  'No Finished Matches':'Não há jogos encerrados',
  'No Unconfirmed Matches':'Não há jogos não confirmados',
  'No More Upcoming Matches':'Não há mais jogos próximos',
  'Select a match to view match details, statistics, event flow and Bet365 markets.':'Selecione um jogo para ver detalhes, estatísticas, fluxo da partida e mercados da Bet365.',

  'Latest Match Data':'Dados mais recentes da partida',
  'Match Statistics':'Estatísticas da partida',
  'Shots on Target':'Finalizações no gol',
  'Shots off Target':'Finalizações para fora',
  'Corners':'Escanteios',
  'Attacks':'Ataques',
  'Dangerous Attacks':'Ataques perigosos',
  'Possession':'Posse de bola',
  'Attack Percentage':'Percentual de ataques',
  'Dangerous Attack Percentage':'Percentual de ataques perigosos',
  'Possession Percentage':'Percentual de posse de bola',
  'Building Event History':'Montando o histórico de eventos',
  'No Bookmaker Odds Available':'Não há odds disponíveis da casa de apostas',
  'Building Odds Movement History':'Montando o histórico de movimento das odds',
  'Live Data Unavailable':'Dados ao vivo indisponíveis',
  'Live Data Delayed':'Dados ao vivo atrasados',
  'Live data':'Dados ao vivo',
  'Waiting for Data':'Aguardando dados',
  'Signal Locked':'Sinal bloqueado',
  'No Signal':'Sem sinal',
  'Signal —':'Sinal —',
  'Half-Time':'Intervalo',
  'Full-Time':'Fim de jogo',
  'Event Flow':'Fluxo da partida',
  'Event Flow · Match History':'Fluxo da partida · Histórico da partida',
  'Event Flow · Attack Momentum':'Fluxo da partida · Momento ofensivo',
  'Attack intensity from recent match data':'Intensidade ofensiva com base nos dados recentes da partida',
  'Attack Momentum graph':'Gráfico do momento ofensivo',
  'Odds Movement':'Movimento das odds',
  'Observed Odds':'Odds observadas',
  'Building Attack Momentum History':'Montando o histórico do momento ofensivo',
  'Loading Attack Momentum History…':'Carregando o histórico do momento ofensivo…',
  'Event Flow Unavailable':'Fluxo da partida indisponível',

  'Active Signals':'Sinais ativos',
  'Live selections with entry odds, entry score and current match status in one card.':'Seleções ao vivo com odds de entrada, placar na entrada e situação atual da partida em um único cartão.',
  'Connecting to Active Signals':'Conectando aos sinais ativos',
  'Active Matches':'Jogos com sinal',
  'One match per card':'Um jogo por cartão',
  'All markets currently being tracked':'Todos os mercados em acompanhamento',
  'Live Tracking':'Acompanhamento ao vivo',
  'Now':'Agora',
  'Minute · Score · Match Data':'Minuto · Placar · Dados da partida',
  'Results':'Resultados',
  'Settled signals move to Statistics':'Os sinais liquidados passam para Estatísticas',
  'System selections, entry odds and current match status. Select a card to view full details.':'Seleções do sistema, odds de entrada e situação atual da partida. Selecione um cartão para ver todos os detalhes.',
  'Active Only':'Somente ativos',
  'Waiting for Live Signals':'Aguardando sinais ao vivo',
  'When a signal is settled as Win, Loss or Push, it leaves this page and moves to Statistics.':'Quando um sinal é liquidado como Vitória, Derrota ou Devolvida, ele sai desta página e passa para Estatísticas.',
  'No Active Signals':'Não há sinais ativos',
  'There are no active signals right now':'Não há sinais ativos neste momento',
  'Active Signals Unavailable':'Sinais ativos indisponíveis',

  'Signal Time':'Hora do sinal',
  'Entry Score':'Placar na entrada',
  'Pick':'Seleção',
  'Line':'Linha',
  'Entry Odds':'Odds de entrada',
  'Bookmaker':'Casa de apostas',
  'Entry Match Statistics':'Estatísticas na entrada',
  'Signal Criteria':'Critérios do sinal',
  'Match statistics at signal entry':'Estatísticas da partida no momento da entrada',
  'Criteria met when the signal was created':'Critérios atendidos quando o sinal foi gerado',
  'Live Match Statistics':'Estatísticas da partida ao vivo',
  'Signal Tracker':'Acompanhamento do sinal',
  'Entry status compared with the current match':'Situação na entrada comparada com a partida atual',
  'Signal Details':'Detalhes do sinal',
  'Entry Locked':'Entrada bloqueada',
  'Technical Details':'Detalhes técnicos',
  'Provider Market':'Mercado do provedor',
  'Rolling Window':'Janela de análise',
  '5USD Raw Line':'Linha original da 5USD',
  'Feed Age':'Idade do dado',
  'Events':'Eventos',
  'Raw Card Count':'Contagem original de cartões',
  'Pass':'Atende',
  'Not Met':'Não atende',
  'Required':'Exigido',

  'Settled Signals':'Sinais liquidados',
  'Track active signals above and review settled results below.':'Acompanhe os sinais ativos acima e consulte os resultados liquidados abaixo.',
  'Connecting to Statistics':'Conectando às estatísticas',
  'Live Signal Tracker':'Acompanhamento de sinais ao vivo',
  'Live minute and score from the Signals page. Select a card to view details for an active match.':'Minuto e placar ao vivo da página de Sinais. Selecione um cartão para ver os detalhes de uma partida ativa.',
  'Waiting for Active Signals':'Aguardando sinais ativos',
  'Results already settled':'Resultados já liquidados',
  'Wins':'Vitórias',
  'Full wins':'Vitórias completas',
  'Losses':'Derrotas',
  'Full losses':'Derrotas completas',
  'Win Rate':'Taxa de acerto',
  'Push excluded · half results weighted':'Devolvidas excluídas · resultados pela metade ponderados',
  'Average Entry Odds':'Odds médias de entrada',
  'Average odds when signals were created':'Odds médias no momento em que os sinais foram gerados',
  'Results History':'Histórico de resultados',
  'Entry odds and settled results by market · Time shown in':'Odds de entrada e resultados liquidados por mercado · Horário exibido em',
  'All Market Results':'Resultados de todos os mercados',
  'Date & Time':'Data e hora',
  'League / Match':'Liga / Jogo',
  'Market':'Mercado',
  'Full-Time Score':'Placar final',
  'Result':'Resultado',
  'Waiting for Settled Results':'Aguardando resultados liquidados',
  'Supports Win, Loss, Push, Half Win and Half Loss. If required settlement data is unavailable, the result remains Unresolved.':'Suporta Vitória, Derrota, Devolvida, Meia vitória e Meia derrota. Se os dados necessários para a liquidação não estiverem disponíveis, o resultado permanece Pendente.',
  'No Settled Results Yet':'Ainda não há resultados liquidados',
  'Statistics Unavailable':'Estatísticas indisponíveis',

  'Win':'Vitória',
  'Loss':'Derrota',
  'Push':'Devolvida',
  'Half Win':'Meia vitória',
  'Half Loss':'Meia derrota',
  'Unresolved':'Pendente',
  'All Markets':'Todos os mercados',
  'Half Results':'Resultados pela metade',

  'BET365 · FULL MARKET ODDS':'BET365 · ODDS DE TODOS OS MERCADOS',
  'Match Result · Full Time':'Resultado da partida · Jogo inteiro',
  'Match Result · First Half':'Resultado da partida · Primeiro tempo',
  'Asian Handicap · Full Time':'Handicap Asiático · Jogo inteiro',
  'Asian Handicap · First Half':'Handicap Asiático · Primeiro tempo',
  'Goals Over / Under · Full Time':'Gols Mais / Menos · Jogo inteiro',
  'Goals Over / Under · First Half':'Gols Mais / Menos · Primeiro tempo',
  'Goals Over · Full Time':'Gols Mais · Jogo inteiro',
  'Goals Under · Full Time':'Gols Menos · Jogo inteiro',
  'Goals Over · First Half':'Gols Mais · Primeiro tempo',
  'Goals Under · First Half':'Gols Menos · Primeiro tempo',
  'Corners Over / Under · Full Time':'Escanteios Mais / Menos · Jogo inteiro',
  'Corners Over / Under · First Half':'Escanteios Mais / Menos · Primeiro tempo',
  'Corners Over · Full Time':'Escanteios Mais · Jogo inteiro',
  'Corners Under · Full Time':'Escanteios Menos · Jogo inteiro',
  'Corners Over · First Half':'Escanteios Mais · Primeiro tempo',
  'Corners Under · First Half':'Escanteios Menos · Primeiro tempo',
  'Corners Asian Handicap':'Handicap Asiático de escanteios',
  'Cards Over / Under · Full Time':'Cartões Mais / Menos · Jogo inteiro',
  'Cards Over · Full Time':'Cartões Mais · Jogo inteiro',
  'Cards Under · Full Time':'Cartões Menos · Jogo inteiro',
  'Cards Asian Handicap':'Handicap Asiático de cartões',
  'Both Teams to Score':'Ambas as equipes marcam',
  'Both Teams to Score · Yes':'Ambas as equipes marcam · Sim',
  'Both Teams to Score · No':'Ambas as equipes marcam · Não',
  'In-Play Odds':'Odds ao vivo',
  'Pre-Match Odds':'Odds pré-jogo',
  'Opening Odds':'Odds de abertura',
  'Home':'Mandante',
  'Away':'Visitante',
  'HOME':'Mandante',
  'AWAY':'Visitante',
  'Draw':'Empate',
  'Over':'Mais',
  'Under':'Menos',
  'Yes':'Sim',
  'No':'Não',
  'Loading':'Carregando',
  'Odds —':'Odds —',
  'Full Market Odds Unavailable':'Odds completas indisponíveis',
  'Loading Full Bet365 Lines and Odds':'Carregando linhas e odds completas da Bet365',
  'Full Market Odds Are Unavailable for This Match':'Não há odds completas disponíveis para esta partida'
}));

const RULES=[
  [/^(\d+) Active Signal(?:s)? in this match$/i,(_,n)=>`${n} sinal${Number(n)===1?'':'is'} nesta partida`],
  [/^(\d+) Signal(?:s)? · Details$/i,(_,n)=>`${n} sinal${Number(n)===1?'':'is'} · Detalhes`],
  [/^Active Signals · (\d+) match(?:es)?(?: · (\d+) signal(?:s)?)?(?: · data age (\d+)s)?$/i,(_,m,s,a)=>`Sinais ativos · ${m} jogo${Number(m)===1?'':'s'}${s?` · ${s} sinal${Number(s)===1?'':'is'}`:''}${a?` · dados de ${a} s atrás`:''}`],
  [/^(\d+) Points$/i,'$1 pontos'],
  [/^(\d+) Markets$/i,'$1 mercados'],
  [/^Half-Time\s+(.+)$/i,'Intervalo $1'],
  [/^Full Time · (.+)$/i,'Jogo inteiro · $1'],
  [/^First Half · (.+)$/i,'Primeiro tempo · $1'],
  [/^Revised from (.+?) · /i,'Revisado de $1 · '],
  [/^Attack trend from recent match data · (\d+)-minute rate · smoothed trend$/i,'Tendência ofensiva dos dados recentes · ritmo de $1 minutos · curva suavizada'],
  [/^Timeline uses observed match data · both teams measured independently$/i,'A linha do tempo usa dados observados da partida · as duas equipes são medidas separadamente'],
  [/^Momentum = Dangerous Attacks 30 · Shots on Target 25 · Attacks 20 · Shots off Target 10 · Corners 10 · Possession 5$/i,'Momento = Ataques perigosos 30 · Finalizações no gol 25 · Ataques 20 · Finalizações para fora 10 · Escanteios 10 · Posse de bola 5'],
  [/^Event Flow uses observed match history · Bookmaker odds show observed data only/i,'O fluxo da partida usa o histórico observado · as odds da casa de apostas mostram apenas dados observados'],
  [/ · this match is unconfirmed and cannot be settled$/i,' · esta partida não está confirmada e não pode ser liquidada'],
  [/\bMatch Statistics\b/g,'Estatísticas da partida'],
  [/5USD Full Market Odds/g,'Odds completas da 5USD'],
  [/\s+vs\s+/gi,' contra '],
  [/→\s*Live$/i,'→ Ao vivo'],
  [/\bHalf Win\b/g,'Meia vitória'],
  [/\bHalf Loss\b/g,'Meia derrota'],
  [/\bUnresolved\b/g,'Pendente'],
  [/\bWin\b/g,'Vitória'],
  [/\bLoss\b/g,'Derrota'],
  [/\bPush\b/g,'Devolvida'],
  [/\bNot Met\b/g,'Não atende'],
  [/\bRequired\b/g,'Exigido'],
  [/\bPass\b/g,'Atende'],
  [/·\s*Full Time\b/g,'· Jogo inteiro'],
  [/·\s*First Half\b/g,'· Primeiro tempo'],
  [/·\s*FT\b/g,'· Jogo inteiro'],
  [/·\s*HT\b/g,'· Primeiro tempo'],
  [/\bAll Markets\b/g,'Todos os mercados'],
  [/\bUnresolved (\d+)\b/gi,'Pendente $1'],
  [/ · Half Results (\d+\/\d+)$/i,' · Resultados pela metade $1']
];

const TITLES={
  live:'nomadtips3 · Placar ao vivo 3.43',
  signal:'nomadtips3 · Sinais 3.43',
  statistics:'nomadtips3 · Estatísticas 3.43'
};

const TEXT_SOURCE=new WeakMap();
const ATTR_SOURCE=new WeakMap();
let active=false;
let observer=null;
let baseApi=null;
let baseSet=null;
let baseCurrent=null;

function translate(text){
  let next=PT.get(text)??text;
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
function deactivate(code,{forward=true}={}){
  if(active)visit(document.body,'restore');active=false;
  if(forward&&baseSet)baseSet(code);else if(forward){try{localStorage.setItem(STORAGE_KEY,code)}catch{}}
}
function intercept(event){
  const select=event.target?.id===SELECT_ID?event.target:null;if(!select)return;
  const code=select.value;
  if(code===CODE){
    if(baseSet)baseSet('en');
    activate({persist:true,emit:true});
    event.stopPropagation();
    return;
  }
  if(active){
    deactivate(code,{forward:true});
    event.stopPropagation();
  }
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
  baseApi.set=code=>{
    if(code===CODE)return activate({persist:true,emit:true});
    if(active)return deactivate(code,{forward:true});
    return baseSet?baseSet(code):undefined;
  };
}
function mount(){
  patchApi();enableOption();startObserver();
  let saved='';try{saved=localStorage.getItem(STORAGE_KEY)||''}catch{}
  if(saved===CODE)activate({persist:false,emit:false});
}

window.addEventListener('change',intercept,true);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
window.NOMAD343_LANGUAGE_PT_BR={version:VERSION,code:CODE};
})();
