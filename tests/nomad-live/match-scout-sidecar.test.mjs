import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../nomad-live/match-scout-sidecar.js',import.meta.url),'utf8');

function createHarness(sharedData=new Map()){
  const storage={
    getItem:key=>sharedData.has(key)?sharedData.get(key):null,
    setItem:(key,value)=>sharedData.set(key,String(value)),
    removeItem:key=>sharedData.delete(key),
  };

  const listeners=new Map();
  const addListener=(type,handler)=>{
    if(!listeners.has(type))listeners.set(type,[]);
    listeners.get(type).push(handler);
  };
  const window={
    NOMAD_RUNTIME:{environment:'test',engineBase:'/api'},
    addEventListener:addListener,
    dispatchEvent:event=>{
      for(const handler of listeners.get(event.type)||[])handler(event);
      return true;
    },
  };

  const handlers={};
  const form={
    insertBefore(){},
    addEventListener:(type,handler)=>{handlers['form:'+type]=handler;},
  };
  const validation={};
  const saveStatus={textContent:''};
  const activeCycle={textContent:'Cycle 901'};
  const nameInput={value:'',disabled:false,type:'text'};
  const warning={hidden:true,textContent:''};
  const stateText={textContent:''};
  const boxes={innerHTML:''};
  const button={
    className:'',
    textContent:'',
    addEventListener:(type,handler)=>{handlers['button:'+type]=handler;},
  };
  const section={
    className:'',
    id:'',
    innerHTML:'',
    classList:{toggle(){}},
    querySelector(selector){
      if(selector==='#matchScoutName')return nameInput;
      if(selector==='button')return button;
      if(selector==='.ms-warning')return warning;
      if(selector==='.ms-state-text')return stateText;
      if(selector==='.ms-boxes')return boxes;
      return null;
    },
  };
  const ids={settingsForm:form,validationMessages:validation,saveStatus,activeCycle};
  const document={
    readyState:'complete',
    head:{appendChild(){}},
    getElementById:id=>ids[id]||null,
    createElement:tag=>tag==='section'?section:{id:'',textContent:''},
    querySelector:()=>null,
    addEventListener:addListener,
  };

  let mutationCallback=null;
  class MutationObserver{
    constructor(callback){mutationCallback=callback;}
    observe(){}
  }
  class CustomEvent{
    constructor(type,init={}){this.type=type;this.detail=init.detail;}
  }

  vm.runInNewContext(source,{
    window,
    document,
    localStorage:storage,
    MutationObserver,
    CustomEvent,
    console,
    Date,
    Number,
    String,
    JSON,
    Object,
    Array,
    Math,
  });

  return {
    api:window.NOMAD_MATCH_SCOUTS,
    data:sharedData,
    nameInput,
    warning,
    stateText,
    button,
    submit:()=>handlers['form:submit']?.(),
    clickDetach:()=>handlers['button:click']?.(),
    status:text=>{
      saveStatus.textContent=text;
      mutationCallback?.();
    },
  };
}

test('registry uses stable monotonic IDs and is idempotent by configVersion',()=>{
  const h=createHarness();
  const first=h.api.registerActive({name:'  K-HomEX  ',configVersion:51,appliesFromCycle:901,createdAt:'2026-08-28T00:00:00.000Z'});
  assert.equal(first.ok,true);
  assert.equal(first.existing,false);
  assert.equal(first.item.scoutId,'MS-0001');
  assert.equal(first.item.name,'K-HomEX');
  assert.equal(first.item.configVersion,51);

  const duplicate=h.api.registerActive({name:'SHOULD-NOT-REPLACE',configVersion:51});
  assert.equal(duplicate.ok,true);
  assert.equal(duplicate.existing,true);
  assert.equal(duplicate.item.scoutId,'MS-0001');
  assert.equal(duplicate.item.name,'K-HomEX');
  assert.equal(h.api.list().length,1);

  const second=h.api.registerActive({name:'K-LateEX',configVersion:52});
  assert.equal(second.item.scoutId,'MS-0002');
  assert.deepEqual(Array.from(h.api.list(),item=>item.scoutId),['MS-0001','MS-0002']);
  assert.equal(h.api.findByVersion(52).name,'K-LateEX');
});

test('emergency detach blocks new registry writes and reconnect preserves history',()=>{
  const data=new Map();
  const h=createHarness(data);
  h.api.registerActive({name:'K-HomEX',configVersion:61});
  assert.equal(h.api.detach(),true);
  assert.equal(h.api.isDetached(),true);

  const blocked=h.api.registerActive({name:'K-Blocked',configVersion:62});
  assert.equal(blocked.ok,false);
  assert.equal(blocked.detached,true);
  assert.equal(h.api.list().length,1);

  assert.equal(h.api.attach(),true);
  assert.equal(h.api.isDetached(),false);
  const resumed=h.api.registerActive({name:'K-Resume',configVersion:63});
  assert.equal(resumed.item.scoutId,'MS-0002');

  const reloaded=createHarness(data);
  assert.deepEqual(Array.from(reloaded.api.list(),item=>[item.scoutId,item.configVersion]),[
    ['MS-0001',61],
    ['MS-0002',63],
  ]);
});

test('Settings sidecar files a name only after the core status reports ACTIVE',()=>{
  const h=createHarness();

  h.nameInput.value='';
  h.submit();
  h.status('Version 70 is ACTIVE');
  assert.equal(h.api.list().length,0,'blank Condition Name must not create a Scout');

  h.nameInput.value='K-HomEX';
  h.submit();
  h.status('Version 71 is PENDING');
  assert.equal(h.api.list().length,0,'pending config must not create a Scout');
  h.status('Version 71 is ACTIVE');
  assert.equal(h.api.list().length,1);
  assert.equal(h.api.list()[0].configVersion,71);
  assert.equal(h.api.list()[0].name,'K-HomEX');
  assert.equal(h.nameInput.value,'');

  h.nameInput.value='K-Failed';
  h.submit();
  h.status('Save failed');
  h.status('Version 72 is ACTIVE');
  assert.equal(h.api.list().length,1,'failed save must clear pending Scout intent');
});

test('detaching between Save and ACTIVE discards the pending Scout without touching registry history',()=>{
  const h=createHarness();
  h.api.registerActive({name:'K-Existing',configVersion:80});

  h.nameInput.value='K-Pending';
  h.submit();
  h.clickDetach();
  assert.equal(h.api.isDetached(),true);
  h.status('Version 81 is ACTIVE');
  assert.equal(h.api.list().length,1);
  assert.equal(h.api.findByVersion(81),null);

  h.clickDetach();
  assert.equal(h.api.isDetached(),false);
  h.status('Version 81 is ACTIVE');
  assert.equal(h.api.list().length,1,'reconnect must not resurrect a discarded pending intent');
});
