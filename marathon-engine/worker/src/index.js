const JSON_HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const VERSION='0.3.0-online-preview';
const DEFAULT_SETTINGS=Object.freeze({
  detectorEnabled:true,
  minuteMin:60,
  minuteMax:89,
  oddsMin:1.10,
  oddsMax:null,
  ahMin:1,
  ahMax:null,
  homeEnabled:true,
  awayEnabled:true,
  confirmScans:1,
  maxSignalsPerDay:50,
  requireRunningClock:true,
  excludeEsports:true,
  includeLeagues:'',
  excludeLeagues:''
});

function json(data,status=200){return new Response(JSON.stringify(data,null,2),{status,headers:JSON_HEADERS});}
function html(body,status=200){return new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});}
function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(String(v).trim().replace(',','.'));return Number.isFinite(x)?x:null;}
function b(v,f=false){if(typeof v==='boolean')return v;if(v===1||v==='1'||String(v).toLowerCase()==='true')return true;if(v===0||v==='0'||String(v).toLowerCase()==='false')return false;return f;}
function clamp(v,f,min,max){const x=n(v);return x===null?f:Math.max(min,Math.min(max,x));}
function escRe(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function hashKey(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');}
function cleanLeague(v){return String(v||'').replace(/^Football\.\s*/i,'').replace(/\s+All Events.*$/i,'').replace(/\s+/g,' ').trim();}
function splitCsv(v){return String(v||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);}

function normalizeSettings(input={}){
  const minuteMin=Math.round(clamp(input.minuteMin,DEFAULT_SETTINGS.minuteMin,0,120));
  const minuteMax=Math.round(clamp(input.minuteMax,DEFAULT_SETTINGS.minuteMax,minuteMin,130));
  const oddsMin=clamp(input.oddsMin,DEFAULT_SETTINGS.oddsMin,1.001,1000);
  let oddsMax=n(input.oddsMax);if(oddsMax!==null&&oddsMax<oddsMin)oddsMax=oddsMin;
  const ahMin=clamp(input.ahMin,DEFAULT_SETTINGS.ahMin,-20,20);
  let ahMax=n(input.ahMax);if(ahMax!==null&&ahMax<ahMin)ahMax=ahMin;
  return {
    detectorEnabled:b(input.detectorEnabled,DEFAULT_SETTINGS.detectorEnabled),
    minuteMin,minuteMax,oddsMin,oddsMax,ahMin,ahMax,
    homeEnabled:b(input.homeEnabled,DEFAULT_SETTINGS.homeEnabled),
    awayEnabled:b(input.awayEnabled,DEFAULT_SETTINGS.awayEnabled),
    confirmScans:Math.round(clamp(input.confirmScans,DEFAULT_SETTINGS.confirmScans,1,10)),
    maxSignalsPerDay:Math.round(clamp(input.maxSignalsPerDay,DEFAULT_SETTINGS.maxSignalsPerDay,1,500)),
    requireRunningClock:b(input.requireRunningClock,DEFAULT_SETTINGS.requireRunningClock),
    excludeEsports:b(input.excludeEsports,DEFAULT_SETTINGS.excludeEsports),
    includeLeagues:String(input.includeLeagues??'').slice(0,2000),
    excludeLeagues:String(input.excludeLeagues??'').slice(0,2000)
  };
}

function decodeEntities(s){
  return String(s)
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,d)=>String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi,(_,d)=>String.fromCodePoint(parseInt(d,16)));
}

