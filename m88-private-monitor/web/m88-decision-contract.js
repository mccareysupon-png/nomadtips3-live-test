(()=>{
  const SETTINGS_KEY='m88-monitor-settings-v2';
  const SIGNALS_KEY='m88-monitor-signals-v1';
  const RULE_VERSION='M88-UNIFORM-DECISION-v1';
  const DEFAULTS={
    side:'HOME',market:'WIN',oddsMin:1.70,oddsMax:null,ahMin:0.25,ahMax:null,
    ouDirection:'OVER',ouLine:2.5,minuteMin:60,minuteMax:80,momentumMin:60,
    confirmationRounds:2,attackEvidenceEnabled:true,attackEvidenceDangerousAttacksEnabled:true,
    attackEvidenceDangerousAttacksMin:1,attackEvidenceShotsEnabled:true,attackEvidenceShotsMin:1,
    attackEvidenceShotsOnTargetEnabled:true,attackEvidenceShotsOnTargetMin:1,
    attackEvidenceCornersEnabled:true,attackEvidenceCornersMin:1,attackEvidenceRequirement:'1',
    goalGapLimited:false,maxGoalGap:1,redCardPolicy:'ALLOW',sourceFreshnessMaxSeconds:90,
    matchConfidenceMin:85,requireCoreStats:true,signalLimitEnabled:false,maxSignalsPerDay:10,
    cooldownMinutes:20,leagueInclude:'',leagueExclude:'',
    momentumWeights:{attacks:.16,dangerous_attacks:.52,shots:2,shots_on_target:4,corners:1.25,possession:.07}
  };
  const safe=v=>String(v??'').trim();
  const finite=v=>{if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null};
  const loadSettings=()=>{try{const s=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');return {...DEFAULTS,...s,momentumWeights:{...DEFAULTS.momentumWeights,...(s.momentumWeights||{})}}}catch{return JSON.parse(JSON.stringify(DEFAULTS));}};
  const stable=v=>{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o;}return v;};
  const hash=v=>{const s=JSON.stringify(stable(v));let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16).padStart(8,'0');};
  const sideOf=(c,m)=>{const s=safe(c.selection).toLowerCase(),h=safe(m.home).toLowerCase(),a=safe(m.away).toLowerCase();if(!s)return'';if(['home','1','h'].includes(s)||(h&&s.includes(h)))return'HOME';if(['away','2','a'].includes(s)||(a&&s.includes(a)))return'AWAY';if(['draw','x'].includes(s))return'DRAW';return'';};
  const marketText=c=>safe(c.market).toLowerCase();
  const isFullMatch=c=>{
    const t=marketText(c);
    if(/(1st|first|2nd|second)\s*half|\b1h\b|\b2h\b|half.?time|quarter|period|corner|booking|card|player|team total|exact|correct score/.test(t))return false;
    return true;
  };
  const kind=c=>{const t=marketText(c);if(/1x2|winner|moneyline|match result|full time result/.test(t))return'WIN';if(/asian|handicap|\bah\b/.test(t))return'AH';if(/over.?under|total|o\/u|goals/.test(t))return'OU';return'';};
  const isOpen=c=>!/(suspend|closed|inactive|settled|void|false)/i.test(safe(c.status));
  const lineOf=c=>finite(c.line??c.handicapLine??c.goalLine);
  const stats=(m,side)=>{const p=side==='AWAY'?'away':'home';return {attacks:finite(m[`${p}Attacks`]),dangerous_attacks:finite(m[`${p}DangerousAttacks`]),shots:finite(m[`${p}Shots`]),shots_on_target:finite(m[`${p}ShotsOnTarget`]),corners:finite(m[`${p}Corners`]),possession:finite(m[`${p}Possession`])};};
  const momentum=(st,w)=>{const caps={attacks:80,dangerous_attacks:45,shots:25,shots_on_target:12,corners:12,possession:100};let p=0,max=0;for(const [k,weight0] of Object.entries(w||{})){const val=st[k],weight=Number(weight0||0);if(val==null||!weight)continue;p+=Math.max(0,val)*weight;max+=caps[k]*weight;}return max>0?Math.min(100,p/max*100):null;};
  const selectedSide=(m,s)=>{if(s.side!=='BOTH')return s.side;const hm=momentum(stats(m,'HOME'),s.momentumWeights),am=momentum(stats(m,'AWAY'),s.momentumWeights);if(hm==null&&am==null)return'HOME';return (am??-1)>(hm??-1)?'AWAY':'HOME';};
  function chooseMarket(m,s){
    const current={market:m.market,selection:m.selection,odds:m.odds,line:m.line,handicapLine:m.handicapLine,goalLine:m.goalLine,status:m.marketStatus||''};
    const all=[...(Array.isArray(m.markets)?m.markets:[]),current].filter(c=>safe(c.market)||safe(c.selection)||finite(c.odds)!=null);
    const wanted=s.market||'WIN',side=selectedSide(m,s);
    let candidates=all.filter(c=>kind(c)===wanted&&isFullMatch(c)&&finite(c.odds)!=null);
    if(wanted==='WIN')candidates=candidates.filter(c=>sideOf(c,m)===side);
    if(wanted==='AH'){
      candidates=candidates.filter(c=>sideOf(c,m)===side);
      candidates=candidates.filter(c=>{const line=lineOf(c);if(line==null)return false;if(s.ahMin!=null&&line<Number(s.ahMin))return false;if(s.ahMax!=null&&s.ahMax!==''&&line>Number(s.ahMax))return false;return true;});
    }
    if(wanted==='OU'){
      candidates=candidates.filter(c=>{const line=lineOf(c);if(line==null||Math.abs(line-Number(s.ouLine))>.001)return false;const sel=safe(c.selection).toUpperCase();return !s.ouDirection||sel.includes(s.ouDirection);});
    }
    candidates.sort((a,b)=>{
      const open=Number(isOpen(b))-Number(isOpen(a));if(open)return open;
      if(wanted==='AH'&&s.ahMin!=null){const da=Math.abs((lineOf(a)??999)-Number(s.ahMin)),db=Math.abs((lineOf(b)??999)-Number(s.ahMin));if(da!==db)return da-db;}
      return 0;
    });
    const c=candidates[0];
    if(!c)return {...m,market:'',selection:'',odds:null,line:null,handicapLine:null,goalLine:null,m88MarketMatched:false,m88WantedMarket:wanted,m88WantedSide:side};
    const line=lineOf(c);
    return {...m,market:safe(c.market),selection:safe(c.selection),odds:finite(c.odds),line,handicapLine:wanted==='AH'?line:(finite(c.handicapLine)??m.handicapLine??null),goalLine:wanted==='OU'?line:(finite(c.goalLine)??m.goalLine??null),marketStatus:safe(c.status),m88MarketMatched:true,m88WantedMarket:wanted,m88WantedSide:side,m88PriceSource:'M88'};
  }

  const realFetch=window.fetch.bind(window);
  window.fetch=async function(input,init){
    const response=await realFetch(input,init);
    try{
      const url=typeof input==='string'?input:(input?.url||'');
      if(!/\/api\/feed(?:\?|$)/.test(url))return response;
      const data=await response.clone().json();
      if(!Array.isArray(data?.matches))return response;
      const settings=loadSettings();
      const matches=data.matches.map(m=>chooseMarket(m,settings));
      const body=JSON.stringify({...data,mode:`${data.mode||'m88'}+uniform-market-v1`,ruleVersion:RULE_VERSION,settingsHash:hash(settings),matchCount:matches.length,matches});
      const headers=new Headers(response.headers);headers.set('content-type','application/json; charset=utf-8');headers.set('cache-control','no-store');
      return new Response(body,{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };

  const originalSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage&&key===SIGNALS_KEY){
      try{
        const arr=JSON.parse(value),settings=loadSettings(),settingsHash=hash(settings),now=Date.now();
        if(Array.isArray(arr))for(const s of arr){
          const at=new Date(s?.detectedAt||0).getTime();
          if(!s||s.ruleVersion||!Number.isFinite(at)||Math.abs(now-at)>15000)continue;
          s.ruleVersion=RULE_VERSION;
          s.settingsHash=settingsHash;
          s.settingsSnapshot=JSON.parse(JSON.stringify(settings));
          s.priceSource='M88';
          s.lockedMarket=s.market??null;
          s.lockedSelection=s.selection??null;
          s.lockedLine=finite(s.line);
          s.lockedHandicapLine=finite(s.handicapLine);
          s.lockedGoalLine=finite(s.goalLine);
          s.lockedOdds=finite(s.odds);
          s.detectMinute=finite(s.minute);
          s.detectScoreHome=finite(s.homeScore);
          s.detectScoreAway=finite(s.awayScore);
          s.decisionContract={version:RULE_VERSION,settingsHash,uniformForAllPredictions:true,priceSource:'M88',order:['live','minute','market','odds','league','side','line','score','red-card','freshness','core-stats','confidence','momentum','attack-evidence','confirmation']};
          s.decisionAuditHash=hash({ruleVersion:RULE_VERSION,settingsHash,market:s.lockedMarket,selection:s.lockedSelection,line:s.lockedLine,handicapLine:s.lockedHandicapLine,goalLine:s.lockedGoalLine,odds:s.lockedOdds,minute:s.detectMinute,score:[s.detectScoreHome,s.detectScoreAway]});
        }
        value=JSON.stringify(arr);
      }catch{}
    }
    return originalSetItem.call(this,key,value);
  };
})();
