const clamp=(n,min=0,max=100)=>Math.min(max,Math.max(min,n));
const round4=n=>Math.round(Number(n)*10000)/10000;
const safeNum=v=>Number.isFinite(Number(v))?Number(v):null;

export function parseSplitLine(raw){
  if(raw==null||raw==='') return null;
  const s=String(raw).trim();
  const parts=s.split('/').map(x=>x.trim()).filter(Boolean);
  if(!parts.length) return null;
  const first=Number(parts[0]);
  if(!Number.isFinite(first)) return null;
  if(parts.length===1) return first;
  let second=Number(parts[1]);
  if(!Number.isFinite(second)) return first;
  if(!/^[+-]/.test(parts[1]) && first<0) second=-Math.abs(second);
  if(!/^[+-]/.test(parts[1]) && first>0) second=Math.abs(second);
  return round4((first+second)/2);
}

export function splitQuarter(line){
  const n=safeNum(line);if(n==null)return [];
  const q=Math.round(n*4)/4;
  const frac=Math.abs(q*4)%2;
  if(frac!==1)return [q];
  const low=Math.floor(Math.abs(q)*2)/2;
  const high=low+.5;
  const sign=q<0?-1:1;
  return [round4(sign*low),round4(sign*high)];
}

function poisson(lambda,k){
  let f=1;for(let i=2;i<=k;i++)f*=i;
  return Math.exp(-lambda)*Math.pow(lambda,k)/f;
}
function scoreGrid(lambdaHome,lambdaAway,maxGoals=10){
  const rows=[];let mass=0;
  for(let h=0;h<=maxGoals;h++)for(let a=0;a<=maxGoals;a++){
    const p=poisson(lambdaHome,h)*poisson(lambdaAway,a);mass+=p;rows.push({h,a,p});
  }
  if(mass>0)for(const r of rows)r.p/=mass;
  return rows;
}
function fairOdds(p){return p>0?round4(Math.min(20,Math.max(1.01,1/p))):null}
function confidence(p){return p==null?null:clamp(Math.round(p*100),1,99)}
function expectedGoals(analysis={}){
  const hv=analysis.homeVenue||{},av=analysis.awayVenue||{};
  const lh=Math.max(.2,((safeNum(hv.gfpg)??1.2)+(safeNum(av.gapg)??1.2))/2);
  const la=Math.max(.2,((safeNum(av.gfpg)??1.1)+(safeNum(hv.gapg)??1.1))/2);
  return {home:round4(lh),away:round4(la)};
}
function implied1x2(oneX2={}){
  const h=safeNum(oneX2.home),d=safeNum(oneX2.draw),a=safeNum(oneX2.away);
  if(!h||!d||!a)return null;
  const ih=1/h,id=1/d,ia=1/a,sum=ih+id+ia;
  return {home:ih/sum,draw:id/sum,away:ia/sum};
}
function outcomeScore(parts){
  if(!parts.length)return null;
  return parts.reduce((s,x)=>s+x,0)/parts.length;
}
function ahProbability(grid,side,handicap){
  const lines=splitQuarter(handicap);if(!lines.length)return null;
  let p=0;
  for(const r of grid){
    const diff=side==='home'?r.h-r.a:r.a-r.h;
    const scores=lines.map(line=>diff+line>0?1:diff+line===0?.5:0);
    p+=r.p*outcomeScore(scores);
  }
  return p;
}
function totalProbability(grid,selection,line){
  const lines=splitQuarter(line);if(!lines.length)return null;
  let p=0;
  for(const r of grid){
    const total=r.h+r.a;
    const scores=lines.map(x=>selection==='OVER'?(total>x?1:total===x?.5:0):(total<x?1:total===x?.5:0));
    p+=r.p*outcomeScore(scores);
  }
  return p;
}
function bttsProbability(grid){return grid.reduce((s,r)=>s+(r.h>0&&r.a>0?r.p:0),0)}
function oddProbability(grid){return grid.reduce((s,r)=>s+(((r.h+r.a)%2)===1?r.p:0),0)}