function pageText(source){
  return decodeEntities(String(source||''))
    .replace(/<script\b[\s\S]*?<\/script>/gi,'\n')
    .replace(/<style\b[\s\S]*?<\/style>/gi,'\n')
    .replace(/<\/(?:div|p|li|tr|td|th|section|article|header|footer|h1|h2|h3|h4|a|button)>/gi,'\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/\r/g,'')
    .split('\n')
    .map(x=>x.replace(/[\t ]+/g,' ').trim())
    .filter(Boolean)
    .join('\n');
}

function parsePairLine(line){
  const text=String(line).replace(/^\|+\s*/,'').replace(/\s+\|.*$/,'').trim();
  const m=text.match(/^(.*?)\s+—\s+(.*?)\s+(\d{1,2}):(\d{1,2})(?:\s+\([^)]*\))?(?:\s+(\d{1,3}):(\d{2}))?(?:\s|$)/);
  if(!m)return null;
  const home=m[1].replace(/^.*?\|\s*/,'').trim();
  const away=m[2].trim();
  if(!home||!away)return null;
  const score={home:Number(m[3]),away:Number(m[4]),raw:`${m[3]}:${m[4]}`};
  const clock=m[5]!==undefined?{minute:Number(m[5]),second:Number(m[6]),raw:`${m[5]}:${m[6]}`,status:'RUNNING'}:{minute:null,second:null,raw:null,status:/\bHT\b/i.test(text)?'HT':'UNKNOWN'};
  return {home,away,score,clock,raw:text};
}

function parseHandicap(context,home,away){
  const h=escRe(home),a=escRe(away);
  const re=new RegExp(`${h}\\s*\\(([+-]?\\d+(?:[.,]\\d+)?)\\)\\s*(\\d+(?:[.,]\\d+)?)\\s+${a}\\s*\\(([+-]?\\d+(?:[.,]\\d+)?)\\)\\s*(\\d+(?:[.,]\\d+)?)`,'i');
  const m=context.match(re);if(!m)return null;
  return {
    type:'HANDICAP',sourceLabel:/To Win Match with Handicap/i.test(context)?'To Win Match with Handicap':'HANDICAP',
    home:{selection:'HOME',team:home,rawLine:m[1],line:n(m[1]),rawOdds:m[2],odds:n(m[2])},
    away:{selection:'AWAY',team:away,rawLine:m[3],line:n(m[3]),rawOdds:m[4],odds:n(m[4])}
  };
}

function parse1x2(context,home,away){
  const h=escRe(home),a=escRe(away);
  const re=new RegExp(`${h}\\s+to Win\\s+(\\d+(?:[.,]\\d+)?)\\s+Draw\\s+(\\d+(?:[.,]\\d+)?)\\s+${a}\\s+to Win\\s+(\\d+(?:[.,]\\d+)?)`,'i');
  const m=context.match(re);if(!m)return null;
  return {type:'1X2',sourceLabel:'Match Result',home:{rawOdds:m[1],odds:n(m[1])},draw:{rawOdds:m[2],odds:n(m[2])},away:{rawOdds:m[3],odds:n(m[3])}};
}

function parseTotal(context){
  const m=context.match(/Under\s+([+-]?\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+Over\s+([+-]?\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)/i);
  if(!m)return null;
  return {type:'TOTAL',sourceLabel:'Total Goals',under:{rawLine:m[1],line:n(m[1]),rawOdds:m[2],odds:n(m[2])},over:{rawLine:m[3],line:n(m[3]),rawOdds:m[4],odds:n(m[4])}};
}

function isSportHeading(line){return /^(Tennis|Basketball|Table Tennis|Ice Hockey|Volleyball|Esports|Cyber Football|Cyber Basketball|Cyber Hockey|Water Polo|Cricket|Floorball|Short Hockey|Lottery)$/i.test(String(line).trim());}

export function parseMarathonHtml(source){
  const text=pageText(source);const lines=text.split('\n');const out=[];let activeSport='';let league='';
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/^Football$/i.test(line)){activeSport='FOOTBALL';continue;}
    if(/^Football\.\s+/i.test(line)){activeSport='FOOTBALL';league=cleanLeague(line);continue;}
    if(isSportHeading(line)){activeSport=line.toUpperCase();continue;}
    if(activeSport!=='FOOTBALL')continue;
    const pair=parsePairLine(line);if(!pair)continue;
    let end=i+1;while(end<lines.length&&end<i+18&&!parsePairLine(lines[end])&&!/^Football\.\s+/i.test(lines[end])&&!isSportHeading(lines[end]))end++;
    const context=lines.slice(i,end).join(' ');
    const handicap=parseHandicap(context,pair.home,pair.away);
    const oneXtwo=parse1x2(context,pair.home,pair.away);
    const total=parseTotal(context);
    const currentLeague=league||null;
    const key=`marathon:${hashKey(`${currentLeague||''}\u0000${pair.home}\u0000${pair.away}`)}`;
    out.push({
      source:'MARATHONBET',sourceEventId:null,sourceIdVerified:false,
      id:key,league:currentLeague,home:pair.home,away:pair.away,
      live:{score:pair.score,clock:pair.clock},
      markets:[oneXtwo,handicap,total].filter(Boolean),
      raw:{pairLine:pair.raw,marketText:context.slice(0,6000)}
    });
  }
  const seen=new Set();return out.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;});
}

