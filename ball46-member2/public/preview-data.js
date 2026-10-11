// Staging-only visual preview. This page uses clearly fictional matches, not live picks.
if (location.pathname === '/preview') {
 const markets=['ALL','AH','1X2','O/U','CORNERS','BTTS','CARDS','OTHER'];
 const examples=[
  ['1X2','Bangkok City','Nakhon United','HOME WIN','WIN',2,1,1.82],
  ['O/U','Chiang Mai FC','Rayong City','OVER 2.5','PENDING',2,1,1.91],
  ['AH','Eastern United','Southern Stars','HOME -0.5','WIN',1,0,1.88],
  ['CORNERS','North City','Capital FC','OVER 9.5','PENDING',1,1,1.86],
  ['BTTS','River FC','Mountain United','YES','LOSS',1,0,1.78],
  ['1X2','Blue Tigers','Golden Eagles','AWAY WIN','PENDING',0,0,2.14]
 ];
 const signals=examples.map((e,i)=>({id:'preview-'+(i+1),fixtureId:'preview-fixture-'+i,createdAt:Date.now()-i*240000,signalTime:['14:42:10','14:30:22','14:11:08','13:54:41','13:37:11','13:12:05'][i],home:e[1],away:e[2],league:'DEMO LEAGUE · PREVIEW',market:e[0],selection:e[3],pick:e[3],result:e[4],status:e[4],state:e[4]==='PENDING'?'LIVE':'FINISHED',odds:e[7],entryOdds:e[7],entryMinute:35,signalMinute:35,minute:e[4]==='PENDING'?67:90,matchMinute:e[4]==='PENDING'?67:90,entryScore:{home:0,away:0},mirrorScore:{home:e[5],away:e[6]},finalScore:e[4]==='PENDING'?null:{home:e[5],away:e[6]},score:{home:e[5],away:e[6]},bookmaker:'PREVIEW',line:e[0]==='O/U'?2.5:e[0]==='CORNERS'?9.5:null,pnl:e[4]==='WIN'?0.82:e[4]==='LOSS'?-1:0,profit:e[4]==='WIN'?0.82:e[4]==='LOSS'?-1:0}));
 const blank=()=>({signals:0,win:0,loss:0,push:0,halfWin:0,halfLoss:0,pending:0,winRate:null,pnl:0});
 const summary=Object.fromEntries(markets.map(k=>{const a=k==='ALL'?signals:signals.filter(s=>s.market===k);const v=blank();v.signals=a.length;v.win=a.filter(s=>s.result==='WIN').length;v.loss=a.filter(s=>s.result==='LOSS').length;v.pending=a.filter(s=>s.result==='PENDING').length;v.pnl=a.reduce((n,s)=>n+s.pnl,0);v.winRate=v.win+v.loss?100*v.win/(v.win+v.loss):null;return [k,v]}));
 const payload={ok:true,signals,signalCount:signals.length,summary,generatedAt:Date.now()};
 const originalFetch=window.fetch.bind(window);
 window.fetch=(input,options)=>{
  const path=new URL(typeof input==='string'?input:input.url,location.href).pathname;
  if(path==='/api/member/daily')return Promise.resolve(new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}}));
  if(path==='/api/member/session')return Promise.resolve(new Response(JSON.stringify({ok:true,authenticated:true,member:{status:'ACTIVE',displayName:'DEMO ACCOUNT',role:'OWNER',accessType:'LIFETIME'}}),{status:200,headers:{'content-type':'application/json'}}));
  return originalFetch(input,options);
 };
 document.addEventListener('DOMContentLoaded',()=>{
  const badge=document.createElement('div');badge.textContent='MEMBER 2 · UI PREVIEW · ข้อมูลสาธิต ไม่ใช่สัญญาณจริง';
  badge.style.cssText='position:sticky;top:0;z-index:9999;text-align:center;background:#af7930;color:#fff;font:700 12px system-ui;padding:10px';
  document.body.prepend(badge);
 });
}
