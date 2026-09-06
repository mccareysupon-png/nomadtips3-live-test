(function(){
  'use strict';

  var BASE='/add-k-ah-api';
  var form=document.getElementById('form');
  var resultSection=document.getElementById('result');
  var settingsSection=document.getElementById('settings');
  var resultTab=document.getElementById('tab-result');
  var settingsTab=document.getElementById('tab-settings');
  var saveButton=document.getElementById('save-button');
  var message=document.getElementById('msg');

  function setTab(name){
    var showSettings=name==='settings';
    resultSection.hidden=showSettings;
    settingsSection.hidden=!showSettings;
    resultTab.classList.toggle('active',!showSettings);
    settingsTab.classList.toggle('active',showSettings);
    resultTab.setAttribute('aria-selected',showSettings?'false':'true');
    settingsTab.setAttribute('aria-selected',showSettings?'true':'false');
  }

  function value(v){return v===null||v===undefined||v===''?'—':v;}
  function sideLabel(side){return side==='HOME'?'เจ้าบ้าน':'ทีมเยือน';}
  function oneDecimal(v){return typeof v==='number'&&isFinite(v)?v.toFixed(1):'—';}
  function escapeHtml(v){
    return String(v===null||v===undefined?'':v)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  async function api(path,options){
    var response=await fetch(BASE+path,Object.assign({cache:'no-store'},options||{}));
    var body=await response.json().catch(function(){return {};});
    if(!response.ok||body.ok===false)throw new Error(body.error||'ระบบตอบกลับผิดพลาด');
    return body;
  }

  function put(name,val){
    var element=form.elements[name];
    if(!element)return;
    if(element.type==='checkbox')element.checked=Boolean(val);
    else element.value=val;
  }

  function renderSignals(list){
    var cards=document.getElementById('cards');
    if(!list||!list.length){
      cards.innerHTML='<div class="empty">ยังไม่มีคู่ที่ผ่านเงื่อนไข</div>';
      return;
    }
    cards.innerHTML=list.map(function(item){
      var side=String(item.side||'HOME').toLowerCase();
      var stats=item.stats||{};
      var metrics=item.metrics||{};
      var score=item.score||{};
      var sot=stats.sot||{};
      var shotOff=stats.shotOff||{};
      var corners=stats.corners||{};
      return '<article class="card">'+
        '<div class="row"><b>'+escapeHtml(item.home)+'</b><b>'+escapeHtml(value(score.home))+'-'+escapeHtml(value(score.away))+'</b><b>'+escapeHtml(item.away)+'</b></div>'+
        '<p>'+escapeHtml(item.league||'')+' · นาที '+escapeHtml(value(item.minute))+' · '+sideLabel(item.side)+' · ล็อกแล้ว</p>'+
        '<div class="metric">'+
          '<span>ยิงเข้ากรอบ '+escapeHtml(value(sot[side]))+'</span>'+
          '<span>ยิงออกกรอบ '+escapeHtml(value(shotOff[side]))+'</span>'+
          '<span>เตะมุม '+escapeHtml(value(corners[side]))+'</span>'+
          '<span>สัดส่วนการบุก '+oneDecimal(metrics.attackShare)+'%</span>'+
          '<span>สัดส่วนการบุกอันตราย '+oneDecimal(metrics.dangerousShare)+'%</span>'+
          '<span>อัตราการบุก '+oneDecimal(metrics.attackRate)+'%</span>'+
          '<span>แต้มต่อ '+escapeHtml(value(metrics.line))+'</span>'+
          '<span>ราคา '+escapeHtml(value(metrics.odds))+'</span>'+
        '</div></article>';
    }).join('');
  }

  async function load(){
    try{
      var values=await Promise.all([api('/config'),api('/signals'),api('/status')]);
      var config=values[0];
      var signals=values[1];
      var status=values[2];
      Object.keys(config.config||{}).forEach(function(key){put(key,config.config[key]);});
      document.getElementById('times').textContent='ตรวจ 4 รอบ: นาที '+(config.schedule||[]).join(', ');

      var state=status.status;
      document.getElementById('status').textContent=state
        ? 'ระบบ '+(state.enabled===false?'ปิด':'เปิด')+' · บอลสด '+value(state.live)+' · ตรวจรอบล่าสุด '+value(state.checked)+' คู่ · ล็อกใหม่ '+value(state.locked)+' คู่ · อัปเดต '+new Date(state.updatedAt).toLocaleTimeString('th-TH')
        : 'ระบบยังไม่มีรอบตรวจ';

      var smoke=status.smoke;
      document.getElementById('source').textContent=smoke&&smoke.ok
        ? 'แหล่งข้อมูลพร้อม: API-Football '+value(smoke.apiFootball&&smoke.apiFootball.live)+' คู่ · TotalCorner '+value(smoke.totalCorner&&smoke.totalCorner.matches)+' คู่ · NowGoal '+value(smoke.nowgoal&&smoke.nowgoal.status)
        : '';
      renderSignals(signals.signals||[]);
    }catch(error){
      document.getElementById('status').textContent='โหลดข้อมูลไม่สำเร็จ: '+error.message;
    }
  }

  function collectConfig(){
    var data={};
    Array.prototype.forEach.call(form.elements,function(element){
      if(!element.name)return;
      if(element.type==='checkbox')data[element.name]=element.checked;
      else if(element.name==='side')data[element.name]=element.value;
      else data[element.name]=Number(element.value);
    });
    return data;
  }

  async function save(event){
    event.preventDefault();
    if(!form.reportValidity())return;
    saveButton.disabled=true;
    message.className='muted';
    message.textContent='กำลังบันทึก…';
    try{
      var saved=await api('/config',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify(collectConfig())
      });
      message.className='ok';
      message.textContent='บันทึกแล้ว · รอบตรวจนาที '+saved.schedule.join(', ');
      await load();
    }catch(error){
      message.className='warn';
      message.textContent='บันทึกไม่สำเร็จ: '+error.message;
    }finally{
      saveButton.disabled=false;
    }
  }

  resultTab.addEventListener('click',function(){setTab('result');});
  settingsTab.addEventListener('click',function(){setTab('settings');});
  form.addEventListener('submit',save);
  setTab('result');
  load();
  window.setInterval(load,30000);
})();
