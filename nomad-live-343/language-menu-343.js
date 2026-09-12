(()=>{
'use strict';
const VERSION='343-language-menu-v3-thai-freeze';
const STORAGE_KEY='nomad343_language_v1';
const BASE_STANDARD='Football Language Standard 3.43 · English v1';
const LANGUAGES=[
  {code:'en',label:'English',ready:true},
  {code:'es',label:'Español',ready:false},
  {code:'pt-BR',label:'Português (Brasil)',ready:false},
  {code:'fr',label:'Français',ready:false},
  {code:'ar',label:'العربية',ready:false},
  {code:'id',label:'Bahasa Indonesia',ready:false},
  {code:'th',label:'ไทย',ready:true}
];

const THAI=new Map(Object.entries({
  'Live Scores':'ผลบอลสด',
  'Signals':'สัญญาณ',
  'Statistics':'สถิติ',
  "Today's Matches":'การแข่งขันวันนี้',
  "Live scores, match statistics and Bet365 markets for today's fixtures.":'ผลบอลสด สถิติการแข่งขัน และตลาด Bet365 สำหรับการแข่งขันวันนี้',
  'Connecting to Live Data':'กำลังเชื่อมต่อข้อมูลสด',
  'Search teams or leagues…':'ค้นหาทีมหรือลีก…',
  'Today':'วันนี้',
  'Local Time':'เวลาท้องถิ่น',
  'Bet365 Live Markets':'ตลาดสด Bet365',
  'Live':'กำลังแข่งขัน',
  'Upcoming':'รอแข่งขัน',
  'Finished':'จบแล้ว',
  'Unconfirmed':'รอยืนยัน',
  'No Live Matches':'ยังไม่มีคู่ที่กำลังแข่งขัน',
  "Waiting for Today's Fixtures":'กำลังรอรายการแข่งขันวันนี้',
  'No Finished Matches':'ยังไม่มีคู่ที่จบแล้ว',
  'No Unconfirmed Matches':'ไม่มีคู่ที่รอยืนยัน',
  'No More Upcoming Matches':'ไม่มีคู่รอแข่งขันเพิ่มเติม',
  'Select a match to view match details, statistics, event flow and Bet365 markets.':'เลือกคู่การแข่งขันเพื่อดูรายละเอียด สถิติ ลำดับเหตุการณ์ และตลาด Bet365',

  'Latest Match Data':'ข้อมูลการแข่งขันล่าสุด',
  'Match Statistics':'สถิติการแข่งขัน',
  'Shots on Target':'ยิงตรงกรอบ',
  'Shots off Target':'ยิงออกกรอบ',
  'Corners':'ลูกเตะมุม',
  'Attacks':'จำนวนบุก',
  'Dangerous Attacks':'บุกอันตราย',
  'Possession':'เปอร์เซ็นต์ครองบอล',
  'Attack Percentage':'เปอร์เซ็นต์การบุก',
  'Dangerous Attack Percentage':'เปอร์เซ็นต์การบุกอันตราย',
  'Possession Percentage':'เปอร์เซ็นต์การครองบอล',
  'Building Event History':'กำลังรวบรวมประวัติเหตุการณ์',
  'No Bookmaker Odds Available':'ยังไม่มีอัตราจ่ายจากเจ้ามือรับเดิมพัน',
  'Building Odds Movement History':'กำลังรวบรวมประวัติการไหลของอัตราจ่าย',
  'Live Data Unavailable':'ข้อมูลสดยังไม่พร้อม',
  'Live Data Delayed':'ข้อมูลสดล่าช้า',
  'Live data':'ข้อมูลสด',
  'Waiting for Data':'กำลังรอข้อมูล',
  'Signal Locked':'ล็อกสัญญาณแล้ว',
  'No Signal':'ไม่มีสัญญาณ',
  'Signal —':'สัญญาณ —',
  'Half-Time':'พักครึ่ง',
  'Full-Time':'เต็มเวลา',
  'Event Flow':'ลำดับเหตุการณ์',
  'Event Flow · Match History':'ลำดับเหตุการณ์ · ประวัติการแข่งขัน',
  'Event Flow · Attack Momentum':'ลำดับเหตุการณ์ · โมเมนตัมการบุก',
  'Attack intensity from recent match data':'ความเข้มข้นของการบุกจากข้อมูลการแข่งขันล่าสุด',
  'Attack Momentum graph':'กราฟโมเมนตัมการบุก',
  'Odds Movement':'การไหลของอัตราจ่าย',
  'Observed Odds':'อัตราจ่ายที่ตรวจพบ',
  'Building Attack Momentum History':'กำลังรวบรวมประวัติโมเมนตัมการบุก',
  'Loading Attack Momentum History…':'กำลังโหลดประวัติโมเมนตัมการบุก…',
  'Event Flow Unavailable':'ลำดับเหตุการณ์ยังไม่พร้อม',

  'Active Signals':'สัญญาณที่กำลังใช้งาน',
  'Live selections with entry odds, entry score and current match status in one card.':'ตัวเลือกสด พร้อมอัตราจ่ายตอนเข้า สกอร์ตอนเข้า และสถานะการแข่งขันปัจจุบันในหนึ่งการ์ด',
  'Connecting to Active Signals':'กำลังเชื่อมต่อสัญญาณที่กำลังใช้งาน',
  'Active Matches':'คู่ที่มีสัญญาณ',
  'One match per card':'หนึ่งคู่ต่อหนึ่งการ์ด',
  'All markets currently being tracked':'ทุกตลาดที่ระบบกำลังติดตาม',
  'Live Tracking':'ติดตามสด',
  'Now':'ปัจจุบัน',
  'Minute · Score · Match Data':'นาที · สกอร์ · ข้อมูลการแข่งขัน',
  'Results':'ผลลัพธ์',
  'Settled signals move to Statistics':'สัญญาณที่ตัดสินผลแล้วจะย้ายไปหน้าสถิติ',
  'System selections, entry odds and current match status. Select a card to view full details.':'ตัวเลือกจากระบบ อัตราจ่ายตอนเข้า และสถานะการแข่งขันปัจจุบัน เลือกการ์ดเพื่อดูรายละเอียดทั้งหมด',
  'Active Only':'เฉพาะที่กำลังใช้งาน',
  'Waiting for Live Signals':'กำลังรอสัญญาณสด',
  'When a signal is settled as Win, Loss or Push, it leaves this page and moves to Statistics.':'เมื่อสัญญาณตัดสินผลเป็น ชนะ แพ้ หรือเสมอราคา สัญญาณจะออกจากหน้านี้และย้ายไปหน้าสถิติ',
  'No Active Signals':'ไม่มีสัญญาณที่กำลังใช้งาน',
  'There are no active signals right now':'ขณะนี้ไม่มีสัญญาณที่กำลังใช้งาน',
  'Active Signals Unavailable':'ข้อมูลสัญญาณที่กำลังใช้งานยังไม่พร้อม',

  'Signal Time':'เวลาที่ออกสัญญาณ',
  'Entry Score':'สกอร์ตอนเข้า',
  'Pick':'ตัวเลือก',
  'Line':'เส้นราคา',
  'Entry Odds':'อัตราจ่ายตอนเข้า',
  'Bookmaker':'เจ้ามือรับเดิมพัน',
  'Entry Match Statistics':'สถิติตอนเข้า',
  'Signal Criteria':'เงื่อนไขสัญญาณ',
  'Match statistics at signal entry':'สถิติการแข่งขันในขณะที่ระบบออกสัญญาณ',
  'Criteria met when the signal was created':'เงื่อนไขที่ผ่านในขณะที่ระบบออกสัญญาณ',
  'Live Match Statistics':'สถิติการแข่งขันสด',
  'Signal Tracker':'ติดตามสัญญาณ',
  'Entry status compared with the current match':'สถานะตอนเข้าเทียบกับการแข่งขันปัจจุบัน',
  'Signal Details':'รายละเอียดสัญญาณ',
  'Entry Locked':'ล็อกข้อมูลตอนเข้า',
  'Technical Details':'รายละเอียดทางเทคนิค',
  'Provider Market':'ตลาดจากผู้ให้ข้อมูล',
  'Rolling Window':'ช่วงเวลาตรวจจับ',
  '5USD Raw Line':'เส้นราคาดิบจาก 5USD',
  'Feed Age':'อายุข้อมูล',
  'Events':'เหตุการณ์',
  'Raw Card Count':'จำนวนใบจากข้อมูลดิบ',
  'Pass':'ผ่าน',
  'Not Met':'ไม่ผ่าน',
  'Required':'เกณฑ์',

  'Settled Signals':'สัญญาณที่ตัดสินผลแล้ว',
  'Track active signals above and review settled results below.':'ติดตามสัญญาณที่กำลังใช้งานด้านบน และตรวจผลที่ตัดสินแล้วด้านล่าง',
  'Connecting to Statistics':'กำลังเชื่อมต่อข้อมูลสถิติ',
  'Live Signal Tracker':'ติดตามสัญญาณสด',
  'Live minute and score from the Signals page. Select a card to view details for an active match.':'นาทีและสกอร์สดจากหน้าสัญญาณ เลือกการ์ดเพื่อดูรายละเอียดของคู่ที่กำลังแข่งขัน',
  'Waiting for Active Signals':'กำลังรอสัญญาณที่กำลังใช้งาน',
  'Results already settled':'ผลที่ตัดสินเรียบร้อยแล้ว',
  'Wins':'ชนะ',
  'Full wins':'ชนะเต็ม',
  'Losses':'แพ้',
  'Full losses':'แพ้เต็ม',
  'Win Rate':'อัตราชนะ',
  'Push excluded · half results weighted':'ไม่รวมเสมอราคา · คิดน้ำหนักผลครึ่ง',
  'Average Entry Odds':'อัตราจ่ายเฉลี่ยตอนเข้า',
  'Average odds when signals were created':'อัตราจ่ายเฉลี่ยในขณะที่ระบบออกสัญญาณ',
  'Results History':'ประวัติผลลัพธ์',
  'Entry odds and settled results by market · Time shown in':'อัตราจ่ายตอนเข้าและผลที่ตัดสินแล้วแยกตามตลาด · เวลาแสดงตาม',
  'All Market Results':'ผลทุกตลาด',
  'Date & Time':'วันที่และเวลา',
  'League / Match':'ลีก / คู่แข่งขัน',
  'Market':'ตลาด',
  'Full-Time Score':'สกอร์เต็มเวลา',
  'Result':'ผล',
  'Waiting for Settled Results':'กำลังรอผลที่ตัดสินแล้ว',
  'Supports Win, Loss, Push, Half Win and Half Loss. If required settlement data is unavailable, the result remains Unresolved.':'รองรับ ชนะ แพ้ เสมอราคา ชนะครึ่ง และแพ้ครึ่ง หากข้อมูลที่ใช้ตัดสินผลไม่ครบ ผลจะคงสถานะรอการตัดสิน',
  'No Settled Results Yet':'ยังไม่มีผลที่ตัดสินแล้ว',
  'Statistics Unavailable':'ข้อมูลสถิติยังไม่พร้อม',

  'Win':'ชนะ',
  'Loss':'แพ้',
  'Push':'เสมอราคา',
  'Half Win':'ชนะครึ่ง',
  'Half Loss':'แพ้ครึ่ง',
  'Unresolved':'รอการตัดสิน',
  'All Markets':'ทุกตลาด',
  'Half Results':'ผลครึ่ง',

  'BET365 · FULL MARKET ODDS':'BET365 · อัตราจ่ายครบทุกตลาด',
  'Match Result · Full Time':'ผลการแข่งขัน · เต็มเวลา',
  'Match Result · First Half':'ผลการแข่งขัน · ครึ่งแรก',
  'Asian Handicap · Full Time':'เอเชียนแฮนดิแคป · เต็มเวลา',
  'Asian Handicap · First Half':'เอเชียนแฮนดิแคป · ครึ่งแรก',
  'Goals Over / Under · Full Time':'ประตู สูง / ต่ำ · เต็มเวลา',
  'Goals Over / Under · First Half':'ประตู สูง / ต่ำ · ครึ่งแรก',
  'Goals Over · Full Time':'ประตู สูง · เต็มเวลา',
  'Goals Under · Full Time':'ประตู ต่ำ · เต็มเวลา',
  'Goals Over · First Half':'ประตู สูง · ครึ่งแรก',
  'Goals Under · First Half':'ประตู ต่ำ · ครึ่งแรก',
  'Corners Over / Under · Full Time':'ลูกเตะมุม สูง / ต่ำ · เต็มเวลา',
  'Corners Over / Under · First Half':'ลูกเตะมุม สูง / ต่ำ · ครึ่งแรก',
  'Corners Over · Full Time':'ลูกเตะมุม สูง · เต็มเวลา',
  'Corners Under · Full Time':'ลูกเตะมุม ต่ำ · เต็มเวลา',
  'Corners Over · First Half':'ลูกเตะมุม สูง · ครึ่งแรก',
  'Corners Under · First Half':'ลูกเตะมุม ต่ำ · ครึ่งแรก',
  'Corners Asian Handicap':'เอเชียนแฮนดิแคปลูกเตะมุม',
  'Cards Over / Under · Full Time':'ใบ สูง / ต่ำ · เต็มเวลา',
  'Cards Over · Full Time':'ใบ สูง · เต็มเวลา',
  'Cards Under · Full Time':'ใบ ต่ำ · เต็มเวลา',
  'Cards Asian Handicap':'เอเชียนแฮนดิแคปใบ',
  'Both Teams to Score':'ทั้งสองทีมทำประตู',
  'Both Teams to Score · Yes':'ทั้งสองทีมทำประตู · ใช่',
  'Both Teams to Score · No':'ทั้งสองทีมทำประตู · ไม่ใช่',
  'In-Play Odds':'อัตราจ่ายระหว่างแข่ง',
  'Pre-Match Odds':'อัตราจ่ายก่อนแข่ง',
  'Opening Odds':'อัตราจ่ายเปิดตลาด',
  'Home':'เจ้าบ้าน',
  'Away':'ทีมเยือน',
  'HOME':'เจ้าบ้าน',
  'AWAY':'ทีมเยือน',
  'Draw':'เสมอ',
  'Over':'สูง',
  'Under':'ต่ำ',
  'Yes':'ใช่',
  'No':'ไม่ใช่',
  'Loading':'กำลังโหลด',
  'Odds —':'อัตราจ่าย —',
  'Full Market Odds Unavailable':'ยังไม่มีอัตราจ่ายครบทุกตลาด',
  'Loading Full Bet365 Lines and Odds':'กำลังโหลดเส้นราคาและอัตราจ่ายครบจาก Bet365',
  'Full Market Odds Are Unavailable for This Match':'คู่นี้ยังไม่มีอัตราจ่ายครบจากต้นทาง'
}));

const THAI_RULES=[
  [/^(\d+) Active Signal(?:s)? in this match$/i,'$1 สัญญาณในคู่นี้'],
  [/^(\d+) Signal(?:s)? · Details$/i,'$1 สัญญาณ · รายละเอียด'],
  [/^Active Signals · (\d+) match(?:es)?(?: · (\d+) signal(?:s)?)?(?: · data age (\d+)s)?$/i,(_,m,s,a)=>`สัญญาณที่กำลังใช้งาน · ${m} คู่${s?` · ${s} สัญญาณ`:''}${a?` · อายุข้อมูล ${a} วินาที`:''}`],
  [/^(\d+) Points$/i,'$1 คะแนน'],
  [/^(\d+) Markets$/i,'$1 ตลาด'],
  [/^Half-Time\s+(.+)$/i,'พักครึ่ง $1'],
  [/^Full Time · (.+)$/i,'เต็มเวลา · $1'],
  [/^First Half · (.+)$/i,'ครึ่งแรก · $1'],
  [/^Revised from (.+?) · /i,'ปรับจาก $1 · '],
  [/^Attack trend from recent match data · (\d+)-minute rate · smoothed trend$/i,'แนวโน้มการบุกจากข้อมูลล่าสุด · อัตราต่อ $1 นาที · ปรับเส้นให้เรียบ'],
  [/^Timeline uses observed match data · both teams measured independently$/i,'แกนเวลาใช้ข้อมูลการแข่งขันที่ตรวจพบ · วัดทั้งสองทีมแยกจากกัน'],
  [/^Momentum = Dangerous Attacks 30 · Shots on Target 25 · Attacks 20 · Shots off Target 10 · Corners 10 · Possession 5$/i,'โมเมนตัม = บุกอันตราย 30 · ยิงตรงกรอบ 25 · จำนวนบุก 20 · ยิงออกกรอบ 10 · ลูกเตะมุม 10 · ครองบอล 5'],
  [/^Event Flow uses observed match history · Bookmaker odds show observed data only/i,'ลำดับเหตุการณ์ใช้ประวัติการแข่งขันที่ตรวจพบ · อัตราจ่ายจากเจ้ามือแสดงเฉพาะข้อมูลที่ตรวจพบจริง'],
  [/ · this match is unconfirmed and cannot be settled$/i,' · คู่นี้ยังไม่ยืนยัน จึงยังตัดสินผลไม่ได้'],
  [/\bMatch Statistics\b/g,'สถิติการแข่งขัน'],
  [/5USD Full Market Odds/g,'อัตราจ่ายครบทุกตลาดจาก 5USD'],
  [/\s+vs\s+/gi,' พบ '],
  [/→\s*Live$/i,'→ กำลังแข่งขัน'],
  [/\bHalf Win\b/g,'ชนะครึ่ง'],
  [/\bHalf Loss\b/g,'แพ้ครึ่ง'],
  [/\bUnresolved\b/g,'รอการตัดสิน'],
  [/\bWin\b/g,'ชนะ'],
  [/\bLoss\b/g,'แพ้'],
  [/\bPush\b/g,'เสมอราคา'],
  [/\bNot Met\b/g,'ไม่ผ่าน'],
  [/\bRequired\b/g,'เกณฑ์'],
  [/\bPass\b/g,'ผ่าน'],
  [/·\s*Full Time\b/g,'· เต็มเวลา'],
  [/·\s*First Half\b/g,'· ครึ่งแรก'],
  [/\bAll Markets\b/g,'ทุกตลาด'],
  [/\bUnresolved (\d+)\b/gi,'รอการตัดสิน $1'],
  [/ · Half Results (\d+\/\d+)$/i,' · ผลครึ่ง $1']
];

const TITLE_TH={
  live:'nomadtips3 · ผลบอลสด 3.43',
  signal:'nomadtips3 · สัญญาณ 3.43',
  statistics:'nomadtips3 · สถิติ 3.43'
};
const TITLE_EN={
  live:'nomadtips3 · Live Scores 3.43',
  signal:'nomadtips3 · Signals 3.43',
  statistics:'nomadtips3 · Statistics 3.43'
};

const TEXT_SOURCE=new WeakMap();
const ATTR_SOURCE=new WeakMap();
let currentLanguage='en';
let observer=null;

function safeStoredLanguage(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    const found=LANGUAGES.find(x=>x.code===saved&&x.ready);
    return found?.code||'en';
  }catch{return'en'}
}

function thaiText(text){
  let next=THAI.get(text)??text;
  for(const [pattern,replacement] of THAI_RULES)next=next.replace(pattern,replacement);
  return next;
}

function translated(text,language){
  return language==='th'?thaiText(text):text;
}

function skipElement(el){
  return !el||Boolean(el.closest('[data-language-343],script,style,noscript,textarea,code,pre'));
}

function translateTextNode(node){
  if(!node||node.nodeType!==Node.TEXT_NODE||skipElement(node.parentElement))return;
  const current=node.nodeValue||'';
  const previous=TEXT_SOURCE.get(node);
  const source=previous&&current===previous.rendered?previous.source:current;
  const rendered=translated(source,currentLanguage);
  TEXT_SOURCE.set(node,{source,rendered});
  if(current!==rendered)node.nodeValue=rendered;
}

function translateAttribute(el,attr){
  if(skipElement(el)||!el.hasAttribute(attr))return;
  let record=ATTR_SOURCE.get(el);
  if(!record){record=new Map();ATTR_SOURCE.set(el,record)}
  const current=el.getAttribute(attr)??'';
  const previous=record.get(attr);
  const source=previous&&current===previous.rendered?previous.source:current;
  const rendered=translated(source,currentLanguage);
  record.set(attr,{source,rendered});
  if(current!==rendered)el.setAttribute(attr,rendered);
}

function translateElement(el){
  if(!el||el.nodeType!==Node.ELEMENT_NODE||skipElement(el))return;
  translateAttribute(el,'placeholder');
  translateAttribute(el,'aria-label');
  translateAttribute(el,'title');
}

function applyTree(root){
  if(!root)return;
  if(root.nodeType===Node.TEXT_NODE){translateTextNode(root);return}
  if(root.nodeType!==Node.ELEMENT_NODE&&root.nodeType!==Node.DOCUMENT_FRAGMENT_NODE&&root.nodeType!==Node.DOCUMENT_NODE)return;
  if(root.nodeType===Node.ELEMENT_NODE)translateElement(root);
  root.querySelectorAll?.('*').forEach(translateElement);
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  let node;
  while((node=walker.nextNode()))translateTextNode(node);
}

function updateTitle(){
  const page=document.body?.dataset.page||'';
  const titles=currentLanguage==='th'?TITLE_TH:TITLE_EN;
  if(titles[page])document.title=titles[page];
}

function setLanguage(code,{persist=false,emit=false}={}){
  const chosen=LANGUAGES.find(x=>x.code===code&&x.ready);
  currentLanguage=chosen?.code||'en';
  document.documentElement.lang=currentLanguage;
  document.documentElement.dataset.language343=currentLanguage;
  updateTitle();
  if(document.body)applyTree(document.body);
  const select=document.querySelector('[data-language-343] select');
  if(select&&select.value!==currentLanguage)select.value=currentLanguage;
  if(persist){try{localStorage.setItem(STORAGE_KEY,currentLanguage)}catch{}}
  if(emit)document.dispatchEvent(new CustomEvent('nomad343:language-change',{detail:{language:currentLanguage}}));
}

function startObserver(){
  if(observer||!document.body)return;
  observer=new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData'){
        translateTextNode(record.target);
        continue;
      }
      for(const node of record.addedNodes||[]){
        try{window.NOMAD343_FOOTBALL_EN?.normalize?.(node)}catch{}
        applyTree(node);
      }
    }
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
}

