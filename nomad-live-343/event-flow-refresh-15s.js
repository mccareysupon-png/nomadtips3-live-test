(()=>{
'use strict';
const VERSION='343-event-flow-refresh-v1-master15';
const API='/api/engine/history';
const busy=new Set();

async function refreshOne(el){
  if(!el||el.closest('[hidden]'))return;
  const id=String(el.dataset.eventFlowFixture||'').trim();
  if(!id||busy.has(id))return;
  busy.add(id);
  try{
    const r=await fetch(`${API}?fixtureId=${encodeURIComponent(id)}&window=10&cycle15=${Date.now()}`,{cache:'no-store'});
    const j=await r.json().catch(()=>null);
    if(r.ok&&j?.ok===true)window.NOMAD_EVENT_FLOW_343?.render?.(el,j);
  }catch{}
  finally{busy.delete(id)}
}

async function refreshVisible(root=document){
  const rows=[...(root.querySelectorAll?.('[data-event-flow-fixture]')||[])].filter(el=>!el.closest('[hidden]'));
  await Promise.allSettled(rows.map(refreshOne));
}

window.NOMAD343_EVENT_FLOW_REFRESH_15S={version:VERSION,refreshVisible,refreshOne};
})();