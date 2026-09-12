(()=>{
'use strict';
const VERSION='343-football-english-v1';

const EXACT=new Map(Object.entries({
  'ยิงเข้ากรอบ':'Shots on Target',
  'ยิงไม่เข้ากรอบ':'Shots off Target',
  'เตะมุม':'Corners',
  'การบุก':'Attacks',
  'การบุกอันตราย':'Dangerous Attacks',
  'ครองบอล':'Possession',
  'ข้อมูลล่าสุดที่ตรวจพบ':'Latest Match Data',
  'กำลังสะสม Event ที่ตรวจพบจริง':'Building Event History',
  'ยังไม่มีราคาจาก Bookmaker ที่ตรวจพบ':'No Bookmaker Odds Available',
  'กำลังสะสมการเปลี่ยนแปลงราคาที่ตรวจพบจริง':'Building Odds Movement History',
  'ข้อมูลสดไม่พร้อม':'Live Data Unavailable',
  'ข้อมูลล่าช้า':'Live Data Delayed',
  'ยังไม่มีคู่กำลังแข่งขัน':'No Live Matches',
  'ไม่มีคู่รอเตะเพิ่มเติม':'No More Upcoming Matches',
  'ไม่มีคู่ที่ผลหรือสถานะยังไม่ยืนยัน':'No Unconfirmed Matches',
  'ยังไม่มีคู่จบการแข่งขัน':'No Finished Matches',
  'กำลังสะสมประวัติการบุกของคู่นี้':'Building Attack Momentum History',
  'กำลังโหลด Attack Momentum จาก Engine history…':'Loading Attack Momentum History…',
  'ไม่มี Live Statisticsจาก feed':'Live Match Statistics Unavailable',
  'ไม่มีสถิติตอนออก Signalจาก feed':'Entry Match Statistics Unavailable',
  'ไม่มีข้อมูลเหตุผลของ Signal':'Signal Criteria Unavailable',
  'ไม่มีรายละเอียดเงื่อนไขรายข้อ':'Detailed Signal Criteria Unavailable',
  'สถิติตอนระบบออก Signal':'Match statistics at signal entry',
  'เงื่อนไขที่ผ่านตอนออก Signal':'Criteria met when the signal was created',
  'ตอนออก Signal เทียบกับสถานะปัจจุบัน':'Entry status compared with the current match',
  'ยังไม่มี Signal ที่กำลังแข่งขันอยู่':'There are no active signals right now',
  'Active Signal Board ไม่พร้อม':'Active Signals Unavailable',
  'ยังไม่มีสัญญาณที่จบการแข่งขันและตัดสินผลแล้ว':'No Settled Results Yet',
  'ข้อมูลสถิติไม่พร้อม':'Statistics Unavailable',
  'กำลังโหลด Line + Odds เต็มจาก Bet365':'Loading Full Bet365 Lines and Odds',
  'ไม่มีราคาน้ำเต็มจากต้นทางในรอบนี้':'Full Market Odds Are Unavailable for This Match',

  'ATTACKS':'Attacks',
  'DANGEROUS':'Dangerous Attacks',
  'SOT':'Shots on Target',
  'SHOT OFF':'Shots off Target',
  'CORNERS':'Corners',
  'POSSESSION':'Possession',
  'ATTACK %':'Attack Percentage',
  'DANGEROUS %':'Dangerous Attack Percentage',
  'POSSESSION %':'Possession Percentage',

  'SIGNAL AT':'Signal Time',
  'SCORE':'Entry Score',
  'SCORE AT SIGNAL':'Entry Score',
  'PICK':'Pick',
  'LINE':'Line',
  'ODDS AT SIGNAL':'Entry Odds',
  'BOOKMAKER':'Bookmaker',
  'MATCH STATS AT SIGNAL':'Entry Match Statistics',
  'WHY THIS SIGNAL':'Signal Criteria',
  'LIVE NOW':'Live',
  'LIVE MATCH STATISTICS':'Live Match Statistics',
  'SIGNAL TRACKER':'Signal Tracker',
  'SIGNAL DETAILS':'Signal Details',
  'ENTRY LOCKED':'Entry Locked',
  'NO ACTIVE SIGNAL':'No Active Signals',
  'ACTIVE ONLY':'Active Only',
  'LIVE MIRROR':'Live Tracking',
  'ALL MARKET RESULTS':'All Market Results',

  'Source / technical details':'Technical Details',
  'PROVIDER MARKET':'Provider Market',
  'ROLLING WINDOW':'Rolling Window',
  '5USD RAW LINE':'5USD Raw Line',
  'FEED AGE':'Feed Age',
  'EVENTS':'Events',
  'CARDS RAW COUNT':'Raw Card Count',

  'Bookmaker Price Flow':'Odds Movement',
  'Actual observations':'Observed Odds',
  'EVENT FLOW · ATTACK MOMENTUM':'Event Flow · Attack Momentum',
  'Engine history · independent 1–100 attack intensity':'Attack intensity from recent match data',
  'WAIT':'Waiting for Data',

  'HT':'Half-Time',
  'FT':'Full-Time',
  'LIVE':'Live',
  'FINISHED':'Finished',
  'UNCONFIRMED':'Unconfirmed',
  'WAITING':'Waiting',
  'SIGNAL LOCKED':'Signal Locked',
  'NO SIGNAL':'No Signal',
  'SIGNAL —':'Signal —',
  'WIN':'Win',
  'LOSS':'Loss',
  'PUSH':'Push',
  'HALF_WIN':'Half Win',
  'HALF_LOSS':'Half Loss',
  'UNRESOLVED':'Unresolved',

  'BET365 · FULL ODDS':'BET365 · FULL MARKET ODDS',
  '1X2 · Full Time':'Match Result · Full Time',
  '1X2 · 1st Half':'Match Result · First Half',
  'Asian Handicap · Full Time':'Asian Handicap · Full Time',
  'Asian Handicap · 1st Half':'Asian Handicap · First Half',
  'Goals O/U · Full Time':'Goals Over / Under · Full Time',
  'Goals O/U · 1st Half':'Goals Over / Under · First Half',
  'Corners O/U · Full Time':'Corners Over / Under · Full Time',
  'Corners O/U · 1st Half':'Corners Over / Under · First Half',
  'Corner Asian Handicap':'Corners Asian Handicap',
  'Cards O/U · Full Time':'Cards Over / Under · Full Time',
  'Card Asian Handicap':'Cards Asian Handicap',
  'Both Teams To Score':'Both Teams to Score',
  'Goals OVER · Full Time':'Goals Over · Full Time',
  'Goals UNDER · Full Time':'Goals Under · Full Time',
  'Goals OVER · 1st Half':'Goals Over · First Half',
  'Goals UNDER · 1st Half':'Goals Under · First Half',
  'Corners OVER · Full Time':'Corners Over · Full Time',
  'Corners UNDER · Full Time':'Corners Under · Full Time',
  'Corners OVER · 1st Half':'Corners Over · First Half',
  'Corners UNDER · 1st Half':'Corners Under · First Half',
  'Cards OVER · Full Time':'Cards Over · Full Time',
  'Cards UNDER · Full Time':'Cards Under · Full Time',
  'BTTS · YES':'Both Teams to Score · Yes',
  'BTTS · NO':'Both Teams to Score · No',
  'IN-PLAY':'In-Play Odds',
  'PRE-MATCH':'Pre-Match Odds',
  'OPENING':'Opening Odds',
  'DRAW':'Draw',
  'OVER':'Over',
  'UNDER':'Under',
  'YES':'Yes',
  'NO':'No'
}));

const RULES=[
  [/^HT\s+(.+)$/,'Half-Time $1'],
  [/^FT\s+·\s+(.+)$/,'Full Time · $1'],
  [/^HT\s+·\s+(.+)$/,'First Half · $1'],
  [/\s+ในแมตช์นี้$/,' in this match'],
  [/^Active Signal Board\s+·/,'Active Signals ·'],
  [/\bfeed age\b/gi,'data age'],
  [/\bALL MARKETS\b/g,'All Markets'],
  [/\bUNRESOLVED\s+(\d+)\b/g,'Unresolved $1'],
  [/\s+·\s+HALF\s+(\d+\/\d+)$/,' · Half Results $1'],
  [/^(\d+)\s+SIGNAL(S?)\s+·\s+DETAILS$/i,(_,n,s)=>`${n} Signal${s?'s':''} · Details`],
  [/^(\d+)\s+PTS$/i,'$1 Points'],
  [/^Event Flow ยังไม่พร้อม\s+·\s*/,'Event Flow Unavailable · '],
  [/^แก้จาก\s+(.+?)\s+·\s*/,'Revised from $1 · '],
  [/^เทียบการบุกจากช่วงข้อมูลใหม่ต่อช่วง\s+·\s+ปรับเป็นอัตรา\s+(\d+)\s+นาที\s+·\s+Smooth EMA$/,'Attack trend from recent match data · $1-minute rate · smoothed trend'],
  [/^แกนเวลาใช้ timestamp จริง\s+·\s+ไม่ย้อนจากนาทีซ้ำ\/นาทีหาย\s+·\s+สองทีมวัดอิสระ$/,'Timeline uses observed match data · both teams measured independently'],
  [/^Momentum = DANGER 30 · SOT 25 · ATTACK 20 · OFF 10 · CORNER 10 · POSSESSION 5$/,'Momentum = Dangerous Attacks 30 · Shots on Target 25 · Attacks 20 · Shots off Target 10 · Corners 10 · Possession 5'],
  [/^Event Flow ใช้ประวัติกลางจาก Engine\s+·\s+ราคา Bookmaker แสดงเฉพาะข้อมูลที่ตรวจพบจริง/,'Event Flow uses observed match history · Bookmaker odds show observed data only'],
  [/\s+·\s+ผลคู่นี้ยังไม่ยืนยัน จึงห้าม Settlement$/,' · this match is unconfirmed and cannot be settled'],
  [/\bFT\s+·/g,'Full Time ·'],
  [/\bHT\s+·/g,'First Half ·']
];

function transform(text){
  const lead=text.match(/^\s*/)?.[0]||'';
  const trail=text.match(/\s*$/)?.[0]||'';
  const core=text.slice(lead.length,text.length-trail.length);
  if(!core)return text;
  let next=EXACT.get(core)??core;
  for(const [pattern,replacement] of RULES)next=next.replace(pattern,replacement);
  return lead+next+trail;
}

function translateText(node){
  if(!node||node.nodeType!==Node.TEXT_NODE)return;
  const parent=node.parentElement;
  if(!parent||parent.closest('script,style,noscript,textarea'))return;
  const next=transform(node.nodeValue||'');
  if(next!==node.nodeValue)node.nodeValue=next;
}

function normalize(root){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){translateText(root);return}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode()))translateText(node);
  root.querySelectorAll?.('[aria-label="Bookmaker Price Flow"]').forEach(el=>el.setAttribute('aria-label','Odds Movement'));
}

function start(){
  const root=document.querySelector('main.shell');
  if(!root)return;
  normalize(root);
  const observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')translateText(record.target);
      for(const node of record.addedNodes||[])normalize(node);
    }
  });
  observer.observe(root,{subtree:true,childList:true,characterData:true});
  window.NOMAD343_FOOTBALL_EN={version:VERSION,normalize};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
else start();
})();
