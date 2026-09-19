export const CEO_STRATEGY='CEO';
export const CEO_VERSION='1.0';

const num=v=>v===null||v===undefined||v===''||typeof v==='boolean'||!Number.isFinite(Number(v))?null:Number(v);
const pair=v=>v&&typeof v==='object'?{home:num(v.home),away:num(v.away)}:{home:null,away:null};
const sum=p=>{const h=num(p?.home),a=num(p?.away);return h===null&&a===null?null:(h??0)+(a??0)};
const delta=(a,b)=>{a=num(a);b=num(b);return a===null||b===null||a<b?null:a-b};
const deltaPair=(a,b)=>({home:delta(a?.home,b?.home),away:delta(a?.away,b?.away)});
const share=p=>{const h=num(p?.home),a=num(p?.away);if(h===null||a===null||h+a<=0)return {home:null,away:null};return {home:h/(h+a)*100,away:a/(h+a)*100}};
const side=(p,s)=>num(s==='HOME'?p?.home:p?.away);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function roll(history,minutes){
  if(!Array.isArray(history)||history.length<2)return null;
  const cur=history[history.length-1],target=Number(cur.at||0)-minutes*60_000;let old=null;
  for(let i=history.length-2;i>=0;i--){if(Number(history[i]?.at||0)<=target){old=history[i];break}}
  if(!old)return null;
  return {
    fromAt:old.at,toAt:cur.at,fromMinute:num(old.minute),toMinute:num(cur.minute),
    shotsOnTarget:deltaPair(cur.shotsOnTarget,old.shotsOnTarget),
    shotsOffTarget:deltaPair(cur.shotsOffTarget,old.shotsOffTarget),
    corners:deltaPair(cur.corners,old.corners),attacks:deltaPair(cur.attacks,old.attacks),
    dangerousAttacks:deltaPair(cur.dangerousAttacks,old.dangerousAttacks),
    cards:deltaPair(cur.cards,old.cards),possession:pair(cur.possession),goals:pair(cur.goals)
  };
}

function weightedPressure(r){
  if(!r)return {home:50,away:50};
  const inputs=[['dangerousAttacks',r.dangerousAttacks,32],['shotsOnTarget',r.shotsOnTarget,24],['attacks',r.attacks,18],['shotsOffTarget',r.shotsOffTarget,12],['corners',r.corners,9],['possession',r.possession,5]];
  let hw=0,aw=0,w=0;
  for(const [,p,weight] of inputs){const s=share(p);if(s.home===null)continue;hw+=s.home*weight;aw+=s.away*weight;w+=weight}
  return w?{home:hw/w,away:aw/w}:{home:50,away:50};
}

function recentChaos(f){
  const events=Array.isArray(f?.events)?f.events:[];
  const current=num(f?.minute);
  for(const e of events){
    const raw=JSON.stringify(e).toLowerCase();
    if(/red[_\s-]?card|straight[_\s-]?red/.test(raw))return true;
    if(/penalty|\bvar\b/.test(raw)){
      const m=num(e?.minute??e?.time?.minute??e?.elapsed);if(current===null||m===null||Math.abs(current-m)<=3)return true;
    }
    if(/goal/.test(raw)){
      const m=num(e?.minute??e?.time?.minute??e?.elapsed);if(current!==null&&m!==null&&current-m>=0&&current-m<=2)return true;
    }
  }
  return false;
}

function minuteWindow(key,minute){
  const m=num(minute);if(m===null)return false;
  if(key.startsWith('ht_'))return m>=15&&m<=42;
  if(key.includes('cards_'))return m>=35&&m<=82;
  if(key.includes('corner'))return m>=28&&m<=84;
  if(key==='ft_1x2'||key==='ft_ah')return m>=32&&m<=84;
  return m>=28&&m<=83;
}

function activity(r,s){
  const sot=side(r?.shotsOnTarget,s)??0,soff=side(r?.shotsOffTarget,s)??0,corners=side(r?.corners,s)??0,da=side(r?.dangerousAttacks,s)??0,att=side(r?.attacks,s)??0;
  return {sot,soff,corners,da,att,shots:sot+soff};
}
function totals(r){return {sot:sum(r?.shotsOnTarget)??0,soff:sum(r?.shotsOffTarget)??0,corners:sum(r?.corners)??0,da:sum(r?.dangerousAttacks)??0,att:sum(r?.attacks)??0,cards:sum(r?.cards)??0}}

