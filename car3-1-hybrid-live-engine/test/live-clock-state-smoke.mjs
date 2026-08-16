import assert from 'node:assert/strict';

function makeClock(){
  const clockState=new Map();
  return function liveClock(row,now){
    const minute=Number(row.minute),key=String(row.sourceMatchId);
    const sourceMinute=Math.max(0,Math.round(minute)),sourceFloor=sourceMinute*60;
    let state=clockState.get(key);
    if(!state){state={sourceMinute,anchorSeconds:sourceFloor,anchorAt:now,lastSeconds:sourceFloor};clockState.set(key,state);}else{
      const carried=state.anchorSeconds+Math.max(0,Math.floor((now-state.anchorAt)/1000));
      state.lastSeconds=Math.max(state.lastSeconds,carried);
      if(sourceMinute>state.sourceMinute){const synced=Math.max(state.lastSeconds,sourceFloor);state={sourceMinute,anchorSeconds:synced,anchorAt:now,lastSeconds:synced};clockState.set(key,state);}
    }
    const elapsed=Math.max(0,Math.floor((now-state.anchorAt)/1000));
    const seconds=Math.max(state.lastSeconds,state.anchorSeconds+elapsed,sourceFloor);
    state.lastSeconds=seconds;
    return seconds;
  };
}

const clock=makeClock();
assert.equal(clock({sourceMatchId:'A',minute:67},0),4020);
assert.equal(clock({sourceMatchId:'A',minute:67},20000),4040);
assert.equal(clock({sourceMatchId:'B',minute:54},20000),3240);
assert.equal(clock({sourceMatchId:'A',minute:67},40000),4060,'returning to match A must continue, not reset');
assert.equal(clock({sourceMatchId:'A',minute:68},45000),4080,'newer source minute must sync forward to the source minute');
assert.equal(clock({sourceMatchId:'A',minute:68,sourceFreshnessSeconds:0},50000),4085,'freshness must not reset the clock');
console.log('LIVE TIME per-match state smoke: PASS');
