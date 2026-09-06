export const DEFAULT_CONFIG=Object.freeze({
  enabled:false,
  minuteFrom:70,
  minuteTo:82,
  checksPerMatch:4,
  side:'BOTH',
  sotMin:1,
  shotOffMin:1,
  cornerMin:1,
  attackShareMin:1,
  attackShareMax:100,
  dangerousShareMin:1,
  dangerousShareMax:100,
  attackRateMin:1,
  attackRateMax:100,
  ahMin:-5,
  ahMax:10,
  oddsMin:1.01,
  oddsMax:10,
  sourceMaxAgeSeconds:90
});

const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const num=(v,d)=>finite(v)?Number(v):d;
const assertRange=(value,min,max,label)=>{
  if(!finite(value)||Number(value)<min||Number(value)>max)throw new Error(`${label} ต้องอยู่ระหว่าง ${min} ถึง ${max}`);
};

export function normalizeConfig(raw={}){
  const c={...DEFAULT_CONFIG,...raw};
  c.enabled=Boolean(c.enabled);
  c.minuteFrom=Math.round(num(c.minuteFrom,70));
  c.minuteTo=Math.round(num(c.minuteTo,82));
  c.checksPerMatch=4;
  c.side=['HOME','AWAY','BOTH'].includes(String(c.side).toUpperCase())?String(c.side).toUpperCase():'BOTH';
  for(const k of ['sotMin','shotOffMin','cornerMin','attackShareMin','attackShareMax','dangerousShareMin','dangerousShareMax','attackRateMin','attackRateMax','ahMin','ahMax','oddsMin','oddsMax','sourceMaxAgeSeconds'])c[k]=num(c[k],DEFAULT_CONFIG[k]);

  if(c.minuteFrom<1||c.minuteTo>120||c.minuteFrom>=c.minuteTo)throw new Error('ช่วงเวลาตรวจไม่ถูกต้อง');
  assertRange(c.sotMin,1,100,'ยิงเข้ากรอบขั้นต่ำ');
  assertRange(c.shotOffMin,1,100,'ยิงออกกรอบขั้นต่ำ');
  assertRange(c.cornerMin,1,100,'เตะมุมขั้นต่ำ');
  for(const k of ['attackShareMin','attackShareMax','dangerousShareMin','dangerousShareMax','attackRateMin','attackRateMax'])assertRange(c[k],1,100,'เปอร์เซ็นต์การบุก');
  assertRange(c.ahMin,-5,10,'แต้มต่อ AH');
  assertRange(c.ahMax,-5,10,'แต้มต่อ AH');
  assertRange(c.oddsMin,1.01,10,'ราคา AH');
  assertRange(c.oddsMax,1.01,10,'ราคา AH');
  assertRange(c.sourceMaxAgeSeconds,1,3600,'อายุราคา');

  for(const [a,b,label] of [
    ['attackShareMin','attackShareMax','ช่วงสัดส่วนการบุก'],
    ['dangerousShareMin','dangerousShareMax','ช่วงสัดส่วนการบุกอันตราย'],
    ['attackRateMin','attackRateMax','ช่วงอัตราการบุก'],
    ['ahMin','ahMax','ช่วงแต้มต่อ AH'],
    ['oddsMin','oddsMax','ช่วงราคา AH']
  ])if(c[a]>c[b])throw new Error(`${label} ไม่ถูกต้อง`);

  return c;
}

export function schedule(c){
  const cfg=normalizeConfig(c);
  const step=(cfg.minuteTo-cfg.minuteFrom)/3;
  return [0,1,2,3].map(i=>Number((cfg.minuteFrom+step*i).toFixed(2)));
}

const share=(a,b)=>{
  if(!finite(a)||!finite(b))return null;
  const x=Number(a),y=Number(b),sum=x+y;
  return sum>0?x/sum*100:null;
};
const within=(v,a,b)=>finite(v)&&Number(v)>=a&&Number(v)<=b;

export function evaluate(input,cfg){
  const c=normalizeConfig(cfg);
  const s=input.side==='AWAY'?'away':'home';
  const o=s==='home'?'away':'home';
  const st=input.stats||{};
  const attackShare=share(st.attacks?.[s],st.attacks?.[o]);
  const dangerousShare=share(st.dangerous?.[s],st.dangerous?.[o]);
  const attackRate=attackShare==null||dangerousShare==null?null:attackShare*.4+dangerousShare*.6;
  const homeLine=finite(input.market?.line)?Number(input.market.line):null;
  const line=homeLine==null?null:(s==='home'?homeLine:-homeLine);
  const odds=s==='home'?input.market?.homeOdds:input.market?.awayOdds;
  const checks={
    sot:num(st.sot?.[s],null)>=c.sotMin,
    shotOff:num(st.shotOff?.[s],null)>=c.shotOffMin,
    corner:num(st.corners?.[s],null)>=c.cornerMin,
    attack:within(attackShare,c.attackShareMin,c.attackShareMax),
    dangerous:within(dangerousShare,c.dangerousShareMin,c.dangerousShareMax),
    attackRate:within(attackRate,c.attackRateMin,c.attackRateMax),
    ah:within(line,c.ahMin,c.ahMax),
    odds:within(odds,c.oddsMin,c.oddsMax),
    nowgoal:input.market?.source==='Nowgoal'
  };
  return{
    passed:Object.values(checks).every(Boolean),
    checks,
    metrics:{attackShare,dangerousShare,attackRate,line,odds:finite(odds)?Number(odds):null}
  };
}