function sideCandidate(key,f,short,trend,selection,minScore){
  const p5=weightedPressure(short),p10=weightedPressure(trend||short),a=activity(short,selection),pressure=side(p5,selection)??50,trendPressure=side(p10,selection)??50;
  const opp=selection==='HOME'?'AWAY':'HOME',oa=activity(short,opp);
  let score=35+(pressure-50)*0.72+(trendPressure-50)*0.34+a.sot*7+a.soff*2.3+a.corners*2.8;
  if(a.da>oa.da)score+=4;if(a.shots>=2)score+=4;if(pressure>=64&&trendPressure>=58)score+=5;
  const g=pair(f?.goals),trail=selection==='HOME'?(g.away??0)-(g.home??0):(g.home??0)-(g.away??0);
  if(key.includes('1x2')&&trail>0)score-=18;if(key.includes('_ah')&&trail>1)score-=16;
  score=clamp(score,0,100);
  if(score<minScore||pressure<60||a.sot<1||(a.shots<2&&a.corners<1))return null;
  return {score,pressure,trendPressure,a,reasonCodes:['PRESSURE_EDGE','EVENT_EVIDENCE',trendPressure>=58?'TREND_SUPPORT':'SHORT_PRESSURE']};
}

function overCandidate(key,short,trend,minScore){
  const t=totals(short),p5=weightedPressure(short),p10=weightedPressure(trend||short),balanced=Math.min(p5.home,p5.away);
  let score=31+t.sot*10+t.soff*3+t.corners*3+Math.min(12,t.da*.35)+Math.min(7,t.att*.08);
  if(t.sot>=2)score+=7;if(t.sot>=1&&t.soff>=2)score+=5;if(balanced>=32)score+=4;
  if(key.includes('corner'))score=28+t.corners*14+t.soff*3+Math.min(16,t.da*.42)+(t.corners>=1?8:0);
  if(key.includes('cards'))score=25+t.cards*18+Math.min(18,t.da*.35)+Math.min(8,t.att*.08);
  score=clamp(score,0,100);
  const primary=key.includes('corner')?t.corners>=1:key.includes('cards')?t.cards>=1:t.sot>=1;
  if(score<minScore||!primary)return null;
  return {score,reasonCodes:['TEMPO_ACTIVE',primary?'PRIMARY_EVENT':'',Math.abs(p10.home-p5.home)<=18?'TREND_STABLE':'TREND_SHIFT'].filter(Boolean)};
}

function underCandidate(key,short,trend,minScore){
  const t=totals(short),p5=weightedPressure(short),p10=weightedPressure(trend||short);
  let score=82-t.sot*15-t.soff*5-t.corners*6-Math.min(20,t.da*.45)-Math.min(8,t.att*.08);
  if(key.includes('corner'))score=84-t.corners*24-t.soff*5-Math.min(24,t.da*.5);
  if(key.includes('cards'))score=82-t.cards*28-Math.min(20,t.da*.35)-Math.min(8,t.att*.08);
  if(Math.max(p5.home,p5.away)>72)score-=7;if(Math.max(p10.home,p10.away)>70)score-=5;
  score=clamp(score,0,100);
  const quiet=key.includes('corner')?t.corners<=1:key.includes('cards')?t.cards<=1:t.sot<=1&&t.soff<=3;
  if(score<minScore||!quiet)return null;
  return {score,reasonCodes:['LOW_TEMPO','LOW_EVENT_RATE','TREND_CONTROL']};
}

function bttsCandidate(key,short,trend,minScore){
  const p=weightedPressure(short),home=activity(short,'HOME'),away=activity(short,'AWAY'),g=short?.goals||{};
  if(key==='ft_btts_yes'){
    let score=38+Math.min(18,home.shots*4)+Math.min(18,away.shots*4)+(home.sot>0?8:0)+(away.sot>0?8:0)+(Math.min(p.home,p.away)>=34?8:0);
    score=clamp(score,0,100);if(score<minScore||home.sot<1||away.sot<1)return null;
    return {selection:'YES',score,reasonCodes:['BOTH_SIDES_ACTIVE','BOTH_SIDES_SOT','BALANCED_THREAT']};
  }
  const weak=p.home<p.away?'HOME':'AWAY',wa=weak==='HOME'?home:away,weakPressure=side(p,weak)??50;
  let score=45+(40-weakPressure)*.9+(wa.sot===0?12:0)+(wa.shots<=1?9:0);
  if((g.home??0)>0&&(g.away??0)>0)score=0;score=clamp(score,0,100);
  if(score<minScore||wa.sot>0||weakPressure>36)return null;
  return {selection:'NO',score,reasonCodes:['ONE_SIDE_SUPPRESSED','NO_RECENT_SOT','PRESSURE_IMBALANCE']};
}

function cardAhCandidate(short,minScore){
  const c=short?.cards||{},h=num(c.home)??0,a=num(c.away)??0;if(h===a||Math.max(h,a)<2)return null;
  const selection=h>a?'HOME':'AWAY',score=clamp(58+Math.abs(h-a)*9,0,100);if(score<minScore)return null;
  return {selection,score,reasonCodes:['CARD_RATE_EDGE','CARD_IMBALANCE']};
}

const MIN_SCORE={
  ft_1x2:74,ft_ah:70,ft_over:69,ft_under:72,
  ht_1x2:76,ht_ah:72,ht_over:70,ht_under:73,
  ft_corner_over:70,ft_corner_under:73,ht_corner_over:72,ht_corner_under:74,ft_corner_ah:75,
  ft_cards_over:76,ft_cards_under:77,ft_cards_ah:80,ft_btts_yes:75,ft_btts_no:76
};

