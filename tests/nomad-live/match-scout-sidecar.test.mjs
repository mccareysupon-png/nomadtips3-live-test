import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../nomad-live/match-scout-sidecar.js',import.meta.url),'utf8');
const footerSource=readFileSync(new URL('../../nomad-live/site-footer.js',import.meta.url),'utf8');

function response(data,status=200){
  return {
    ok:status>=200&&status<300,
    status,
    async json(){return structuredClone(data);},
  };
}

function createHarness({legacy=[],central=[],settingsKey='owner-key',registryDown=false}={}){
  const localData=new Map();
  if(legacy.length)localData.set('nomad341:match-scouts:test:registry:v1',JSON.stringify(legacy));
  const sessionData=new Map();
  if(settingsKey)sessionData.set('nomadSettingsKey:test',settingsKey);

  const localStorage={
    getItem:key=>localData.has(key)?localData.get(key):null,
    setItem:(key,value)=>localData.set(key,String(value)),
    removeItem:key=>localData.delete(key),
  };
  const sessionStorage={
    getItem:key=>sessionData.has(key)?sessionData.get(key):null,
    setItem:(key,value)=>sessionData.set(key,String(value)),
    removeItem:key=>sessionData.delete(key),
  };

  const centralScouts=structuredClone(central);
  let down=registryDown;
  const fetchCalls=[];
  const fetch=async(url,options={})=>{
    const parsed=new URL(String(url),'https://page.test/');
    fetchCalls.push({url:String(url),path:parsed.pathname,options:structuredClone(options)});
    if(parsed.hostname==='nomad341-match-scout-registry.mccarey-supon.workers.dev'){
      if(down)throw new Error('registry offline');
      if(parsed.pathname==='/scouts'&&(!options.method||options.method==='GET')){
        return response({ok:true,scouts:centralScouts});
      }
      if(parsed.pathname==='/scouts/register'&&options.method==='POST'){
        assert.equal(options.headers['x-settings-key'],sessionData.get('nomadSettingsKey:test'));
        const body=JSON.parse(options.body);
        const existing=centralScouts.find(item=>Number(item.configVersion)===Number(body.configVersion));
        if(existing)return response({ok:true,item:existing,existing:true});
        const sequence=centralScouts.reduce((max,item)=>Math.max(max,Number(item.sequence)||0),0)+1;
        const item={
          scoutId:`MS-${String(sequence).padStart(4,'0')}`,
          sequence,
          name:body.name,
          configVersion:Number(body.configVersion),
          appliesFromCycle:body.appliesFromCycle??null,
          createdAt:body.createdAt,
          settingsSnapshot:body.settingsSnapshot??null,
        };
        centralScouts.push(item);
        return response({ok:true,item,existing:false});
      }
      if(parsed.pathname==='/scouts/migrate'&&options.method==='POST'){
        assert.equal(options.headers['x-settings-key'],sessionData.get('nomadSettingsKey:test'));
        const body=JSON.parse(options.body);
        let added=0;
        for(const raw of body.items||[]){
          if(centralScouts.some(item=>Number(item.configVersion)===Number(raw.configVersion)))continue;
          const sequence=Number(raw.sequence)||centralScouts.reduce((max,item)=>Math.max(max,Number(item.sequence)||0),0)+1;
          centralScouts.push({...structuredClone(raw),sequence,scoutId:`MS-${String(sequence).padStart(4,'0')}`});
          added+=1;
        }
        centralScouts.sort((a,b)=>Number(a.sequence)-Number(b.sequence));
        return response({ok:true,added,scouts:centralScouts});
      }
      return response({ok:false,error:'not_found'},404);
    }
    if(parsed.pathname==='/api/statistics')return response({records:[]});
    return response({ok:false,error:'not_found'},404);
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
  const activeCycle={textContent:'Applies From Cycle 901'};
  const settingsApp={hidden:true};
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
  const ids={settingsForm:form,validationMessages:validation,saveStatus,activeCycle,settingsApp};
  const document={
    readyState:'complete',
    head:{appendChild(){}},
    getElementById:id=>ids[id]||null,
    createElement:tag=>tag==='section'?section:{id:'',textContent:''},
    querySelector:()=>null,
    addEventListener:addListener,
  };

  const observers=[];
  class MutationObserver{
    constructor(callback){this.callback=callback;}
    observe(target,options){observers.push({target,options,callback:this.callback});}
  }
  class CustomEvent{
    constructor(type,init={}){this.type=type;this.detail=init.detail;}
  }

  vm.runInNewContext(source,{
    window,
    document,
    localStorage,
    sessionStorage,
    MutationObserver,
    CustomEvent,
    fetch,
    console,
    Date,
    Number,
    String,
    JSON,
    Object,
    Array,
    Math,
    URL,
    setTimeout,
    clearTimeout,
  });

  const trigger=target=>{
    for(const observer of observers.filter(item=>item.target===target))observer.callback();
  };
  const settle=async()=>{
    for(let i=0;i<8;i++)await new Promise(resolve=>setTimeout(resolve,0));
  };

  return {
    api:window.NOMAD_MATCH_SCOUTS,
    localData,
    sessionData,
    centralScouts,
    fetchCalls,
    nameInput,
    warning,
    stateText,
    button,
    settingsApp,
    setRegistryDown:value=>{down=Boolean(value);},
    setSettingsKey:value=>{
      if(value)sessionData.set('nomadSettingsKey:test',value);
      else sessionData.delete('nomadSettingsKey:test');
    },
    unlock:()=>{
      settingsApp.hidden=false;
      trigger(settingsApp);
    },
    submit:()=>handlers['form:submit']?.(),
    clickDetach:()=>handlers['button:click']?.(),
    status:async text=>{
      saveStatus.textContent=text;
      trigger(saveStatus);
      await settle();
    },
    settle,
  };
}

test('loader accepts extensionless production routes and legacy .html routes',()=>{
  assert.ok(footerSource.includes("if(!/\\/(?:settings|statistics)(?:\\.html)?\\/?$/i.test(path))return;"));
  assert.ok(footerSource.includes("script.src='match-scout-sidecar.js?v=20260828-central-v2';"));
});

test('new Scout writes go to central registry and never mutate legacy localStorage',async()=>{
  const h=createHarness();
  await h.settle();
  const before=h.localData.get('nomad341:match-scouts:test:registry:v1')??null;

  const first=await h.api.registerActive({name:'  K-HomEX  ',configVersion:71,appliesFromCycle:901});
  assert.equal(first.ok,true);
  assert.equal(first.item.scoutId,'MS-0001');
  assert.equal(first.item.name,'K-HomEX');
  assert.equal(first.item.configVersion,71);
  assert.equal(h.api.list().length,1);
  assert.equal(h.localData.get('nomad341:match-scouts:test:registry:v1')??null,before);

  const duplicate=await h.api.registerActive({name:'SHOULD-NOT-REPLACE',configVersion:71});
  assert.equal(duplicate.existing,true);
  assert.equal(duplicate.item.name,'K-HomEX');
  assert.equal(h.centralScouts.length,1);
});

test('legacy MS-0001 migrates exactly after Settings unlock and remains idempotent',async()=>{
  const legacy=[{
    scoutId:'MS-0001',
    sequence:1,
    name:'K-HomEX',
    configVersion:71,
    appliesFromCycle:12884,
    createdAt:'2026-08-28T10:00:00.000Z',
    settingsSnapshot:{minuteFrom:55,minuteTo:88},
  }];
  const h=createHarness({legacy,settingsKey:''});
  await h.settle();
  assert.equal(h.centralScouts.length,0,'without Settings key migration must wait');
  assert.equal(h.localData.has('nomad341:match-scouts:test:registry:v1'),true,'legacy backup must remain');

  h.setSettingsKey('owner-key');
  h.unlock();
  await h.settle();
  assert.equal(h.centralScouts.length,1);
  assert.equal(h.centralScouts[0].scoutId,'MS-0001');
  assert.equal(h.centralScouts[0].name,'K-HomEX');
  assert.equal(h.centralScouts[0].configVersion,71);
  assert.equal(h.centralScouts[0].appliesFromCycle,12884);
  assert.deepEqual(h.centralScouts[0].settingsSnapshot,{minuteFrom:55,minuteTo:88});
  assert.equal(h.localData.has('nomad341:match-scouts:test:registry:v1'),true,'migration must not delete rollback copy');

  const second=await h.api.migrateLegacy();
  assert.equal(second.added,0);
  assert.equal(h.centralScouts.length,1);
});

test('Settings files a central Scout only after Core reports ACTIVE',async()=>{
  const h=createHarness();
  await h.settle();

  h.nameInput.value='';
  h.submit();
  await h.status('Version 70 is ACTIVE');
  assert.equal(h.centralScouts.length,0,'blank Condition Name must not create a Scout');

  h.nameInput.value='K-HomEX';
  h.submit();
  await h.status('Saved v71 · waiting for cycle 902…');
  assert.equal(h.centralScouts.length,0,'pending config must not create a Scout');
  await h.status('Version 71 is ACTIVE on TEST');
  assert.equal(h.centralScouts.length,1);
  assert.equal(h.centralScouts[0].configVersion,71);
  assert.equal(h.nameInput.value,'');
  assert.match(h.warning.textContent,/Filed MS-0001/);

  h.nameInput.value='K-Failed';
  h.submit();
  await h.status('Save failed: rejected');
  await h.status('Version 72 is ACTIVE on TEST');
  assert.equal(h.centralScouts.length,1,'failed save must clear pending Scout intent');
});

test('emergency detach discards pending Scout without touching central history',async()=>{
  const h=createHarness({central:[{scoutId:'MS-0001',sequence:1,name:'K-Existing',configVersion:80}]});
  await h.settle();
  assert.equal(h.api.list().length,1);

  h.nameInput.value='K-Pending';
  h.submit();
  h.clickDetach();
  assert.equal(h.api.isDetached(),true);
  await h.status('Version 81 is ACTIVE on TEST');
  assert.equal(h.centralScouts.length,1);
  assert.equal(h.api.findByVersion(81),null);

  h.clickDetach();
  await h.settle();
  assert.equal(h.api.isDetached(),false);
  await h.status('Version 81 is ACTIVE on TEST');
  assert.equal(h.centralScouts.length,1,'reconnect must not resurrect discarded pending intent');
});

test('registry failure is isolated and does not create a local fallback Scout',async()=>{
  const h=createHarness();
  await h.settle();
  h.setRegistryDown(true);
  const refreshed=await h.api.refresh();
  assert.equal(refreshed.ok,false);
  assert.equal(h.api.status().state,'unavailable');

  const legacyBefore=h.localData.get('nomad341:match-scouts:test:registry:v1')??null;
  const result=await h.api.registerActive({name:'K-NoFallback',configVersion:99});
  assert.equal(result.ok,false);
  assert.equal(h.localData.get('nomad341:match-scouts:test:registry:v1')??null,legacyBefore);
  assert.equal(h.centralScouts.length,0);
});