function leagueAllowed(match,s){
  const name=String(match.league||'').toLowerCase();
  if(s.excludeEsports&&/(esport|cyber|virtual|efootball|fifa)/i.test(`${name} ${match.home} ${match.away}`))return false;
  const include=splitCsv(s.includeLeagues),exclude=splitCsv(s.excludeLeagues);
  if(include.length&&!include.some(x=>name.includes(x)))return false;
  if(exclude.some(x=>name.includes(x)))return false;
  return true;
}

function evaluate(match,s){
  if(!s.detectorEnabled)return {decision:'NOT_EVALUATED',reasons:['DETECTOR_DISABLED'],candidates:[]};
  const global=[];const minute=match.live?.clock?.minute;
  if(!leagueAllowed(match,s))global.push('LEAGUE_FILTERED');
  if(s.requireRunningClock&&minute===null)global.push('LIVE_CLOCK_REQUIRED');
  if(minute!==null&&minute<s.minuteMin)global.push('MINUTE_BELOW_MIN');
  if(minute!==null&&minute>s.minuteMax)global.push('MINUTE_ABOVE_MAX');
  const ah=(match.markets||[]).find(x=>x.type==='HANDICAP');
  if(!ah)global.push('HANDICAP_SOURCE_UNMAPPED');
  if(global.length)return {decision:'NO_SIGNAL',reasons:global,candidates:[]};
  const candidates=[];
  for(const side of [ah.home,ah.away]){
    const reasons=[];
    if(side.selection==='HOME'&&!s.homeEnabled)reasons.push('HOME_DISABLED');
    if(side.selection==='AWAY'&&!s.awayEnabled)reasons.push('AWAY_DISABLED');
    if(side.line===null)reasons.push('AH_LINE_UNMAPPED');
    else{
      if(side.line<s.ahMin)reasons.push('AH_BELOW_MIN');
      if(s.ahMax!==null&&side.line>s.ahMax)reasons.push('AH_ABOVE_MAX');
    }
    if(side.odds===null)reasons.push('ODDS_UNMAPPED');
    else{
      if(side.odds<s.oddsMin)reasons.push('ODDS_BELOW_MIN');
      if(s.oddsMax!==null&&side.odds>s.oddsMax)reasons.push('ODDS_ABOVE_MAX');
    }
    candidates.push({...side,pass:reasons.length===0,reasons});
  }
  return {decision:candidates.some(x=>x.pass)?'SIGNAL':'NO_SIGNAL',reasons:candidates.some(x=>x.pass)?[]:['NO_SELECTION_PASSED'],candidates};
}

async function fetchSource(url){
  const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; NOMADTIPS3-Marathon-Monitor/1.0)','accept':'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'},cf:{cacheTtl:0,cacheEverything:false}});
  const body=await r.text();
  if(!r.ok)throw new Error(`SOURCE_HTTP_${r.status}`);
  return {body,status:r.status,bytes:body.length};
}

function todayUtc(){return new Date().toISOString().slice(0,10);}
function emptyData(){return {settings:{...DEFAULT_SETTINGS},current:[],signals:[],confirm:{},uniqueMatches:[],stats:{scans:0,sourceErrors:0,signals:0},lastScan:null,lastSourceOk:null,lastError:null,lastSourceStatus:null,lastSourceBytes:0};}

