// AsianBookie standby normalizer for NOMAD Live Page 3.
// ISOLATION RULE: this module performs no network requests and is not wired into runtime.
// Feed a captured/authorized AsianBookie JSON payload into normalizeAsianBookieLivePayload().

const ID_KEYS=['matchId','match_id','eventId','event_id','fixtureId','fixture_id','gameId','game_id','mid','id'];
const HOME_KEYS=['homeTeam','home_team','homeName','home_name','teamHome','team_home','hteam','home'];
const AWAY_KEYS=['awayTeam','away_team','awayName','away_name','teamAway','team_away','ateam','away'];
const LEAGUE_KEYS=['leagueName','league','competitionName','competition','tournamentName','tournament'];
const MINUTE_KEYS=['minute','matchMinute','match_minute','liveMinute','live_minute','mins','clockMinute'];

const isObject=v=>Boolean(v&&typeof v==='object'&&!Array.isArray(v));
const finite=v=>{if(v===null||v===undefined||v===''||typeof v==='boolean')return null;const n=Number(v);return Number.isFinite(n)?n:null};
const normalizeKey=v=>String(v??'').toLowerCase().replace(/[^a-z0-9]/g,'');

function keyMap(row={}){
  const out=new Map();
  for(const [key,value] of Object.entries(row||{}))out.set(normalizeKey(key),value);
  return out;
}
function pick(row,names){
  if(!isObject(row))return null;
  const map=keyMap(row);
  for(const name of names){const key=normalizeKey(name);if(map.has(key))return map.get(key)}
  return null;
}
function text(value){
  if(value===null||value===undefined)return '';
  if(typeof value==='string'||typeof value==='number')return String(value).trim();
  if(isObject(value))return text(value.name??value.teamName??value.title??value.label??value.value);
  return '';
}
function collectArrays(root,maxDepth=6){
  const found=[],seen=new Set();
  function walk(value,path,depth){
    if(depth>maxDepth||value===null||value===undefined)return;
    if(Array.isArray(value)){
      const rows=value.filter(isObject);
      if(rows.length)found.push({path,rows});
      for(let i=0;i<Math.min(value.length,3);i+=1)walk(value[i],`${path}[${i}]`,depth+1);
      return;
    }
    if(!isObject(value)||seen.has(value))return;
    seen.add(value);
    for(const [key,child] of Object.entries(value))walk(child,`${path}.${key}`,depth+1);
  }
  walk(root,'$',0);return found;
}
function extractId(row){const v=pick(row,ID_KEYS);return v===null||v===undefined||v===''?'':String(v).trim()}
function extractHome(row){return text(pick(row,HOME_KEYS))}
function extractAway(row){return text(pick(row,AWAY_KEYS))}

