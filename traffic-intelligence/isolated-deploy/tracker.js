// First-party consented measurement. Do not add to Member or private/account pages.
(()=>{
 'use strict';
 const HOSTS=new Set(['ball46.com','www.ball46.com']);
 const PATHS=new Set(['/','/index.html','/information.html','/about.html','/user-guide.html','/methodology.html','/privacy.html','/terms.html','/disclaimer.html','/affiliate-disclosure.html','/responsible-gambling.html','/cookies.html','/contact.html']);
 if(!HOSTS.has(location.hostname)||!PATHS.has(location.pathname)||document.getElementById('b46-vm-consent-root'))return;
 const ENDPOINT='https://b46-visitor-monitor-collector.mccarey-supon.workers.dev';
 const CHOICE='b46_vm_choice_v1',VISITOR='b46_vm_visitor_v1',SESSION='b46_vm_session_v1';
 const DAY=86400000,IDLE=30*60000,HEARTBEAT=45000;
 const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
 let lastSent=0,inFlight=false,lastPath=location.pathname,lastActivity=Date.now(),lastTouch=0;
 const read=key=>{try{return JSON.parse(localStorage.getItem(key)||'null');}catch{return null;}};
 const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
 const remove=key=>{try{localStorage.removeItem(key);}catch{}};
 const signal=()=>navigator.globalPrivacyControl===true||navigator.doNotTrack==='1'||window.doNotTrack==='1';
 const permitted=()=>read(CHOICE)?.accepted===true&&!signal();
 function identity(now){
  if(!permitted())return null;
  let visitor=read(VISITOR);
  if(!UUID.test(visitor?.id||'')||!Number.isFinite(visitor.created)||visitor.created>now||now-visitor.created>=30*DAY){
   visitor={id:crypto.randomUUID(),created:now};
   if(!write(VISITOR,visitor))return null;
   remove(SESSION);
  }
  let session=read(SESSION);
  if(!UUID.test(session?.id||'')||session.vid!==visitor.id||!Number.isFinite(session.last)||session.last>now||now-session.last>=IDLE){
   session={id:crypto.randomUUID(),vid:visitor.id,last:now};
   if(!write(SESSION,session))return null;
  }
  return {visitor,session};
 }
 async function send(force=false){
  const now=Date.now();
  if(!permitted()||document.visibilityState!=='visible'||!PATHS.has(location.pathname)||now-lastActivity>=IDLE||inFlight||(!force&&now-lastSent<HEARTBEAT))return;
  const ids=identity(now);if(!ids)return;
  inFlight=true;lastSent=now;
  try{await fetch(ENDPOINT+'/api/collect',{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({v:1,type:'heartbeat',consent:true,vid:ids.visitor.id,sid:ids.session.id,path:location.pathname})});}catch{}finally{inFlight=false;}
 }
 function touch(){
  if(document.visibilityState!=='visible')return;
  const now=Date.now();lastActivity=now;
  if(!permitted()||now-lastTouch<15000)return;
  lastTouch=now;
  const ids=identity(now);if(ids){ids.session.last=now;write(SESSION,ids.session);}
  void send();
 }
 function revoke(){
  const visitor=read(VISITOR),session=read(SESSION);
  // Stop first; this request only removes the browser's previously stored measurements.
  write(CHOICE,{accepted:false,at:Date.now()});remove(VISITOR);remove(SESSION);
  if(UUID.test(visitor?.id||'')&&UUID.test(session?.id||''))void fetch(ENDPOINT+'/api/collect',{method:'POST',mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',keepalive:true,headers:{'content-type':'application/json'},body:JSON.stringify({v:1,type:'revoke',vid:visitor.id,sid:session.id})}).catch(()=>{});
 }
 function mount(){
  if(document.getElementById('b46-vm-consent-root'))return;
  const root=document.createElement('div');root.id='b46-vm-consent-root';
  const shadow=root.attachShadow({mode:'open'});
  shadow.innerHTML='<style>:host{all:initial;position:relative;z-index:2147483000;font:14px/1.55 system-ui,sans-serif;color:#17312b}*{box-sizing:border-box}.panel{position:fixed;bottom:16px;left:16px;width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 80px);overflow:auto;padding:18px;background:#fff;border:1px solid #8eb5a7;border-radius:12px;box-shadow:0 8px 36px #0004}.panel[hidden]{display:none}h2{font:600 18px/1.4 system-ui;margin:0 0 8px}p{margin:8px 0}a{color:#126749}button{font:600 14px system-ui;cursor:pointer;border:1px solid #27604c;background:#fff;color:#173f2f;padding:11px 14px;border-radius:7px}button:focus-visible,a:focus-visible{outline:3px solid #3884e8;outline-offset:3px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.choice{flex:1;min-width:160px}.manage{position:fixed;bottom:10px;right:12px;font-size:11px;padding:7px 10px;background:#fff;box-shadow:0 2px 10px #0002}.state{font-size:12px;color:#31574b}@media(max-width:480px){.panel{bottom:50px;padding:14px}.choice{min-width:120px}}</style><button class="manage" type="button" aria-label="ตั้งค่าความเป็นส่วนตัว BALL46">ความเป็นส่วนตัว</button><section class="panel" role="region" aria-label="ความยินยอมวัดการเข้าชม BALL46"><h2>อนุญาตให้ BALL46 นับการเข้าชมหรือไม่</h2><p>เมื่อยินยอม เราใช้รหัสสุ่มในเบราว์เซอร์เพื่อวัดจำนวนเบราว์เซอร์ไม่ซ้ำ Sessions และการเปิดหน้าเว็บที่ยังใช้งานอยู่ ส่ง heartbeat ทุก 45 วินาทีเฉพาะหน้าที่มองเห็น ผ่านระบบ Cloudflare ของ BALL46</p><p>เก็บเวลา หน้าเว็บสาธารณะ ประเทศ และประเภทอุปกรณ์ไม่เกิน 26 ชั่วโมง รหัสเบราว์เซอร์หมดอายุใน 30 วัน ไม่มีการบันทึก IP ลงส่วนนี้ ไม่บันทึกการกดปุ่ม เนื้อหาที่พิมพ์ หรือภาพหน้าจอ</p><p>ปฏิเสธได้โดยใช้เว็บไซต์ตามปกติ และเปลี่ยนใจได้ที่ปุ่มความเป็นส่วนตัว <a target="_blank" rel="noopener noreferrer" href="'+ENDPOINT+'/privacy">รายละเอียดการเก็บข้อมูล</a></p><p class="state" role="status"></p><div class="actions"><button class="choice accept" type="button">ยินยอม</button><button class="choice reject" type="button">ไม่ยินยอม / ถอนความยินยอม</button></div></section>';
  document.body.append(root);
  const panel=shadow.querySelector('.panel'),state=shadow.querySelector('.state'),accept=shadow.querySelector('.accept');
  const show=()=>{panel.hidden=false;state.textContent=signal()?'เบราว์เซอร์ส่งสัญญาณไม่ให้ติดตาม (DNT/GPC) ระบบจะไม่เก็บข้อมูล':(permitted()?'สถานะ: ยินยอมแล้ว สามารถถอนได้ทุกเมื่อ':'สถานะ: ยังไม่อนุญาตให้วัดการเข้าชม');accept.disabled=signal();};
  shadow.querySelector('.manage').addEventListener('click',show);
  accept.addEventListener('click',()=>{if(signal())return;if(write(CHOICE,{accepted:true,at:Date.now()})){lastActivity=Date.now();panel.hidden=true;touch();void send(true);}else state.textContent='ไม่สามารถบันทึกตัวเลือกได้ จึงยังไม่เก็บข้อมูล';});
  shadow.querySelector('.reject').addEventListener('click',()=>{revoke();panel.hidden=true;});
  window.addEventListener('storage',event=>{if([CHOICE,VISITOR,SESSION].includes(event.key)){if(!permitted()){remove(VISITOR);remove(SESSION);}else{lastActivity=Date.now();void send();}}});
  if(signal()){revoke();panel.hidden=true;}else if(read(CHOICE)?.accepted!==true&&read(CHOICE)?.accepted!==false)show();else panel.hidden=true;
  for(const event of ['pointerdown','keydown','scroll'])window.addEventListener(event,touch,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){touch();void send(true);}});
  setInterval(()=>{if(signal()){if(read(VISITOR))revoke();return;}if(location.pathname!==lastPath){lastPath=location.pathname;touch();}void send();},15000);
  if(permitted()){touch();void send(true);}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
