import test from 'node:test';
import assert from 'node:assert/strict';
import {parseToday,parseLiveDetail} from '../src/totalcorner.js';

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

test('live detail parser returns event evidence needed by NOMAD',()=>{
  const html=`<html><body>Live Events Status: 74, Score: 0 - 0, Corner: 3 - 2
    56 Attack 47
    31 Dangerous Attack 24
    3 Shoot on target 2
    6 Shoot off target 5
  </body></html>`;
  const live=parseLiveDetail(html);
  assert.equal(live.valid,true);
  assert.equal(live.minute,74);
  assert.deepEqual(live.score,{home:0,away:0});
  assert.deepEqual(live.stats.attacks,{home:56,away:47});
  assert.deepEqual(live.stats.dangerous,{home:31,away:24});
  assert.deepEqual(live.stats.sot,{home:3,away:2});
  assert.deepEqual(live.stats.off,{home:6,away:5});
  assert.deepEqual(live.stats.corner,{home:3,away:2});
});