function scoreValue(row){
  const nested=pick(row,['score','liveScore','live_score','scores']);
  if(Array.isArray(nested)&&nested.length>=2){
    const h=finite(nested[0]),a=finite(nested[1]);if(h!==null&&a!==null)return [h,a];
  }
  if(isObject(nested)){
    const h=finite(pick(nested,['home','homeScore','home_score','h']));
    const a=finite(pick(nested,['away','awayScore','away_score','a']));
    if(h!==null&&a!==null)return [h,a];
  }
  const h=finite(pick(row,['homeScore','home_score','scoreHome','score_home','hscore','homeGoals','home_goals']));
  const a=finite(pick(row,['awayScore','away_score','scoreAway','score_away','ascore','awayGoals','away_goals']));
  return h!==null&&a!==null?[h,a]:[null,null];
}
function pairFromValue(value){
  if(Array.isArray(value)&&value.length>=2){
    const h=finite(value[0]),a=finite(value[1]);return [h,a];
  }
  if(isObject(value)){
    const h=finite(pick(value,['home','h','homeValue','home_value','homeCount','home_count']));
    const a=finite(pick(value,['away','a','awayValue','away_value','awayCount','away_count']));
    return [h,a];
  }
  return [null,null];
}
function statPair(row,{nested=[],home=[],away=[]}){
  for(const key of nested){
    const value=pick(row,[key]);
    if(value!==null&&value!==undefined){
      const pair=pairFromValue(value);if(pair[0]!==null||pair[1]!==null)return pair;
    }
  }
  return [finite(pick(row,home)),finite(pick(row,away))];
}
function statsValue(row){
  const root=pick(row,['statistics','stats','liveStats','live_stats','matchStats','match_stats']);
  const stats=isObject(root)?{...row,...root}:row;
  return {
    attacks:statPair(stats,{nested:['attacks','attack'],home:['homeAttacks','home_attacks','attackHome'],away:['awayAttacks','away_attacks','attackAway']}),
    dangerous:statPair(stats,{nested:['dangerousAttacks','dangerous_attacks','dangerous','dangerAttack'],home:['homeDangerousAttacks','home_dangerous_attacks','dangerousHome'],away:['awayDangerousAttacks','away_dangerous_attacks','dangerousAway']}),
    sot:statPair(stats,{nested:['shotsOnTarget','shots_on_target','sot','onTarget'],home:['homeShotsOnTarget','home_shots_on_target','homeSot'],away:['awayShotsOnTarget','away_shots_on_target','awaySot']}),
    off:statPair(stats,{nested:['shotsOffTarget','shots_off_target','shotOff','shotsOff','offTarget'],home:['homeShotsOffTarget','home_shots_off_target','homeShotOff'],away:['awayShotsOffTarget','away_shots_off_target','awayShotOff']}),
    corner:statPair(stats,{nested:['corners','corner','cornerKicks'],home:['homeCorners','home_corners','cornerHome'],away:['awayCorners','away_corners','cornerAway']}),
  };
}
function rowScore(row){
  let score=extractId(row)?20:0;
  if(extractHome(row))score+=8;if(extractAway(row))score+=8;
  if(finite(pick(row,MINUTE_KEYS))!==null)score+=4;
  const matchScore=scoreValue(row);if(matchScore[0]!==null&&matchScore[1]!==null)score+=4;
  const stats=statsValue(row);for(const pair of Object.values(stats))if(pair[0]!==null||pair[1]!==null)score+=2;
  return score;
}
function chooseMatchArray(payload){
  const ranked=collectArrays(payload).map(entry=>({
    ...entry,
    score:entry.rows.reduce((sum,row)=>sum+rowScore(row),0)/Math.max(1,entry.rows.length),
    idCoverage:entry.rows.filter(row=>extractId(row)).length/Math.max(1,entry.rows.length),
  })).sort((a,b)=>b.idCoverage-a.idCoverage||b.score-a.score||b.rows.length-a.rows.length);
  return ranked[0]||{path:null,rows:[],score:0,idCoverage:0};
}

export function inspectAsianBookiePayload(payload){
  const arrays=collectArrays(payload).slice(0,20).map(entry=>({
    path:entry.path,
    rows:entry.rows.length,
    sampleKeys:Object.keys(entry.rows[0]||{}).slice(0,60),
    score:Number((entry.rows.reduce((sum,row)=>sum+rowScore(row),0)/Math.max(1,entry.rows.length)).toFixed(2)),
    idCoverage:Number((entry.rows.filter(row=>extractId(row)).length/Math.max(1,entry.rows.length)).toFixed(3)),
  }));
  return {topLevelType:Array.isArray(payload)?'array':typeof payload,topLevelKeys:isObject(payload)?Object.keys(payload).slice(0,60):[],arrays};
}

export function normalizeAsianBookieLivePayload(payload,observedAt=Date.now()){
  const choice=chooseMatchArray(payload);
  const matches=[];
  const coverage={minute:0,score:0,attacks:0,dangerous:0,sot:0,off:0,corner:0};
  for(const row of choice.rows){
    const id=extractId(row),home=extractHome(row),away=extractAway(row);
    if(!id||!home||!away)continue;
    const minute=finite(pick(row,MINUTE_KEYS));
    const score=scoreValue(row);
    const stats=statsValue(row);
    if(minute!==null)coverage.minute+=1;
    if(score[0]!==null&&score[1]!==null)coverage.score+=1;
    for(const key of ['attacks','dangerous','sot','off','corner'])if(stats[key][0]!==null||stats[key][1]!==null)coverage[key]+=1;
    matches.push({
      id,
      league:text(pick(row,LEAGUE_KEYS))||null,
      home,away,minute,score,
      event:{snapshots:[{minute,observedAt,attacks:stats.attacks,dangerous:stats.dangerous,sot:stats.sot,off:stats.off,corner:stats.corner}]},
      source:{name:'AsianBookie',observedAt,detail:false,mode:'STANDBY_NORMALIZER'},
      freshness:{changedAt:observedAt,lastSeenAt:observedAt,stale:false},
    });
  }
  const total=matches.length;
  const ratio=key=>total?Number((coverage[key]/total).toFixed(3)):0;
  return {
    matches,
    diagnostics:{
      selectedPath:choice.path,selectedRows:choice.rows.length,idCoverage:choice.idCoverage,
      joinedMatches:total,
      fieldCoverage:Object.fromEntries(Object.keys(coverage).map(key=>[key,{count:coverage[key],ratio:ratio(key)}])),
      payload:inspectAsianBookiePayload(payload),
    },
  };
}