export function buildMarketPredictions(match){
  const market=match?.context?.market||{};
  const current=market.current||{};
  const analysis=match.analysis||{};
  const side=match.pickSide==='away'?'away':'home';
  const goals=expectedGoals(analysis),grid=scoreGrid(goals.home,goals.away);
  const oneX2Prob=implied1x2(current.oneX2)||null;
  const out={};

  out.oneX2={key:'1X2',name:'1X2',selection:side==='home'?'HOME':'AWAY',label:match.pick,odds:safeNum(match.odds),oddsType:'MARKET',confidence:safeNum(match.confidence),status:match.status||'PENDING'};

  const asian=current.asian;
  if(asian?.line!=null){
    const raw=parseSplitLine(asian.line);
    if(raw!=null){
      const homeHcp=round4(-raw),awayHcp=round4(raw);
      const ph=ahProbability(grid,'home',homeHcp),pa=ahProbability(grid,'away',awayHcp);
      const ahSide=(ph??0)>=(pa??0)?'home':'away';
      const handicap=ahSide==='home'?homeHcp:awayHcp;
      const odd=ahSide==='home'?safeNum(asian.home):safeNum(asian.away);
      const team=ahSide==='home'?match.home:match.away;
      out.ah={key:'AH',name:'Asian Handicap',selection:ahSide.toUpperCase(),side:ahSide,handicap,lineRaw:String(asian.line),label:`${team} ${handicap>0?'+':''}${handicap}`,odds:odd,oddsType:'MARKET',confidence:confidence(ahSide==='home'?ph:pa),status:'PENDING'};
    }
  }

  const totals=current.totals;
  if(totals?.line!=null){
    const line=parseSplitLine(totals.line);
    if(line!=null){
      const po=totalProbability(grid,'OVER',line),pu=totalProbability(grid,'UNDER',line);
      const selection=(po??0)>=(pu??0)?'OVER':'UNDER';
      out.totals={key:'OU',name:'Over / Under',selection,line,lineRaw:String(totals.line),label:`${selection} ${totals.line}`,odds:selection==='OVER'?safeNum(totals.over):safeNum(totals.under),oddsType:'MARKET',confidence:confidence(selection==='OVER'?po:pu),status:'PENDING'};
    }
  }

  const pYes=bttsProbability(grid),btts=pYes>=.5?'YES':'NO',pBtts=btts==='YES'?pYes:1-pYes;
  out.btts={key:'BTTS',name:'Both Teams To Score',selection:btts,label:`BTTS ${btts}`,odds:fairOdds(pBtts),oddsType:'MODEL FAIR',confidence:confidence(pBtts),status:'PENDING'};

  let dcProb=null;
  if(oneX2Prob)dcProb=side==='home'?oneX2Prob.home+oneX2Prob.draw:oneX2Prob.away+oneX2Prob.draw;
  else dcProb=grid.reduce((s,r)=>s+((side==='home'?(r.h>=r.a):(r.a>=r.h))?r.p:0),0);
  const dcSel=side==='home'?'1X':'X2';
  out.doubleChance={key:'DC',name:'Win or Draw',selection:dcSel,label:side==='home'?`${match.home} or Draw`:`${match.away} or Draw`,odds:fairOdds(dcProb),oddsType:'MODEL FAIR',confidence:confidence(dcProb),status:'PENDING'};

  const pOdd=oddProbability(grid),oe=pOdd>=.5?'ODD':'EVEN',pOe=oe==='ODD'?pOdd:1-pOdd;
  out.oddEven={key:'OE',name:'Score Odd / Even',selection:oe,label:oe,odds:fairOdds(pOe),oddsType:'MODEL FAIR',confidence:confidence(pOe),status:'PENDING'};
  return out;
}

function combineGrades(grades){
  if(!grades.length)return 'N/A';
  const wins=grades.filter(x=>x==='WIN').length,push=grades.filter(x=>x==='PUSH').length,loss=grades.filter(x=>x==='LOSS').length;
  if(wins===grades.length)return 'WIN';
  if(loss===grades.length)return 'LOSS';
  if(push===grades.length)return 'PUSH';
  if(wins&&push&&!loss)return 'HALF_WIN';
  if(loss&&push&&!wins)return 'HALF_LOSS';
  if(wins===loss)return 'PUSH';
  return wins>loss?'HALF_WIN':'HALF_LOSS';
}
function settleAh(m,hg,ag){
  const diff=m.side==='home'?hg-ag:ag-hg;
  const lines=splitQuarter(m.handicap);return combineGrades(lines.map(x=>diff+x>0?'WIN':diff+x===0?'PUSH':'LOSS'));
}
function settleOu(m,hg,ag){
  const total=hg+ag,lines=splitQuarter(m.line);
  return combineGrades(lines.map(x=>m.selection==='OVER'?(total>x?'WIN':total===x?'PUSH':'LOSS'):(total<x?'WIN':total===x?'PUSH':'LOSS')));
}
export function settleMarket(m,hg,ag){
  if(!m)return null;
  switch(m.key){
    case '1X2':{
      const result=hg>ag?'HOME':ag>hg?'AWAY':'DRAW';return result===m.selection?'WIN':'LOSS';
    }
    case 'AH':return settleAh(m,hg,ag);
    case 'OU':return settleOu(m,hg,ag);
    case 'BTTS':return ((hg>0&&ag>0)?'YES':'NO')===m.selection?'WIN':'LOSS';
    case 'DC':return m.selection==='1X'?(hg>=ag?'WIN':'LOSS'):(ag>=hg?'WIN':'LOSS');
    case 'OE':return (((hg+ag)%2)===1?'ODD':'EVEN')===m.selection?'WIN':'LOSS';
    default:return null;
  }
}
export function settleMarkets(match,hg,ag,settledAtUtc=new Date().toISOString()){
  if(!match.markets)match.markets=buildMarketPredictions(match);
  for(const m of Object.values(match.markets||{})){
    const status=settleMarket(m,hg,ag);if(status){m.status=status;m.finalScore=`${hg}-${ag}`;m.settledAtUtc=settledAtUtc;}
  }
  const result=hg>ag?'HOME':ag>hg?'AWAY':'DRAW';
  match.matchResult=result;match.finalScore=`${hg}-${ag}`;match.settledAtUtc=settledAtUtc;
  const core=match.markets?.oneX2?.status;
  if(core)match.status=core;
  return match;
}
