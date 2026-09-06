import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNowgoalRoster,parseNowgoalStatsHtml} from '../src/nowgoal-stats.js';

test('Nowgoal roster parser keeps live match identity and score',()=>{
  const js=`A[0]=[3048409,'x','x','x','Sikkim Police','Red Panda FC','2026-09-06','x',3,2,1];\nA[1]=[3048410,'x','x','x','Ended A','Ended B','2026-09-06','x',-1,1,1];`;
  const rows=parseNowgoalRoster(js);
  assert.equal(rows.length,1);
  assert.equal(rows[0].sourceMatchId,'3048409');
  assert.equal(rows[0].home,'Sikkim Police');
  assert.equal(rows[0].away,'Red Panda FC');
  assert.deepEqual(rows[0].score,{home:2,away:1});
});

test('Nowgoal detail parser reads FT SOT Shot Off and possession',()=>{
  const html=`
    <html><body>
      <h2>Statistics</h2>
      <ul>
        <li><span>21</span><span>Shots</span><span>8</span></li>
        <li><span>10</span><span>Shots on Goal</span><span>5</span></li>
        <li><span>81</span><span>Attacks</span><span>61</span></li>
        <li><span>52</span><span>Dangerous Attacks</span><span>31</span></li>
        <li><span>11</span><span>Shots off Goal</span><span>3</span></li>
        <li><span>61%</span><span>Possession</span><span>39%</span></li>
      </ul>
      <h2>Team Statistics</h2>
      <div>4.3 Shots on Goal 2.1</div>
    </body></html>`;
  const out=parseNowgoalStatsHtml(html);
  assert.equal(out.usable,true);
  assert.deepEqual(out.shots_on_target,{home:10,away:5});
  assert.deepEqual(out.shots_off_target,{home:11,away:3});
  assert.deepEqual(out.possession,{home:61,away:39});
});

test('Nowgoal detail parser does not fabricate missing Shot Off',()=>{
  const html=`<h2>Statistics</h2><div>4 Shots on Goal 2</div><h2>Team Statistics</h2>`;
  const out=parseNowgoalStatsHtml(html);
  assert.deepEqual(out.shots_on_target,{home:4,away:2});
  assert.equal(out.shots_off_target,null);
  assert.equal(out.usable,true);
});

test('Nowgoal detail parser returns unusable when current statistics are absent',()=>{
  const html=`<title>Match Detail, Lineup, Statistics</title><h2>Team Statistics</h2><div>3 Shots on Goal 4</div>`;
  const out=parseNowgoalStatsHtml(html);
  assert.equal(out.usable,false);
  assert.equal(out.shots_on_target,null);
  assert.equal(out.shots_off_target,null);
});
