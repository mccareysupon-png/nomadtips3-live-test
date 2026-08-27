const decode = (s='') => String(s)
  .replace(/&nbsp;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));

export const stripHtml = (html='') => decode(String(html)
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
  const m=String(s).match(/(-?\d+)\s*[-–]\s*(-?\d+)/);
  return m ? [Number(m[1]),Number(m[2])] : null;
};

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

function getMatchLink(row,kind='live'){
  const re=new RegExp(`href=["']([^"']*\\/${kind}\\/[^"']*?\\/(\\d+)(?:[?"'#]|$))`,'i');
  const m=String(row).match(re);
  if(!m) return null;
  const href=decode(m[1]);
  const slug=(href.match(new RegExp(`/${kind}/([^/]+)/\\d+`,'i'))||[])[1]||'';
  return {href,id:m[2],slug};
}

function statusCellText(row){
  const m=String(row).match(/<td\b[^>]*class=["'][^"']*\bmatch_status\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i);
  return m?normSpace(m[1]):null;
}

function minuteValue(text,{allowBare=false}={}){
  const value=String(text??'').trim();
  if(!value) return null;
  if(/^(?:half(?:\s*time)?|ht|break)$/i.test(value)) return 45;
  const marked=value.match(/(?:^|\s)(\d{1,3})\s*(?:'|′|min(?:ute)?s?)(?:\s|$)/i);
  const bare=allowBare&&/^\d{1,3}$/.test(value)?value.match(/\d{1,3}/):null;
  const m=marked||bare;
  if(!m) return null;
  const v=Number(m[1]??m[0]);
  return v>=0&&v<=130?v:null;
}

function parseMinute(row,c){
  const status=statusCellText(row);
  if(status!=null){
    const v=minuteValue(status,{allowBare:true});
    if(v!=null) return v;
  }
  for(const text of c){
    const v=minuteValue(text,{allowBare:true});
    if(v!=null) return v;
  }
  return null;
}

function parseScore(c){
  for(const x of c){
    const p=pair(x);
    if(p&&p[0]>=0&&p[1]>=0&&p[0]<30&&p[1]<30) return p;
  }
  return null;
}

function parseCorner(c,score){
  let scoreSeen=false;
  for(const x of c){
    const p=pair(x);
    if(!p) continue;
    if(score&&p[0]===score[0]&&p[1]===score[1]&&!scoreSeen){scoreSeen=true;continue;}
    if(p[0]>=0&&p[1]>=0&&p[0]<=30&&p[1]<=30&&/\(/.test(x)) return p;
  }
  return null;
}

function parseAttackDangerous(c){
  const groups=[];
  for(const x of c){
    if(/\(/.test(x)) continue;
    const ps=[...String(x).matchAll(/(\d+)\s*[-–]\s*(\d+)/g)]
      .map(m=>[Number(m[1]),Number(m[2])])
      .filter(p=>p[0]<=500&&p[1]<=500);
    if(ps.length) groups.push(ps);
  }
  if(!groups.length) return {attacks:null,dangerous:null};
  const last=groups[groups.length-1];
  return {
    attacks:last.length>=2?last[last.length-2]:null,
    dangerous:last[last.length-1]||null,
  };
}

function teamNames(row){
  const values=anchors(row).filter(x=>/\/team\/view\/\d+/i.test(x.href)&&x.text);
  return values.slice(0,2).map(x=>x.text.trim());
}

function leagueName(row){
  return anchors(row).find(x=>/\/league\//i.test(x.href)&&x.text)?.text||null;
}

export function parseToday(html,sourceHost='https://www.totalcorner.com'){
  const rows=String(html||'').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
  const found=[];
  for(const row of rows){
    const live=getMatchLink(row,'live');
    const stats=getMatchLink(row,'stats');
    const odds=getMatchLink(row,'odds');
    const ref=live||stats||odds;
    if(!ref) continue;
    const c=cells(row);
    const score=parseScore(c);
    const corner=parseCorner(c,score);
    const ad=parseAttackDangerous(c);
    const names=teamNames(row);
    const slug=ref.slug||stats?.slug||odds?.slug||'';
    const fallbackNames=slug.split('-vs-').map(s=>s.replace(/-/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase()));
    const full=p=>!p?null:(p.startsWith('http')?p:`${sourceHost}${p.startsWith('/')?'':'/'}${p}`);
    found.push({
      id:String(ref.id),
      league:leagueName(row),
      home:names[0]||fallbackNames[0]||null,
      away:names[1]||fallbackNames[1]||null,
      minute:parseMinute(row,c),
      score:score?{home:score[0],away:score[1]}:{home:null,away:null},
      stats:{
        attacks:ad.attacks?{home:ad.attacks[0],away:ad.attacks[1]}:{home:null,away:null},
        dangerous:ad.dangerous?{home:ad.dangerous[0],away:ad.dangerous[1]}:{home:null,away:null},
        sot:{home:null,away:null},
        off:{home:null,away:null},
        corner:corner?{home:corner[0],away:corner[1]}:{home:null,away:null},
      },
      urls:{
        live:full(live?.href||`/live/${slug}/${ref.id}`),
        stats:full(stats?.href||`/stats/${slug}/${ref.id}`),
      },
    });
  }
  return [...new Map(found.map(m=>[m.id,m])).values()];
}

function metricPair(text,labels){
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

function statusFromDetail(text){
  const m=String(text).match(/Status:\s*([^,]+),?\s*Score:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*,?\s*Corner:\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
  if(!m) return {minute:null,status:null,score:{home:null,away:null},corner:{home:null,away:null}};
  const raw=m[1].trim();
  const mm=raw.match(/(\d{1,3})/);
  return {
    minute:mm?Number(mm[1]):(/half/i.test(raw)?45:null),
    status:raw,
    score:{home:Number(m[2]),away:Number(m[3])},
    corner:{home:Number(m[4]),away:Number(m[5])},
  };
}

export function parseLiveDetail(html){
  const full=stripHtml(html).replace(/\s+/g,' ');
  const idx=full.search(/Live Events/i);
  let text=idx>=0?full.slice(idx):full;
  const split=text.search(/\*\s*\*\s*\*/);
  if(split>0) text=text.slice(0,split);
  const st=statusFromDetail(text);
  const attacks=metricPair(text,['Attack','Attacks']);
  const dangerous=metricPair(text,['Dangerous Attack','Dangerous Attacks','Danger Attack']);
  const sot=metricPair(text,['Shoot on target','Shots on Target','Shot on Target']);
  const off=metricPair(text,['Shoot off target','Shots off Target','Shot off Target']);
  const valid=Number.isFinite(st.minute)&&Number.isFinite(st.score.home)&&Number.isFinite(st.score.away);
  return {valid,minute:st.minute,status:st.status,score:st.score,stats:{attacks,dangerous,sot,off,corner:st.corner}};
}
