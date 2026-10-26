import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./snapshot-browser.js',import.meta.url),'utf8');
function boot(snapshot){
 let observer,requests=0;
 class Node{
  constructor(){this.dataset={};this.children=[];this.handlers={};}
  setAttribute(k,v){this[k]=v;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(name,fn){this.handlers[name]=fn;}
 }
 const host=new Node(),card=new Node();card.dataset.fixtureId='1';card.querySelector=()=>host;
 const forbidden=()=>{requests++;throw Error('NETWORK_ON_EXPANSION');};
 const context={window:{__B46_LAST5_SNAPSHOT__:snapshot},document:{querySelector:()=>card,createElement:()=>new Node()},
 MutationObserver:class{constructor(fn){observer=fn;}observe(){}},fetch:forbidden,XMLHttpRequest:forbidden,WebSocket:forbidden};
 runInNewContext(source,context);
 return {button:host.children[0],detail:host.children[1],card,change(id){card.dataset.fixtureId=id;observer();},requests:()=>requests};
}
const row={result:'W',opponent:{name:'Real captured opponent'},kickoffUtc:'2026-10-01T12:00:00Z',venue:'H',gf:1,ga:0};
const snap=()=>({schema:'ball46.last5.snapshot.v1',source:'verified-stored-FT',fixtures:{'1':{fixtureId:'1',home:{rows:[row]},away:{rows:[]}}}});
test('absent, empty or wrong-source snapshot hides Last5',()=>{
 const empty=snap();empty.fixtures['1'].home.rows=[];
 for(const s of [undefined,empty,{...snap(),source:'unverified'}]){
  const ui=boot(s);assert.equal(ui.button.hidden,true);assert.equal(ui.detail.hidden,true);assert.equal(ui.requests(),0);
 }
});
test('available partial history opens and closes without network',()=>{
 const ui=boot(snap());assert.equal(ui.button.hidden,false);
 for(let i=0;i<6;i++)ui.button.handlers.click();
 assert.equal(ui.detail.hidden,true);assert.equal(ui.requests(),0);
});
test('fixture switch clears old history and hides unavailable control',()=>{
 const ui=boot(snap());ui.button.handlers.click();ui.change('2');
 assert.equal(ui.button.hidden,true);assert.equal(ui.detail.hidden,true);assert.equal(ui.detail.children.length,0);assert.equal(ui.requests(),0);
});
