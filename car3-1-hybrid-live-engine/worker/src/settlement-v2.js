import upgradedWorker, { Car31State as UpgradedCar31State } from './upgrade.js';

const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,POST,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:null;};
const json=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:HEADERS});

function splitQuarterLine(value){
  const raw=num(value);
  if(raw===null)return [];
  const q=Math.round(raw*4)/4;
  const quarterIndex=Math.round(q*4);
  if(Math.abs(quarterIndex)%2===1)return[(quarterIndex-1)/4,(quarterIndex+1)/4];
  return[q];
}

function legResult(value){
  if(value>1e-9)return'W';
  if(value<-1e-9)return'L';
  return'P';
}

function combineLegs(legs){
  if(!legs.length)return'VOID';
  const w=legs.filter(x=>x==='W').length,l=legs.filter(x=>x==='L').length,p=legs.filter(x=>x==='P').length;
  if(w===legs.length)return'FULL_WIN';
  if(l===legs.length)return'FULL_LOSS';
  if(p===legs.length)return'PUSH';
  if(w>0&&p>0&&l===0)return'HALF_WIN';
  if(l>0&&p>0&&w===0)return'HALF_LOSS';
  return'PUSH';
}

function resultGroup(exact){
  if(exact==='FULL_WIN'||exact==='HALF_WIN')return'WIN';
  if(exact==='FULL_LOSS'||exact==='HALF_LOSS')return'LOSS';
  if(exact==='PUSH')return'DRAW';
  return exact==='PENDING'?'PENDING':'VOID';
}

function settleExact(record){
  if(!record?.settledAt||!record?.finalScore)return{exact:'PENDING',group:'PENDING',legs:[]};
  const fh=num(record.finalScore.home),fa=num(record.finalScore.away);
  if(fh===null||fa===null)return{exact:'VOID',group:'VOID',legs:[]};
  const away=String(record.selectedSide||'HOME').toUpperCase()==='AWAY';
  const selected=away?fa:fh,opponent=away?fh:fa;
  let legs=[];
  if(record.market==='WIN'){
    const exact=selected>opponent?'FULL_WIN':'FULL_LOSS';
    return{exact,group:resultGroup(exact),legs:[selected-opponent]};
  }
  if(record.market==='AH'){
    const lines=splitQuarterLine(record.line);
    if(!lines.length)return{exact:'VOID',group:'VOID',legs:[]};
    legs=lines.map(line=>({line,outcome:legResult(selected+line-opponent)}));
  }else if(record.market==='OU'){
    const lines=splitQuarterLine(record.line);
    if(!lines.length)return{exact:'VOID',group:'VOID',legs:[]};
    const total=fh+fa,direction=String(record.ouDirection||'OVER').toUpperCase();
    legs=lines.map(line=>({line,outcome:legResult(direction==='UNDER'?line-total:total-line)}));
  }else return{exact:'VOID',group:'VOID',legs:[]};
  const exact=combineLegs(legs.map(x=>x.outcome));
  return{exact,group:resultGroup(exact),legs};
}

function normalizeRecord(record){
  if(!record?.settledAt||!record?.finalScore)return{...record,resultGroup:'PENDING',settlementResult:'PENDING'};
  const grade=settleExact(record);
  return{
    ...record,
    legacyResult:record.legacyResult||record.result||null,
    result:grade.group,
    resultGroup:grade.group,
    settlementResult:grade.exact,
    settlementLegs:grade.legs,
    settlement:'full_match_result_v2',
    settlementRule:'WLD · HALF_WIN=>WIN · HALF_LOSS=>LOSS · PUSH=>DRAW'
  };
}

function summaryOf(records){
  const settled=records.filter(r=>r.settledAt&&r.resultGroup!=='PENDING');
  const win=settled.filter(r=>r.resultGroup==='WIN').length;
  const loss=settled.filter(r=>r.resultGroup==='LOSS').length;
  const draw=settled.filter(r=>r.resultGroup==='DRAW').length;
  const voids=settled.filter(r=>r.resultGroup==='VOID').length;
  const pending=records.filter(r=>!r.settledAt||r.resultGroup==='PENDING').length;
  const odds=settled.filter(r=>r.resultGroup!=='VOID').map(r=>num(r.odds)).filter(v=>v!==null&&v>0);
  const averageOdds=odds.length?odds.reduce((a,b)=>a+b,0)/odds.length:0;
  const winRate=win+loss?win/(win+loss)*100:0;
  let cw=0,cl=0,cd=0;
  const trend=settled.filter(r=>r.resultGroup!=='VOID').sort((a,b)=>Date.parse(a.settledAt||a.selectedAt)-Date.parse(b.settledAt||b.selectedAt)).map((r,index)=>{
    if(r.resultGroup==='WIN')cw++;
    else if(r.resultGroup==='LOSS')cl++;
    else if(r.resultGroup==='DRAW')cd++;
    return{index:index+1,date:r.selectionDate||'',selectedAt:r.selectedAt||null,win:cw,loss:cl,draw:cd};
  });
  return{total:records.length,pending,settled:settled.length,win,loss,draw,void:voids,averageOdds:Number(averageOdds.toFixed(2)),winRate:Number(winRate.toFixed(2)),accuracy:Number(winRate.toFixed(2)),trend};
}

export class Car31State extends UpgradedCar31State{
  async scan(trigger='cron'){
    const response=await super.scan(trigger);
    try{
      const history=await this.state.storage.get('history')||[];
      const normalized=history.map(normalizeRecord);
      await this.state.storage.put('history',normalized);
      await this.state.storage.put('settlementContract',{version:'WLD_V2',settlement:'full_match_result',halfWin:'WIN',halfLoss:'LOSS',push:'DRAW',updatedAt:new Date().toISOString()});
    }catch(error){
      await this.state.storage.put('settlementContract',{version:'WLD_V2',status:'ERROR',error:String(error?.message||error),updatedAt:new Date().toISOString()});
    }
    return response;
  }

  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/history'){
      const stored=await this.state.storage.get('history')||[];
      const records=stored.map(normalizeRecord);
      const page=Math.max(1,Math.round(num(url.searchParams.get('page'))||1));
      const limit=Math.max(1,Math.min(100,Math.round(num(url.searchParams.get('limit'))||25)));
      const sorted=[...records].sort((a,b)=>Date.parse(b.selectedAt||0)-Date.parse(a.selectedAt||0));
      const offset=(page-1)*limit,pages=Math.max(1,Math.ceil(sorted.length/limit));
      return json({
        ok:true,
        generatedAt:new Date().toISOString(),
        settlementContract:'WLD_V2',
        settlement:'full_match_result',
        page,limit,pages,total:sorted.length,offset,
        summary:summaryOf(records),
        records:sorted.slice(offset,offset+limit)
      });
    }
    if(request.method==='GET'&&url.pathname==='/health'){
      const response=await super.fetch(request),payload=await response.json().catch(()=>({ok:false}));
      const contract=await this.state.storage.get('settlementContract')||{version:'WLD_V2'};
      return json({...payload,settlementContract:contract.version||'WLD_V2',settlement:'full_match_result'});
    }
    return super.fetch(request);
  }
}

export default upgradedWorker;
