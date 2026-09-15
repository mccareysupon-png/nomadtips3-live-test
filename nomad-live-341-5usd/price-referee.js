(()=>{
  const num=v=>Number.isFinite(Number(v))?Number(v):null;
  const side=v=>String(v||'home').toLowerCase()==='away'?'away':'home';
  const ageSeconds=(quote,nowMs=Date.now())=>{
    if(num(quote?.priceAgeSeconds)!=null)return Math.max(0,num(quote.priceAgeSeconds));
    const stamp=quote?.sourceUpdatedAt||quote?.updatedAt||quote?.timestamp;
    const ms=stamp?Date.parse(stamp):NaN;
    return Number.isFinite(ms)?Math.max(0,(nowMs-ms)/1000):null;
  };
  function normalizeQuote(q={},selection='home',position=1){
    const s=side(q.side||selection);
    return {
      position:q.position??position,
      source:q.source||'5USD',
      bookmaker:q.bookmaker||q.name||'—',
      side:s,
      line:num(q.line),
      odds:num(q.odds??q[s]),
      sourceUpdatedAt:q.sourceUpdatedAt||q.updatedAt||q.timestamp||null,
      priceAgeSeconds:ageSeconds(q),
      status:String(q.status||'').toUpperCase()||'WAIT'
    };
  }
  function sameLine(a,b,tolerance=0.001){return num(a)!=null&&num(b)!=null&&Math.abs(num(a)-num(b))<=tolerance;}
  function inspect(quotes=[],options={}){
    const selection=side(options.side),targetLine=num(options.line),minOdds=num(options.minOdds)??1.01,maxOdds=num(options.maxOdds)??99,maxAge=num(options.maxAgeSeconds)??90,allowedBookmakers=Array.isArray(options.allowedBookmakers)?new Set(options.allowedBookmakers.map(x=>String(x).toLowerCase())):null;
    const normalized=quotes.map((q,i)=>normalizeQuote(q,selection,i+1));
    const checked=normalized.map(q=>{
      const reasons=[];
      if(q.side!==selection)reasons.push('SIDE_MISMATCH');
      if(targetLine!=null&&!sameLine(q.line,targetLine))reasons.push('LINE_MISMATCH');
      if(q.odds==null)reasons.push('NO_ODDS');
      if(q.odds!=null&&q.odds<minOdds)reasons.push('ODDS_BELOW_MIN');
      if(q.odds!=null&&q.odds>maxOdds)reasons.push('ODDS_ABOVE_MAX');
      if(q.priceAgeSeconds!=null&&q.priceAgeSeconds>maxAge)reasons.push('STALE');
      if(allowedBookmakers&&!allowedBookmakers.has(String(q.bookmaker).toLowerCase()))reasons.push('BOOKMAKER_NOT_ALLOWED');
      return {...q,status:reasons.length?'WAIT':'PASS',reasons};
    });
    const valid=checked.filter(q=>q.status==='PASS').sort((a,b)=>(b.odds??0)-(a.odds??0));
    const selected=valid[0]||null;
    return {passed:Boolean(selected),selection,line:targetLine,checked,selected,reason:selected?'BEST_VALID_PRICE':'NO_VALID_PRICE'};
  }
  window.NOMAD341PriceReferee={version:'1.0-clean',normalizeQuote,inspect,ageSeconds};
})();
