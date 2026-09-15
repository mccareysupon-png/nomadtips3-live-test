(()=>{
  const cloneVersion='3.41-UI-5USD-CLEAN';
  const now=()=>new Date().toISOString();
  const mockMatches=[
    {id:'mock-1',league:'Demo League',home:'NOMAD Home',away:'Visitor FC',minute:67,score:{home:1,away:0},side:'home',state:'WATCHING',passed:4,total:6,hunger:{passedCount:2,total:3},rolling:{windowMinutes:5,recent:{homePressure:66,awayPressure:34,tempo:71,delta:{shotsOn:{home:1,away:0},shotsOff:{home:1,away:0},corners:{home:0,away:0}}},previous:{homePressure:54,awayPressure:46,tempo:58},sides:{home:{pressureShare:66}}},stats:{attacks:{home:63,away:48},dangerousAttack:{home:39,away:27},shotsOff:{home:7,away:4},shotsOn:{home:5,away:2},corners:{home:5,away:3},possession:{home:56,away:44}},checks:{homeOnly:true,minute:true,score:true,hunger:true,evidence:false,market:false},evidence:{required:true},priceSources:[{position:1,source:'5USD ADAPTER',status:'WAIT',bookmaker:'—',line:null,odds:null,priceAgeSeconds:null}],selectedPrice:null},
    {id:'mock-2',league:'Demo Cup',home:'Alpha United',away:'Beta City',minute:74,score:{home:1,away:1},side:'home',state:'NEAR SIGNAL',passed:5,total:6,hunger:{passedCount:3,total:3},rolling:{windowMinutes:5,recent:{homePressure:73,awayPressure:27,tempo:78,delta:{shotsOn:{home:2,away:0},shotsOff:{home:1,away:0},corners:{home:1,away:0}}},previous:{homePressure:57,awayPressure:43,tempo:63},sides:{home:{pressureShare:73}}},stats:{attacks:{home:71,away:50},dangerousAttack:{home:45,away:24},shotsOff:{home:8,away:3},shotsOn:{home:6,away:2},corners:{home:7,away:2},possession:{home:59,away:41}},checks:{homeOnly:true,minute:true,score:true,hunger:true,evidence:true,market:false},evidence:{required:true},priceSources:[{position:1,source:'5USD ADAPTER',status:'WAIT',bookmaker:'—',line:-0.25,odds:null,priceAgeSeconds:null}],selectedPrice:null},
    {id:'mock-3',league:'Demo Premier',home:'Sirius FC',away:'Vega Athletic',minute:81,score:{home:2,away:1},side:'home',state:'SIGNAL',passed:6,total:6,hunger:{passedCount:3,total:3},rolling:{windowMinutes:5,recent:{homePressure:79,awayPressure:21,tempo:84,delta:{shotsOn:{home:2,away:0},shotsOff:{home:2,away:0},corners:{home:1,away:0}}},previous:{homePressure:61,awayPressure:39,tempo:65},sides:{home:{pressureShare:79}}},stats:{attacks:{home:82,away:49},dangerousAttack:{home:54,away:25},shotsOff:{home:10,away:4},shotsOn:{home:8,away:3},corners:{home:8,away:3},possession:{home:61,away:39}},checks:{homeOnly:true,minute:true,score:true,hunger:true,evidence:true,market:true},evidence:{required:true},priceSources:[{position:1,source:'5USD ADAPTER',status:'PASS',bookmaker:'DemoBook',line:-0.5,odds:1.88,priceAgeSeconds:12}],selectedPrice:{source:'5USD ADAPTER',bookmaker:'DemoBook',line:-0.5,odds:1.88,priceAgeSeconds:12,side:'home'},signalStatus:'LOCKED',signalLock:{status:'LOCKED',selection:'home',minute:81,entryScore:{home:2,away:1},line:-0.5,odds:1.88,oddsSource:'5USD ADAPTER',bookmaker:'DemoBook',lockedAt:now()}}
  ];
  const mockLedger=[
    {time:'80′',match:'Sirius FC — Vega Athletic',condition:'6/6',pick:'HOME',ah:'-0.50',odds:'1.88',source:'5USD ADAPTER',entry:'2–1',final:'3–1',result:'WIN',pl:'+0.88'},
    {time:'76′',match:'Alpha United — Beta City',condition:'6/6',pick:'HOME',ah:'0.00',odds:'1.82',source:'5USD ADAPTER',entry:'1–1',final:'1–1',result:'PUSH',pl:'0.00'},
    {time:'69′',match:'North FC — South FC',condition:'6/6',pick:'HOME',ah:'-0.25',odds:'1.91',source:'5USD ADAPTER',entry:'0–0',final:'0–1',result:'LOSS',pl:'-1.00'}
  ];
  const mockAdapter={
    name:'MOCK · 5USD CONTRACT',
    async getFeed(){return {updatedAt:now(),counts:{live:mockMatches.length,watching:1,near:1,signal:1},matches:mockMatches};},
    async getStatistics(){return {updatedAt:now(),rows:mockLedger};},
    async getHealth(){return {state:'UI READY',environment:'CLEAN CLONE',cycle:'MOCK',lastCycle:now(),lastSuccess:now(),configVersion:'local',matches:mockMatches.length,signals:1,lastError:'—',sources:[{name:'5USD adapter',state:'NOT CONNECTED'},{name:'Legacy 3.41 engine',state:'DISABLED'}]};}
  };
  const activeAdapter=()=>window.NOMAD_5USD_ADAPTER||mockAdapter;
  window.NOMAD341Clone={version:cloneVersion,mode:()=>window.NOMAD_5USD_ADAPTER?'5USD':'MOCK',adapter:activeAdapter,getFeed:()=>activeAdapter().getFeed(),getStatistics:()=>activeAdapter().getStatistics(),getHealth:()=>activeAdapter().getHealth()};
})();