export class MarathonState{
  constructor(state,env){
    this.state=state;this.env=env;this.data=null;
    this.ready=state.blockConcurrencyWhile(async()=>{this.data=await state.storage.get('data')||emptyData();this.data.settings=normalizeSettings(this.data.settings||{});});
  }
  async persist(){await this.state.storage.put('data',this.data);}
  async scan(){
    await this.ready;const now=new Date().toISOString();this.data.stats.scans=(this.data.stats.scans||0)+1;
    try{
      const source=await fetchSource(this.env.MARATHON_SOURCE_URL||'https://www.marathonbet.com/en/live/popular');
      const matches=parseMarathonHtml(source.body).map(m=>({...m,detection:evaluate(m,this.data.settings),observedAt:now}));
      const unique=new Set(this.data.uniqueMatches||[]);for(const m of matches)unique.add(m.id);this.data.uniqueMatches=[...unique].slice(-2000);
      const oldConfirm=this.data.confirm||{};const nextConfirm={};const day=todayUtc();const daySignals=(this.data.signals||[]).filter(x=>x.day===day).length;
      let remaining=Math.max(0,this.data.settings.maxSignalsPerDay-daySignals);
      for(const m of matches){
        const passing=(m.detection.candidates||[]).filter(x=>x.pass);
        for(const c of passing){
          const ck=`${m.id}|${c.selection}|${c.rawLine}`;const count=(oldConfirm[ck]||0)+1;nextConfirm[ck]=count;c.confirmCount=count;c.confirmRequired=this.data.settings.confirmScans;c.confirmed=count>=this.data.settings.confirmScans;
          if(c.confirmed&&remaining>0){
            const signalKey=`${day}|${ck}`;
            if(!(this.data.signals||[]).some(x=>x.signalKey===signalKey)){
              this.data.signals.push({signalKey,day,lockedAt:now,matchId:m.id,league:m.league,home:m.home,away:m.away,minute:m.live.clock.minute,score:m.live.score,selection:c.selection,team:c.team,rawLine:c.rawLine,line:c.line,rawOdds:c.rawOdds,odds:c.odds,source:'MARATHONBET'});
              this.data.stats.signals=(this.data.stats.signals||0)+1;remaining--;
            }
          }
        }
      }
      this.data.confirm=nextConfirm;this.data.signals=(this.data.signals||[]).slice(-1000);this.data.current=matches;this.data.lastScan=now;this.data.lastSourceOk=now;this.data.lastError=null;this.data.lastSourceStatus=source.status;this.data.lastSourceBytes=source.bytes;
    }catch(e){this.data.stats.sourceErrors=(this.data.stats.sourceErrors||0)+1;this.data.lastScan=now;this.data.lastError=String(e?.message||e);this.data.lastSourceStatus=null;}
    await this.persist();return this.livePayload();
  }
  livePayload(){return {ok:!this.data.lastError,source:'MARATHONBET',version:VERSION,lastScan:this.data.lastScan,lastSourceOk:this.data.lastSourceOk,lastError:this.data.lastError,sourceStatus:this.data.lastSourceStatus,sourceBytes:this.data.lastSourceBytes,settings:this.data.settings,matchCount:this.data.current.length,matches:this.data.current,signalCount:this.data.signals.length};}
  async fetch(request){
    await this.ready;const u=new URL(request.url);const p=u.pathname;
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});
    if(request.method==='POST'&&p==='/internal/scan')return json(await this.scan());
    if(request.method==='POST'&&p==='/api/refresh')return json(await this.scan());
    if(request.method==='GET'&&p==='/health')return json({ok:!this.data.lastError,source:'MARATHONBET',version:VERSION,lastScan:this.data.lastScan,lastSourceOk:this.data.lastSourceOk,lastError:this.data.lastError,matchCount:this.data.current.length,sourceStatus:this.data.lastSourceStatus,detectorEnabled:this.data.settings.detectorEnabled});
    if(request.method==='GET'&&p==='/api/live')return json(this.livePayload());
    if(request.method==='GET'&&p==='/api/signals')return json({items:[...(this.data.signals||[])].reverse()});
    if(request.method==='GET'&&p==='/api/settings')return json({settings:this.data.settings,defaults:DEFAULT_SETTINGS,sourceUrl:this.env.MARATHON_SOURCE_URL});
    if(request.method==='POST'&&p==='/api/settings'){
      let body={};try{body=await request.json();}catch{return json({ok:false,error:'INVALID_JSON'},400);}this.data.settings=normalizeSettings(body);this.data.confirm={};await this.persist();return json({ok:true,settings:this.data.settings});
    }
    if(request.method==='POST'&&p==='/api/settings/reset'){this.data.settings={...DEFAULT_SETTINGS};this.data.confirm={};await this.persist();return json({ok:true,settings:this.data.settings});}
    if(request.method==='GET'&&p==='/api/statistics')return json({source:'MARATHONBET',version:VERSION,stats:{...this.data.stats,uniqueMatches:(this.data.uniqueMatches||[]).length,currentMatches:this.data.current.length,totalSignals:this.data.signals.length},lastScan:this.data.lastScan,lastSourceOk:this.data.lastSourceOk,lastError:this.data.lastError,recentSignals:[...(this.data.signals||[])].reverse().slice(0,200)});
    if(request.method==='GET'&&p==='/')return html(monitorPage());
    if(request.method==='GET'&&p==='/statistics')return html(statisticsPage());
    if(request.method==='GET'&&p==='/settings')return html(settingsPage());
    return json({error:'NOT_FOUND'},404);
  }
}

