(()=>{
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  function settleHalf(diff,line){
    const x=diff+line;
    return x>0?'WIN':x<0?'LOSS':'PUSH';
  }
  function splitQuarter(line){
    const q=Math.round(line*4)/4;
    const frac=Math.abs(q*4)%2;
    if(frac===0)return [q];
    const low=Math.floor(q*2)/2;
    const high=Math.ceil(q*2)/2;
    return [low,high];
  }
  function settleAH({homeScore,awayScore,line,selection='home',odds=2}){
    const hs=num(homeScore),as=num(awayScore),ln=num(line),od=num(odds);
    if(hs==null||as==null||ln==null)return {status:'UNSETTLED',units:0,legs:[]};
    const sel=String(selection).toLowerCase()==='away'?'away':'home';
    const diff=sel==='home'?hs-as:as-hs;
    const legs=splitQuarter(ln).map(l=>({line:l,result:settleHalf(diff,l)}));
    const unitPerLeg=1/legs.length;
    let units=0;
    for(const leg of legs){
      if(leg.result==='WIN')units+=unitPerLeg*((od??2)-1);
      else if(leg.result==='LOSS')units-=unitPerLeg;
    }
    const results=legs.map(x=>x.result);
    let status='PUSH';
    if(results.every(x=>x==='WIN'))status='WIN';
    else if(results.every(x=>x==='LOSS'))status='LOSS';
    else if(results.includes('WIN')&&results.includes('PUSH'))status='HALF_WIN';
    else if(results.includes('LOSS')&&results.includes('PUSH'))status='HALF_LOSS';
    else if(results.includes('WIN')&&results.includes('LOSS'))status=units>0?'WIN':units<0?'LOSS':'PUSH';
    return {status,units:Number(units.toFixed(4)),legs};
  }
  window.NOMAD341Settlement={version:'1.0-clean',settleAH};
})();
