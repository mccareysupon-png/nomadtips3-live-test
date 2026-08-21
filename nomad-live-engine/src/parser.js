const decode = (s='') => s
  .replace(/&nbsp;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));

export const stripHtml = (html='') => decode(html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<br\s*\/?\s*>/gi,'\n')
  .replace(/<\/p>|<\/div>|<\/li>|<\/td>|<\/tr>|<\/th>|<\/h\d>/gi,'\n')
  .replace(/<[^>]+>/g,' ')
  .replace(/[\t\r ]+/g,' ')
  .replace(/\n\s+/g,'\n')
  .replace(/\n{2,}/g,'\n')
  .trim());

const normSpace = s => stripHtml(s).replace(/\s+/g,' ').trim();
const pair = (s='') => {
  const m = String(s).match(/(-?\d+)\s*[-–]\s*(-?\d+)/);
  return m ? [Number(m[1]),Number(m[2])] : null;
};
const scorePair = pair;

function anchors(row){
  const out=[];
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(row))) out.push({href:decode(m[1]),text:normSpace(m[2])});
  return out;
}
function cells(row){
  const out=[];
  const re=/<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while((m=re.exec(row))) out.push(normSpace(m[1]));
  return out;
}
function getMatchLink(row, kind='live'){
  const re=new RegExp(`href=["']([^"']*\\/${kind}\\/[^"']*?\\/(\\d+)(?:[?"'#]|$))`,'i');
  const m=row.match(re);
  if(!m) return null;
  const href=decode(m[1]);
  return {href, id:m[2], slug:(href.match(new RegExp(`/${kind}/([^/]+)/\\d+`,'i'))||[])[1]||''};
}
function teamNamesFromAnchors(row){
  const a=anchors(row).filter(x=>/\/team\/view\/\d+/i.test(x.href) && x.text);
  return a.slice(0,2).map(x=>x.text.trim());
}
function leagueFromAnchors(row){
  const a=anchors(row).find(x=>/\/league\//i.test(x.href) && x.text);
  return a?.text || null;
}
function statusCellText(row){
  const statusCell=row.match(/<td\b[^>]*class=["'][^"']*\bmatch_status\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
  return statusCell?normSpace(statusCell[1]):null;
}
function minuteValue(text,{allowBare=false}={}){
  const value=String(text??'').trim();
  if(!value) return null;
  if(/^(?:half(?:\s*time)?|ht|break)$/i.test(value)) return 45;
  const marked=value.match(/(?:^|\s)(\d{1,3})\s*(?:'|′|min(?:ute)?s?)(?:\s|$)/i);
  const bare=allowBare&&/^\d{1,3}$/.test(value)?value.match(/\d{1,3}/):null;
  const m=marked||bare;
  if(m){ const v=Number(m[1]??m[0]); if(v>=0&&v<=130) return v; }
  return null;
}
function parseMinute(cellsText,row){
  const status=statusCellText(row);
  if(status!=null) return minuteValue(status,{allowBare:true});
  for(const text of cellsText){
    const minute=minuteValue(text,{allowBare:true});
    if(minute!=null) return minute;
  }
  return null;
}
function parseScoreFromCells(c){
  for(const x of c){ const p=scorePair(x); if(p && p[0]>=0&&p[1]>=0&&p[0]<30&&p[1]<30) return p; }
  return null;
}
function parseCornerFromCells(c, score){
  let seenScore=false;
  for(const x of c){
    const p=pair(x);
    if(!p) continue;
    if(score && p[0]===score[0]&&p[1]===score[1]&&!seenScore){seenScore=true;continue;}
    if(p[0]>=0&&p[1]>=0&&p[0]<=30&&p[1]<=30 && /\(/.test(x)) return p;
  }
  return null;
}
function parseAttackDangerousFromCells(c){
  const groups=[];
  for(const x of c){
    if(/\(/.test(x)) continue;
    const ps=[...String(x).matchAll(/(\d+)\s*[-–]\s*(\d+)/g)].map(m=>[Number(m[1]),Number(m[2])]).filter(p=>p[0]<=500&&p[1]<=500);
    if(ps.length) groups.push(ps);
  }
  if(!groups.length) return {attack:null,dangerous:null};
  const last=groups[groups.length-1];
  return {attack:last.length>=2?last[last.length-2]:null,dangerous:last[last.length-1]};
}
function parseHandicapFromCells(c, score){
  let scoreSeen=false;
  for(const x of c){
    const p=pair(x);
    if(p && score && p[0]===score[0]&&p[1]===score[1]&&!scoreSeen){scoreSeen=true;continue;}
    const m=x.match(/(^|\s)([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s*\(([^)]*)\))?/);
    if(!m) continue;
    const v=Number(m[2]);
    if(v>=-5&&v<=5 && /[.+-]/.test(m[2])) return v;
  }
  return null;
}
export function parseToday(html, sourceHost='https://www.totalcorner.com'){
  const rows=html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
  const matches=[];
  for(const row of rows){
    const live=getMatchLink(row,'live');
    const odds=getMatchLink(row,'odds');
    const stats=getMatchLink(row,'stats');
    const ref=live||odds;
    if(!ref) continue;
    const c=cells(row); const rowText=normSpace(row);
    const teams=teamNamesFromAnchors(row);
    const score=parseScoreFromCells(c);
    const corner=parseCornerFromCells(c,score);
    const ad=parseAttackDangerousFromCells(c);
    const minute=parseMinute(c,row);
    const league=leagueFromAnchors(row);
    const slug=ref.slug || (odds?.slug||'');
    const names=teams.length===2?teams:(slug.split('-vs-').map(s=>s.replace(/-/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase())));
    const full = p => !p ? null : (p.startsWith('http')?p:`${sourceHost}${p.startsWith('/')?'':'/'}${p}`);
    matches.push({
      id:ref.id,
      league,
      home:names[0]||null,
      away:names[1]||null,
      minute,
      score:score?{home:score[0],away:score[1]}:{home:null,away:null},
      corner:corner?{home:corner[0],away:corner[1]}:{home:null,away:null},
      attack:ad.attack?{home:ad.attack[0],away:ad.attack[1]}:{home:null,away:null},
      dangerousAttack:ad.dangerous?{home:ad.dangerous[0],away:ad.dangerous[1]}:{home:null,away:null},
      todayHandicap:parseHandicapFromCells(c,score),
      urls:{
        live:full(live?.href || `/live/${slug}/${ref.id}`),
        stats:full(stats?.href || `/stats/${slug}/${ref.id}`),
        odds:full(odds?.href || `/odds/${slug}/${ref.id}`),
      },
      rawText:rowText.slice(0,1200),
    });
  }
  const byId=new Map();
  for(const m of matches) byId.set(m.id,m);
  return [...byId.values()];
}

function findMetricPair(text, labels){
  for(const label of labels){
    const esc=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    let m=new RegExp(`(\\d{1,3})\\s+${esc}\\s+(\\d{1,3})`,'i').exec(text);
    if(m) return {home:Number(m[1]),away:Number(m[2])};
    m=new RegExp(`${esc}[^\\d]{0,40}(\\d{1,3})\\s*(?:-|–|:|\\s+)\\s*(\\d{1,3})`,'i').exec(text);
    if(m) return {home:Number(m[1]),away:Number(m[2])};
    m=new RegExp(`(\\d{1,3})\\s*(?:-|–|:)\\s*(\\d{1,3})[^A-Za-z]{0,20}${esc}`,'i').exec(text);
    if(m) return {home:Number(m[1]),away:Number(m[2])};
  }
  return {home:null,away:null};
}
function findStatus(text){
  const m=text.match(/Status:\s*([^,]+),?\s*Score:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*,?\s*Corner:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
  if(!m) return {minute:null,score:{home:null,away:null},corners:{home:null,away:null},status:null};
  const raw=m[1].trim(); const mm=raw.match(/(\d{1,3})/);
  return {minute:mm?Number(mm[1]):(/half/i.test(raw)?45:null),score:{home:Number(m[2]),away:Number(m[3])},corners:{home:Number(m[4]),away:Number(m[5])},status:raw};
}
export function parseLiveDetail(html){
  const full=stripHtml(html).replace(/\s+/g,' ');
  const idx=full.search(/Live Events/i);
  let text=idx>=0?full.slice(idx):full;
  const split=text.search(/\*\s*\*\s*\*/); if(split>0) text=text.slice(0,split);
  const st=findStatus(text);
  const attacks=findMetricPair(text,['Attack','Attacks']);
  const dangerousAttack=findMetricPair(text,['Dangerous Attack','Dangerous Attacks','Danger Attack']);
  const shotsOn=findMetricPair(text,['Shoot on target','Shots on Target','Shot on Target']);
  const shotsOff=findMetricPair(text,['Shoot off target','Shots off Target','Shot off Target']);
  const possession=findMetricPair(text,['Possession %','Possession','Ball Possession']);
  const valid=Number.isFinite(st.minute)&&Number.isFinite(st.score.home)&&Number.isFinite(st.score.away);
  return {valid,minute:st.minute,status:st.status,score:st.score,attacks,dangerousAttack,shotsOn,shotsOff,corners:st.corners,possession,rawText:text.slice(0,4000)};
}

function normalizeAsianLine(raw){
  const parts=String(raw).split(',').map(x=>Number(x.trim()));
  if(!parts.length||parts.some(x=>!Number.isFinite(x))) return null;
  const line=parts.reduce((a,b)=>a+b,0)/parts.length;
  if(line < -4||line > 4||Math.abs(line*4-Math.round(line*4))>=1e-9) return null;
  return line;
}
function numericTriples(segment){
  const number='[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
  const line=`${number}(?:\\s*,\\s*${number})?`;
  const re=new RegExp(`(\\d+(?:\\.\\d+)?)\\s+(${line})\\s+(\\d+(?:\\.\\d+)?)`,'g');
  const out=[]; let m;
  while((m=re.exec(segment))){
    const h=Number(m[1]), normalizedLine=normalizeAsianLine(m[2]), a=Number(m[3]);
    if(h>=1.01&&h<=6 && a>=1.01&&a<=6 && normalizedLine!=null) out.push({homeOdds:h,line:normalizedLine,awayOdds:a,index:m.index});
  }
  return out;
}
export function parseBet365Asian(html){
  const text=stripHtml(html).replace(/\s+/g,' ');
  const ahAnchor=Math.max(
    text.search(/cover rates/i),
    text.search(/Home Line Away/i)
  );
  const scope=ahAnchor>=0?text.slice(ahAnchor,ahAnchor+9000):text;
  const m=/Bet\s*365/i.exec(scope);
  if(!m) return null;
  const seg=scope.slice(m.index+m[0].length,m.index+900);
  const triples=numericTriples(seg);
  if(!triples.length) return null;
  const chosen=triples.length>=2?triples[1]:triples[0];
  return {homeOdds:chosen.homeOdds,line:chosen.line,awayOdds:chosen.awayOdds,bookmaker:'Bet365'};
}

export function parseEnded(html, sourceHost='https://www.totalcorner.com'){
  return parseToday(html,sourceHost).filter(m=>m.score.home!=null&&m.score.away!=null);
}
