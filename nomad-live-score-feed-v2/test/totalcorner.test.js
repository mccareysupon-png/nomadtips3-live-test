import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToday} from '../src/totalcorner.js';

test('today parser keeps live minute separate from numeric team names',()=>{
  const html=`<table><tr>
    <td><a href="/league/view/10">Test League</a></td>
    <td class="match_status">67</td>
    <td><a href="/team/view/11">River City</a></td>
    <td>1 - 1</td>
    <td><a href="/team/view/12">22 de Julio</a></td>
    <td>(4 - 2)</td>
    <td>61 - 42 38 - 21</td>
    <td><a href="/live/river-city-vs-22-de-julio/123456">Live</a></td>
    <td><a href="/stats/river-city-vs-22-de-julio/123456">Stats</a></td>
  </tr></table>`;
  const rows=parseToday(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].id,'123456');
  assert.equal(rows[0].minute,67);
  assert.equal(rows[0].home,'River City');
  assert.equal(rows[0].away,'22 de Julio');
  assert.deepEqual(rows[0].score,{home:1,away:1});
  assert.deepEqual(rows[0].stats.corner,{home:4,away:2});
  assert.deepEqual(rows[0].stats.attacks,{home:61,away:42});
  assert.deepEqual(rows[0].stats.dangerous,{home:38,away:21});
});

test('today parser keeps attack and dangerous pairs when split across cells',()=>{
  const html=`<table><tr>
    <td><a href="/league/view/10">Test League</a></td>
    <td class="match_status">59</td>
    <td><a href="/team/view/11">Home FC</a></td>
    <td>1 - 1</td>
    <td><a href="/team/view/12">Away FC</a></td>
    <td>(0 - 7)</td>
    <td>29 - 65</td>
    <td>25 - 47</td>
    <td><a href="/live/home-fc-vs-away-fc/123457">Live</a></td>
  </tr></table>`;
  const rows=parseToday(html);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].stats.attacks,{home:29,away:65});
  assert.deepEqual(rows[0].stats.dangerous,{home:25,away:47});
});

test('bare numeric values outside match_status do not become minute',()=>{
  const html=`<table><tr>
    <td><a href="/league/view/10">League 2</a></td>
    <td><a href="/team/view/11">Home</a></td>
    <td>1 - 0</td>
    <td><a href="/team/view/12">Away</a></td>
    <td>(2 - 1)</td>
    <td>40 - 25 20 - 10</td>
    <td><a href="/live/home-vs-away/123458">Live</a></td>
  </tr></table>`;
  const rows=parseToday(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].minute,null);
});
