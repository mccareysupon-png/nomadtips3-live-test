import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
const SOURCE=await readFile(new URL('./tracker.js',import.meta.url),'utf8');
const CHOICE='b46_vm_choice_v1',VISITOR='b46_vm_visitor_v1',SESSION='b46_vm_session_v1';
const START=Date.UTC(2026,9,21,3);
class Element {
 listeners=new Map();hidden=false;disabled=false;textContent='';
 addEventListener(event,fn){this.listeners.set(event,fn);}
 click(){if(!this.disabled)this.listeners.get('click')?.();}
 attachShadow(){this.shadow={nodes:new Map(['.panel','.state','.accept','.reject','.manage'].map(k=>[k,new Element()])),querySelector(selector){return this.nodes.get(selector);}};return this.shadow;}
}
function browser(options={}){
 let now=START;const map=options.storage||new Map(),roots=new Map(),windowEvents=new Map(),docEvents=new Map(),intervals=[],sent=[];
 const doc={readyState:'complete',visibilityState:'visible',getElementById:id=>roots.get(id),createElement:()=>new Element(),addEventListener:(type,fn)=>docEvents.set(type,fn),body:{append(el){roots.set(el.id,el);}}};
 const win={addEventListener:(type,fn)=>windowEvents.set(type,fn)};
 const location={hostname:'ball46.com',pathname:'/',search:'?private=no',hash:'#private',...options.location};
 const nav={globalPrivacyControl:false,doNotTrack:null,...options.navigator};
 const storage={getItem:key=>{if(options.storageBlocked)throw Error('blocked');return map.get(key)||null;},setItem:(key,value)=>{if(options.storageBlocked)throw Error('blocked');map.set(key,value);},removeItem:key=>map.delete(key)};
 class Clock extends Date{static now(){return now;}}
 runInNewContext(SOURCE,{window:win,document:doc,location,navigator:nav,localStorage:storage,crypto:{randomUUID},Date:Clock,setInterval:fn=>intervals.push(fn),fetch:async(url,init)=>{sent.push({url,init,body:JSON.parse(init.body)});return {ok:true,status:204};}});
 const ui=selector=>roots.get('b46-vm-consent-root')?.shadow?.querySelector(selector);
 return {map,sent,location,nav,doc,ui,advance(ms){now+=ms;},tick(){intervals.forEach(fn=>fn());},event(type){windowEvents.get(type)?.({key:CHOICE});},visibility(state){doc.visibilityState=state;docEvents.get('visibilitychange')?.();},async flush(){await Promise.resolve();await Promise.resolve();},read:key=>JSON.parse(map.get(key)||'null')};
}
test('no choice sends nothing and creates no analytics IDs; rejection remains usable',async()=>{
 const b=browser();assert.equal(b.sent.length,0);assert.equal(b.map.size,0);assert.equal(b.ui('.panel').hidden,false);
 b.ui('.reject').click();b.advance(45000);b.tick();await b.flush();assert.equal(b.read(CHOICE).accepted,false);assert.equal(b.read(VISITOR),null);assert.equal(b.sent.length,0);assert.equal(b.ui('.panel').hidden,true);
 b.ui('.manage').click();assert.equal(b.ui('.panel').hidden,false);
});
test('acceptance starts one bounded heartbeat; only approved fields leave the browser',async()=>{
 const b=browser();b.ui('.accept').click();await b.flush();assert.equal(b.sent.length,1);
 const first=b.sent[0];assert.equal(first.init.credentials,'omit');assert.equal(first.init.referrerPolicy,'no-referrer');assert.equal(first.body.path,'/');assert.equal(first.body.consent,true);
 assert.deepEqual(Object.keys(first.body).sort(),['consent','path','sid','type','v','vid']);
 b.advance(15000);b.tick();await b.flush();assert.equal(b.sent.length,1);
 b.advance(30000);b.tick();await b.flush();assert.equal(b.sent.length,2);assert.equal(b.sent[1].body.vid,first.body.vid);assert.equal(b.sent[1].body.sid,first.body.sid);
});
test('hidden tabs and 30 minute inactivity stop heartbeats',async()=>{
 const b=browser();b.ui('.accept').click();await b.flush();b.visibility('hidden');b.advance(60000);b.tick();await b.flush();assert.equal(b.sent.length,1);
 b.visibility('visible');await b.flush();assert.equal(b.sent.length,2);
 b.advance(30*60000);b.tick();await b.flush();assert.equal(b.sent.length,2);
});
test('new activity after inactivity creates a new session with the same browser',async()=>{
 const b=browser();b.ui('.accept').click();await b.flush();const first=b.sent[0].body;
 b.advance(31*60000);b.event('pointerdown');await b.flush();assert.equal(b.sent.length,2);assert.equal(b.sent[1].body.vid,first.vid);assert.notEqual(b.sent[1].body.sid,first.sid);
});
test('host-scoped storage deduplicates browser and session across tabs',async()=>{
 const a=browser();a.ui('.accept').click();await a.flush();const b=browser({storage:a.map});await b.flush();assert.equal(b.sent.length,1);assert.equal(a.sent[0].body.vid,b.sent[0].body.vid);assert.equal(a.sent[0].body.sid,b.sent[0].body.sid);
});
test('browser ID expires after 30 days instead of silently becoming permanent',async()=>{
 const b=browser();b.ui('.accept').click();await b.flush();const old=b.sent[0].body.vid;
 b.advance(30*86400000);b.event('pointerdown');await b.flush();assert.notEqual(b.sent.at(-1).body.vid,old);
});
test('withdrawal stops collection, removes local IDs and sends only a deletion request',async()=>{
 const b=browser();b.ui('.accept').click();await b.flush();b.ui('.reject').click();await b.flush();assert.equal(b.read(CHOICE).accepted,false);assert.equal(b.read(VISITOR),null);assert.equal(b.read(SESSION),null);assert.equal(b.sent.at(-1).body.type,'revoke');
 const count=b.sent.length;b.advance(60000);b.event('scroll');b.tick();await b.flush();assert.equal(b.sent.length,count);
});
test('DNT and GPC cannot be overridden by accepting the banner',async()=>{
 for(const navigator of [{doNotTrack:'1'},{globalPrivacyControl:true}]){const b=browser({navigator});b.ui('.manage').click();b.ui('.accept').click();b.advance(60000);b.tick();await b.flush();assert.equal(b.sent.length,0);assert.equal(b.read(VISITOR),null);assert.equal(b.ui('.accept').disabled,true);}
});
test('blocked LocalStorage fails closed without an ephemeral tracking identifier',async()=>{
 const b=browser({storageBlocked:true});b.ui('.accept').click();await b.flush();assert.equal(b.sent.length,0);assert.equal(b.ui('.panel').hidden,false);assert.match(b.ui('.state').textContent,/ยังไม่เก็บข้อมูล/);
});
test('Member, private paths and unlisted paths never mount or send',()=>{
 for(const location of [{hostname:'member.ball46.com'},{hostname:'other.invalid'},{pathname:'/login'},{pathname:'/account'},{pathname:'/match/private-id'},{pathname:'/api/engine/board'}]){const b=browser({location});assert.equal(b.ui('.panel'),undefined);assert.equal(b.sent.length,0);assert.equal(b.map.size,0);}
});
test('SPA paths are checked without overriding history; query and fragment are excluded',async()=>{
 const b=browser();b.ui('.accept').click();await b.flush();b.advance(45000);b.location.pathname='/about.html';b.tick();await b.flush();assert.equal(b.sent.at(-1).body.path,'/about.html');assert(!JSON.stringify(b.sent).includes('private=no'));
 const count=b.sent.length;b.advance(45000);b.location.pathname='/checkout';b.tick();await b.flush();assert.equal(b.sent.length,count);
});