function injectStyle(){
  if(document.getElementById('nomad343-language-menu-style'))return;
  const style=document.createElement('style');
  style.id='nomad343-language-menu-style';
  style.textContent=`
    .nomad343-language{display:flex;align-items:center;margin-left:10px;flex:0 0 auto}
    .nomad343-language label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    .nomad343-language select{width:auto;min-width:112px;height:34px;padding:0 30px 0 10px;border:1px solid rgba(255,255,255,.14);background:#12341f;color:#dfe9e1;font-size:10px;font-weight:800;outline:none;cursor:pointer}
    .nomad343-language select:hover,.nomad343-language select:focus{border-color:#d7c54a;color:#fff}
    .nomad343-language option{background:#101612;color:#eef3ef}
    .nomad343-language option:disabled{color:#68736c}
    @media(max-width:760px){
      .nomad343-language{position:absolute;right:10px;top:50%;transform:translateY(-50%);margin-left:0}
      .nomad343-language select{min-width:94px;max-width:104px;height:30px;padding-left:8px;font-size:9px}
    }
  `;
  document.head.appendChild(style);
}

function mount(){
  const host=document.querySelector('.topbar-inner');
  if(!host||host.querySelector('[data-language-343]'))return;
  injectStyle();
  const wrap=document.createElement('div');
  wrap.className='nomad343-language';
  wrap.dataset.language343='1';
  const label=document.createElement('label');
  label.htmlFor='nomad343-language-select';
  label.textContent='Language';
  const select=document.createElement('select');
  select.id='nomad343-language-select';
  select.setAttribute('aria-label','Language');
  for(const language of LANGUAGES){
    const option=document.createElement('option');
    option.value=language.code;
    option.textContent=language.label;
    option.disabled=!language.ready;
    select.appendChild(option);
  }
  wrap.append(label,select);
  host.appendChild(wrap);
  currentLanguage=safeStoredLanguage();
  select.value=currentLanguage;
  startObserver();
  setLanguage(currentLanguage);
  select.addEventListener('change',()=>setLanguage(select.value,{persist:true,emit:true}));
  window.NOMAD343_LANGUAGE={
    version:VERSION,
    baseStandard:BASE_STANDARD,
    languages:LANGUAGES.map(x=>({...x})),
    current:()=>currentLanguage,
    set:code=>setLanguage(code,{persist:true,emit:true})
  };
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();
