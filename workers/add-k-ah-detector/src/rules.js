export const DEFAULT_CONFIG=Object.freeze({
  enabled:false,
  minuteFrom:70,
  minuteTo:82,
  checksPerMatch:4,
  side:'BOTH',
  sotMin:1,
  shotOffMin:1,
  cornerMin:1,
  attackShare:1,
  dangerousShare:1,
  attackRate:1,
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
  const legacyAttack=finite(raw.attackShare)?raw.attackShare:raw.attackShareMin;
  const legacyDangerous=finite(raw.dangerousShare)?raw.dangerousShare:raw.dangerousShareMin;
  const legacyRate=finite(raw.attackRate)?raw.attackRate:raw.attackRateMin;
  const c={...DEFAULT_CONFIG,...raw};
  c.enabled=Boolean(c.enabled);
  c.minuteFrom=Math.round(num(c.minuteFrom,70));
  c.minuteTo=Math.round(num(c.minuteTo,82));
  c.checksPerMatch=4;
  c.side=['HOME','AWAY','BOTH'].includes(String(c.side).toUpperCase())?String(c.side).toUpperCase():'BOTH';
  c.sotMin=num(c.sotMin,DEFAULT_CONFIG.sotMin);
  c.shotOffMin=num(c.shotOffMin,DEFAULT_CONFIG.shotOffMin);
  c.cornerMin=num(c.cornerMin,DEFAULT_CONFIG.cornerMin);
  c.attackShare=num(legacyAttack,DEFAULT_CONFIG.attackShare);
  c.dangerousShare=num(legacyDangerous,DEFAULT_CONFIG.dangerousShare);
  c.attackRate=num(legacyRate,DEFAULT_CONFIG.attackRate);
  c.ahMin=num(c.ahMin,DEFAULT_CONFIG.ahMin);
  c.ahMax=num(c.ahMax,DEFAULT_CONFIG.ahMax);
  c.oddsMin=num(c.oddsMin,DEFAULT_CONFIG.oddsMin);
  c.oddsMax=num(c.oddsMax,DEFAULT_CONFIG.oddsMax);
  c.sourceMaxAgeSeconds=num(c.sourceMaxAgeSeconds,DEFAULT_CONFIG.sourceMaxAgeSeconds);

  if(c.minuteFrom<1||c.minuteTo>120||c.minuteFrom>=c.minuteTo)throw new Error('ช่วงเวลาตรวจไม่ถูกต้อง');
  assertRange(c.sotMin,1,100,'ยิงเข้ากรอบขั้นต่ำ');
  assertRange(c.shotOffMin,1,100,'ยิงออกกรอบขั้นต่ำ');
  assertRange(c.cornerMin,1,100,'เตะมุมขั้นต่ำ');
  assertRange(c.attackShare,1,100,'สัดส่วนการบุก');
  assertRange(c.dangerousShare,1,100,'สัดส่วนการบุกอันตราย');
  assertRange(c.attackRate,1,100,'อัตราการบุก');
  assertRange(c.ahMin,-5,10,'แต้มต่อ AH');
  assertRange(c.ahMax,-5,10,'แต้มต่อ AH');
  assertRange(c.oddsMin,1.01,10,'ราคา AH');
  assertRange(c.oddsMax,1.01,10,'ราคา AH');
  assertRange(c.sourceMaxAgeSeconds,1,3600,'อายุราคา');

  if(c.ahMin>c.ahMax)throw new Error('ช่วงแต้มต่อ AH ไม่ถูกต้อง');
  if(c.oddsMin>c.oddsMax)throw new Error('ช่วงราคา AH ไม่ถูกต้อง');

  delete c.attackShareMin;
  delete c.attackShareMax;
  delete c.dangerousShareMin;
  delete c.dangerousShareMax;
  delete c.attackRateMin;
  delete c.attackRateMax;
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
const atLeast=(v,min)=>finite(v)&&Number(v)>=min;

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
    attack:atLeast(attackShare,c.attackShare),
    dangerous:atLeast(dangerousShare,c.dangerousShare),
    attackRate:atLeast(attackRate,c.attackRate),
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