export const CEO_PRICE_SETTINGS=Object.freeze({
  ft_1x2:{oddsMin:1.62,oddsMax:2.55},ft_ah:{oddsMin:1.58,oddsMax:2.35,lineMin:-1.25,lineMax:1.25},
  ft_over:{oddsMin:1.58,oddsMax:2.30,lineMin:.5,lineGapMax:1},ft_under:{oddsMin:1.58,oddsMax:2.30,lineMin:.5,lineMax:20},
  ht_1x2:{oddsMin:1.62,oddsMax:2.45},ht_ah:{oddsMin:1.58,oddsMax:2.30,lineMin:-1,lineMax:1},
  ht_over:{oddsMin:1.58,oddsMax:2.25,lineMin:.5,lineGapMax:.75},ht_under:{oddsMin:1.58,oddsMax:2.25,lineMin:.5,lineMax:10},
  ft_corner_over:{oddsMin:1.58,oddsMax:2.35,lineMin:.5,lineGapMax:1.5},ft_corner_under:{oddsMin:1.58,oddsMax:2.35,lineMin:.5,lineMax:30},
  ht_corner_over:{oddsMin:1.60,oddsMax:2.30,lineMin:.5,lineGapMax:1},ht_corner_under:{oddsMin:1.60,oddsMax:2.30,lineMin:.5,lineMax:20},
  ft_corner_ah:{oddsMin:1.62,oddsMax:2.30,lineMin:-3,lineMax:3},
  ft_cards_over:{oddsMin:1.62,oddsMax:2.30,lineMin:.5,lineGapMax:1.5},ft_cards_under:{oddsMin:1.62,oddsMax:2.30,lineMin:.5,lineMax:30},
  ft_cards_ah:{oddsMin:1.65,oddsMax:2.25,lineMin:-2,lineMax:2},ft_btts_yes:{oddsMin:1.62,oddsMax:2.30},ft_btts_no:{oddsMin:1.62,oddsMax:2.30}
});

export function ceoCandidatesForFixture(f,history,marketKeys=[]){
  if(recentChaos(f))return [];
  const short=roll(history,5),trend=roll(history,10);if(!short)return [];
  const out=[];
  for(const key of marketKeys){
    if(!MIN_SCORE[key]||!minuteWindow(key,f?.minute))continue;
    let r=null;
    if(key.includes('1x2')||key.endsWith('_ah')){
      if(key==='ft_cards_ah')r=cardAhCandidate(short,MIN_SCORE[key]);
      else{
        const p=weightedPressure(short),selection=p.home>=p.away?'HOME':'AWAY';
        r=sideCandidate(key,f,short,trend,selection,MIN_SCORE[key]);if(r)r.selection=selection;
      }
    }else if(key.endsWith('_over')){r=overCandidate(key,short,trend,MIN_SCORE[key]);if(r)r.selection='OVER'}
    else if(key.endsWith('_under')){r=underCandidate(key,short,trend,MIN_SCORE[key]);if(r)r.selection='UNDER'}
    else if(key.startsWith('ft_btts_'))r=bttsCandidate(key,short,trend,MIN_SCORE[key]);
    if(!r)continue;
    out.push({market:key,selection:r.selection,strategy:CEO_STRATEGY,strategyVersion:CEO_VERSION,ceoScore:Math.round(r.score*10)/10,strength:500+r.score,evidence:{pass:true,mode:'CEO_AUTO_V1',score:Math.round(r.score*10)/10,reasonCodes:r.reasonCodes||[]},rolling:short,reasonCodes:r.reasonCodes||[]});
  }
  return out;
}

function median(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
export function ceoPostPricePass(best){
  if(!best||best.strategy!==CEO_STRATEGY)return {pass:false,reason:'NOT_CEO'};
  const score=num(best.ceoScore)??0,odds=num(best?.price?.odds),r=best.referee||{};
  if(odds===null)return {pass:false,reason:'NO_PRICE'};
  if(Number(r.validOffers||0)<2||Number(r.consensusOffers||0)<2)return {pass:false,reason:'REFEREE_QUORUM'};
  if(Number(r.agreementPct||0)<50)return {pass:false,reason:'REFEREE_AGREEMENT'};
  const line=num(best?.price?.line);if(best.market?.includes('_ah')&&line!==null&&Math.abs(line)>1.25)return {pass:false,reason:'LINE_RISK'};
  const scoreNeed=odds<1.65?78:odds<1.80?72:odds<=2.00?69:75;
  if(score<scoreNeed)return {pass:false,reason:'PRICE_SCORE_FIT'};
  const sameLine=(Array.isArray(r.offers)?r.offers:[]).filter(o=>line===null||num(o?.line)===line).map(o=>num(o?.odds)).filter(v=>v!==null),med=median(sameLine);
  if(med!==null&&odds>med*1.15)return {pass:false,reason:'PRICE_OUTLIER'};
  return {pass:true,reason:'CEO_PASS',scoreNeed,medianOdds:med};
}