function shell(title,body,script=''){
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  *{box-sizing:border-box}body{margin:0;background:#111511;color:#eef2ee;font:14px Arial,sans-serif}.top{position:sticky;top:0;z-index:5;background:#171d18;border-bottom:1px solid #303932}.wrap{max-width:1280px;margin:auto;padding:16px}.brand{font-size:21px;font-weight:800}.brand b{color:#f4d928}.nav{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.nav a{color:#dfe6df;text-decoration:none;padding:8px 12px;border:1px solid #364038;border-radius:8px}.nav a:hover{border-color:#f4d928}.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card{background:#1a211b;border:1px solid #303a32;border-radius:10px;padding:14px}.k{font-size:12px;color:#99a49b}.v{font-size:23px;font-weight:800;margin-top:5px}.ok{color:#67d391}.bad{color:#ff7777}.warn{color:#f4d928}table{width:100%;border-collapse:collapse;background:#171d18;margin-top:14px}th,td{padding:10px 8px;border-bottom:1px solid #303932;text-align:left;vertical-align:top}th{position:sticky;top:80px;background:#1c241e;color:#aeb9b0;font-size:12px}.pill{display:inline-block;padding:3px 7px;border-radius:99px;border:1px solid #455047;font-size:12px}.signal{border-color:#5acb83;color:#79e29c}.muted{color:#96a099}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}button{background:#f4d928;color:#111;border:0;padding:9px 14px;border-radius:8px;font-weight:800;cursor:pointer}button.alt{background:#2a332c;color:#eef2ee;border:1px solid #465149}input,select,textarea{width:100%;background:#101511;color:#eef2ee;border:1px solid #3b463d;border-radius:7px;padding:9px}label{display:block;font-size:12px;color:#aeb8b0;margin-bottom:5px}.form{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.field{background:#19201a;border:1px solid #303a32;border-radius:9px;padding:12px}.check{display:flex;gap:8px;align-items:center}.check input{width:auto}.note{padding:12px;border-left:3px solid #f4d928;background:#1b211b;margin:12px 0}.status{font-size:12px;color:#aab4ac;margin-left:8px}@media(max-width:850px){.grid,.form{grid-template-columns:1fr 1fr}table{font-size:12px}.wrap{padding:10px}}@media(max-width:560px){.grid,.form{grid-template-columns:1fr}.hide-sm{display:none}th{top:112px}}
  </style></head><body><div class="top"><div class="wrap"><div class="brand">Marathon <b>Engine</b> <span class="pill">ONLINE PREVIEW</span></div><div class="nav"><a href="/">MONITOR</a><a href="/statistics">STATISTICS</a><a href="/settings">SETTINGS</a></div></div></div><main class="wrap">${body}</main><script>${script}</script></body></html>`;
}

function monitorPage(){
  const body=`<div class="grid"><div class="card"><div class="k">SOURCE</div><div class="v" id="source">—</div></div><div class="card"><div class="k">LIVE MATCHES</div><div class="v" id="matches">—</div></div><div class="card"><div class="k">SIGNALS</div><div class="v" id="signals">—</div></div><div class="card"><div class="k">LAST SCAN</div><div class="v" id="scan" style="font-size:15px">—</div></div></div><div class="actions"><button id="refresh">SCAN NOW</button><span class="status" id="msg"></span></div><div class="note">ค่าจาก Marathon ถูกเก็บตามต้นทาง: เครื่องหมาย Handicap +/− และ Odds ไม่กลับข้าง ไม่แทนไลน์ใกล้เคียง หากหา AH ไม่เจอจะแสดง SOURCE UNMAPPED.</div><div style="overflow:auto"><table><thead><tr><th>League</th><th>Match</th><th>Time</th><th>Score</th><th>HOME AH</th><th>AWAY AH</th><th>Decision</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const script=`function e(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}async function load(){var d=await fetch('/api/live').then(function(r){return r.json()});document.getElementById('source').textContent=d.ok?'ONLINE':'ERROR';document.getElementById('source').className='v '+(d.ok?'ok':'bad');document.getElementById('matches').textContent=d.matchCount;document.getElementById('signals').textContent=d.signalCount;document.getElementById('scan').textContent=d.lastScan?new Date(d.lastScan).toLocaleString():'—';document.getElementById('msg').textContent=d.lastError||'';document.getElementById('rows').innerHTML=(d.matches||[]).map(function(m){var ah=(m.markets||[]).find(function(x){return x.type==='HANDICAP'});var h=ah?(ah.home.rawLine+' @ '+ah.home.rawOdds):'SOURCE UNMAPPED';var a=ah?(ah.away.rawLine+' @ '+ah.away.rawOdds):'SOURCE UNMAPPED';var sig=(m.detection&&m.detection.candidates||[]).some(function(x){return x.confirmed});var dec=sig?'SIGNAL':(m.detection?m.detection.decision:'—');return '<tr><td>'+e(m.league||'—')+'</td><td><b>'+e(m.home)+'</b> — '+e(m.away)+'</td><td>'+e(m.live.clock.raw||'—')+'</td><td>'+e(m.live.score.raw||'—')+'</td><td>'+e(h)+'</td><td>'+e(a)+'</td><td><span class="pill '+(sig?'signal':'')+'">'+e(dec)+'</span></td></tr>'}).join('')}document.getElementById('refresh').onclick=async function(){var b=this;b.disabled=true;document.getElementById('msg').textContent='Scanning Marathon…';try{await fetch('/api/refresh',{method:'POST'});await load()}finally{b.disabled=false}};load();setInterval(load,10000);`;
  return shell('Marathon Engine Monitor',body,script);
}

function statisticsPage(){
  const body=`<div class="grid"><div class="card"><div class="k">SCANS</div><div class="v" id="scans">—</div></div><div class="card"><div class="k">UNIQUE MATCHES</div><div class="v" id="unique">—</div></div><div class="card"><div class="k">SIGNALS LOCKED</div><div class="v" id="total">—</div></div><div class="card"><div class="k">SOURCE ERRORS</div><div class="v" id="errors">—</div></div></div><h2>Signal History</h2><div style="overflow:auto"><table><thead><tr><th>Time</th><th>League</th><th>Match</th><th>Minute</th><th>Selection</th><th>AH</th><th>Odds</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  const script=`function e(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]})}async function load(){var d=await fetch('/api/statistics').then(function(r){return r.json()});document.getElementById('scans').textContent=d.stats.scans||0;document.getElementById('unique').textContent=d.stats.uniqueMatches||0;document.getElementById('total').textContent=d.stats.totalSignals||0;document.getElementById('errors').textContent=d.stats.sourceErrors||0;document.getElementById('rows').innerHTML=(d.recentSignals||[]).map(function(x){return '<tr><td>'+e(new Date(x.lockedAt).toLocaleString())+'</td><td>'+e(x.league||'—')+'</td><td>'+e(x.home)+' — '+e(x.away)+'</td><td>'+e(x.minute==null?'—':x.minute)+'</td><td>'+e(x.selection+' '+x.team)+'</td><td>'+e(x.rawLine)+'</td><td>'+e(x.rawOdds)+'</td></tr>'}).join('')}load();setInterval(load,15000);`;
  return shell('Marathon Engine Statistics',body,script);
}

function settingsPage(){
  const body=`<h2>Detector Settings</h2><div class="note">SAVE & APPLY ใช้กับ Marathon Engine เครื่องนี้เท่านั้น ไม่แตะ CAR / Goaloo / Production.</div><div class="form"><div class="field"><label>Detector</label><div class="check"><input id="detectorEnabled" type="checkbox"><span>Enabled</span></div></div><div class="field"><label>Minute Min</label><input id="minuteMin" type="number" min="0" max="120"></div><div class="field"><label>Minute Max</label><input id="minuteMax" type="number" min="0" max="130"></div><div class="field"><label>Odds Min</label><input id="oddsMin" type="number" step="0.01" min="1.001"></div><div class="field"><label>Odds Max (blank = no max)</label><input id="oddsMax" type="number" step="0.01"></div><div class="field"><label>AH Min</label><input id="ahMin" type="number" step="0.25"></div><div class="field"><label>AH Max (blank = no max)</label><input id="ahMax" type="number" step="0.25"></div><div class="field"><label>Sides</label><div class="check"><input id="homeEnabled" type="checkbox"><span>HOME</span>&nbsp;&nbsp;<input id="awayEnabled" type="checkbox"><span>AWAY</span></div></div><div class="field"><label>Confirm Scans</label><input id="confirmScans" type="number" min="1" max="10"></div><div class="field"><label>Max Signals / Day</label><input id="maxSignalsPerDay" type="number" min="1" max="500"></div><div class="field"><label>Clock</label><div class="check"><input id="requireRunningClock" type="checkbox"><span>Require real running clock</span></div></div><div class="field"><label>Virtual / Esports</label><div class="check"><input id="excludeEsports" type="checkbox"><span>Exclude</span></div></div><div class="field"><label>Include Leagues (comma separated)</label><textarea id="includeLeagues" rows="3"></textarea></div><div class="field"><label>Exclude Leagues (comma separated)</label><textarea id="excludeLeagues" rows="3"></textarea></div><div class="field"><label>Source</label><input id="sourceUrl" readonly></div></div><div class="actions"><button id="save">SAVE & APPLY</button><button class="alt" id="reset">RESET DEFAULTS</button><span id="msg" class="status"></span></div>`;
  const script=`var ids=['detectorEnabled','minuteMin','minuteMax','oddsMin','oddsMax','ahMin','ahMax','homeEnabled','awayEnabled','confirmScans','maxSignalsPerDay','requireRunningClock','excludeEsports','includeLeagues','excludeLeagues'];function fill(s){ids.forEach(function(id){var el=document.getElementById(id);if(el.type==='checkbox')el.checked=!!s[id];else el.value=s[id]==null?'':s[id]})}async function load(){var d=await fetch('/api/settings').then(function(r){return r.json()});fill(d.settings);document.getElementById('sourceUrl').value=d.sourceUrl||''}function values(){var o={};ids.forEach(function(id){var el=document.getElementById(id);if(el.type==='checkbox')o[id]=el.checked;else if(['includeLeagues','excludeLeagues'].indexOf(id)>=0)o[id]=el.value;else o[id]=el.value===''?null:Number(el.value)});return o}document.getElementById('save').onclick=async function(){var r=await fetch('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(values())});var d=await r.json();document.getElementById('msg').textContent=d.ok?'Saved. Scanning with new rules…':(d.error||'ERROR');if(d.ok){await fetch('/api/refresh',{method:'POST'});fill(d.settings);document.getElementById('msg').textContent='SAVED & APPLIED'}};document.getElementById('reset').onclick=async function(){var d=await fetch('/api/settings/reset',{method:'POST'}).then(function(r){return r.json()});fill(d.settings);document.getElementById('msg').textContent='DEFAULTS RESTORED'};load();`;
  return shell('Marathon Engine Settings',body,script);
}

function stub(env){const id=env.MARATHON_STATE.idFromName('global');return env.MARATHON_STATE.get(id);}

export default{
  async fetch(request,env){return stub(env).fetch(request);},
  async scheduled(event,env,ctx){ctx.waitUntil(stub(env).fetch('https://marathon.internal/internal/scan',{method:'POST'}));}
};
