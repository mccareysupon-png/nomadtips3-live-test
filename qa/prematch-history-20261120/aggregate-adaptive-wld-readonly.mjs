const urls=[
 'https://ball46-premium-match-colors-test-20261120.mccarey-supon.workers.dev/__b46_pm_adaptive_research',
 'https://ball46-prematch-only-test-20261120.mccarey-supon.workers.dev/ou-adaptive-research-data'
];
for(const url of urls){
 try{
  const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(35000)});
  const data=await r.json();
  const arr=Array.isArray(data.formulas)?data.formulas:Array.isArray(data.stats?.formulas)?data.stats.formulas:null;
  const example=arr?.[0]||{};
  const sum=arr?.reduce((o,f)=>{
   o.wins+=Number(f.wins??f.win??0);o.losses+=Number(f.losses??f.loss??0);o.pending+=Number(f.pending??0);
   o.draws+=Number(f.draws??f.draw??0);return o;
  },{wins:0,losses:0,pending:0,draws:0});
  const normalized=sum&&Object.values(sum).every(Number.isFinite)&&arr.length===42;
  console.log('B46_REAL_WLD_PUBLIC_SOURCE '+JSON.stringify({url,http:r.status,code:data.code,formulaCount:arr?.length,formulaKeys:Object.keys(example),summary:normalized?sum:null,settled:normalized?sum.wins+sum.losses+sum.draws:null,winRate:normalized&&(sum.wins+sum.losses)>0?100*sum.wins/(sum.wins+sum.losses):null,reason:normalized?'VALID_42_FORMULA_SUMMARY':'NO_VERIFIABLE_AGGREGATE'}));
 }catch(e){console.log('B46_REAL_WLD_PUBLIC_SOURCE '+JSON.stringify({url,error:String(e.message).slice(0,250)}))}
}
