import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const js=readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
const a=js.indexOf('function paginateSignals('),b=js.indexOf('function changeSignalPage(',a);
assert.ok(a>=0&&b>a);
const {paginateSignals,pageNumbers}=new Function('const SIGNALS_PER_PAGE=20;'+js.slice(a,b)+'return {paginateSignals,pageNumbers};')();
const make=n=>Array.from({length:n},(_,i)=>({id:'s'+i}));

test('Twenty per page preserves all signal rows without mutating the source',()=>{
  for(const count of [0,1,19,20,21,40,41,100]){
    const source=make(count),n=Math.max(1,Math.ceil(count/20)),result=[];
    for(let page=1;page<=n;page++){
      const p=paginateSignals(source,page);
      assert.equal(p.page,page);
      assert.equal(p.pageCount,n);
      assert.equal(p.total,count);
      assert.equal(p.from,count?(page-1)*20+1:0);
      assert.equal(p.to,Math.min(count,page*20));
      assert.ok(p.items.length<=20);
      result.push(...p.items);
    }
    assert.deepEqual(result,source);
    assert.deepEqual(source,make(count));
  }
});
test('The 21st signal begins page two; invalid page indices clamp safely',()=>{
  const source=make(41);
  assert.deepEqual(paginateSignals(source,1).items,source.slice(0,20));
  assert.deepEqual(paginateSignals(source,2).items,source.slice(20,40));
  assert.deepEqual(paginateSignals(source,3).items,source.slice(40));
  assert.equal(paginateSignals(source,99).page,3);
  assert.equal(paginateSignals(source,-5).page,1);
  assert.equal(paginateSignals([],99).page,1);
});
test('Compact controls support large page counts',()=>{
  assert.deepEqual(pageNumbers(1,3),[1,2,3]);
  assert.ok(pageNumbers(10,20).includes('…'));
  assert.ok(pageNumbers(10,20).includes(10));
  assert.equal(pageNumbers(10,20)[0],1);
  assert.equal(pageNumbers(10,20).at(-1),20);
});
test('Market changes reset to page one; stats and signal UX remain',()=>{
  assert.match(js,/state\.market=market;\s*state\.page=1;/);
  assert.ok(js.includes('renderSummary();renderRows();renderPagination();'));
  assert.ok(js.includes('function refreshFreshSignalClock('));
  assert.ok(js.includes('function ensureDetail('));
  assert.ok(html.includes('id="signalPagination"'));
  assert.ok(html.includes('id="signalBoard"'));
  assert.ok(css.includes('.member-pagination[hidden]'));
});
