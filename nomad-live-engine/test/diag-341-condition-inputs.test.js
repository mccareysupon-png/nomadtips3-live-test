import test from 'node:test';
import {parseToday} from '../src/parser.js';

const compactMatch=m=>({
  id:m.id,minute:m.minute,home:m.home,away:m.away,score:m.score,
  attack:m.attack,dangerousAttack:m.dangerousAttack,corner:m.corner
});

test('DIAG ONLY: print current TotalCorner rows and production detector checks',async()=>{
  try{
    const todayRes=await fetch(`https://www.totalcorner.com/match/today/?_diag=${Date.now()}`,{
      headers:{'user-agent':'Mozilla/5.0','accept':'text/html,application/xhtml+xml'},
      signal:AbortSignal.timeout(12000)
    });
    const html=await todayRes.text();
    const rows=parseToday(html).filter(m=>Number.isFinite(m.minute));
    console.log('DIAG_TOTALCORNER_STATUS',todayRes.status,'HTML',html.length,'LIVE_ROWS',rows.length);
    console.log('DIAG_TOTALCORNER_ROWS',JSON.stringify(rows.slice(0,8).map(compactMatch)));
  }catch(error){console.log('DIAG_TOTALCORNER_ERROR',String(error?.message||error));}

  try{
    const feedRes=await fetch(`https://nomadtips3-live-engine.mccarey-supon.workers.dev/feed?_diag=${Date.now()}`,{signal:AbortSignal.timeout(12000)});
    const feed=await feedRes.json();
    console.log('DIAG_FEED_STATUS',feedRes.status,'CYCLE',feed.cycle,'UPDATED',feed.updatedAt,'COUNTS',JSON.stringify(feed.counts));
    const sample=(feed.matches||[]).slice(0,10).map(m=>({
      id:m.id,minute:m.minute,home:m.home,away:m.away,state:m.state,side:m.side,
      passed:m.passed,total:m.total,detectionPassed:m.detectionPassed,
      checks:m.checks,stats:m.stats,rolling:m.rolling,
      snapshotCount:Array.isArray(m.snapshots)?m.snapshots.length:0,
      snapshotMinutes:Array.isArray(m.snapshots)?m.snapshots.map(s=>s.minute):[],
      snapshotObserved:Array.isArray(m.snapshots)?m.snapshots.map(s=>s.observedAt):[],
      freshness:m.freshness,priceStatus:m.priceStatus
    }));
    console.log('DIAG_FEED_MATCHES',JSON.stringify(sample));
  }catch(error){console.log('DIAG_FEED_ERROR',String(error?.message||error));}
});
