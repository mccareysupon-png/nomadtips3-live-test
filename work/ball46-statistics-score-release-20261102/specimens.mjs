// UI specimens only: not current live scores, not connected to Production.
const base={status:'PENDING',marketLabel:'Asian Handicap · Full Time',selection:'HOME',line:'+0.25',odds:1.925,bookmaker:'Bet 365',entryMinute:56,entryScore:{home:0,away:0},league:'Preview league · UI specimens',createdAt:'02 Nov · 07:50'};
export const rows=[
 {...base,id:'live-73',home:'Home United',away:'Away City',mirrorMinute:73,mirrorScore:{home:2,away:0}},
 {...base,id:'push',selection:'AWAY',home:'Northern FC',away:'Coastal United',status:'SETTLED',result:'PUSH',finalScore:{home:2,away:0},settlementSource:'DIRECT_FINAL_FALLBACK'},
 {...base,id:'live-81',home:'River Athletic',away:'Mountain FC',marketLabel:'1X2 · Full Time',line:'—',mirrorMinute:81,mirrorScore:{home:1,away:1}},
 {...base,id:'half',marketLabel:'Asian Handicap · Half Time',home:'Home Rovers',away:'Away Athletic',mirrorScore:{home:0,away:0}},
 {...base,id:'added',marketLabel:'Over / Under · Full Time',selection:'UNDER',line:'2.5',home:'City FC',away:'United FC',mirrorScore:{home:1,away:2}},
 {...base,id:'ended',home:'Central FC',away:'East Town',mirrorMinute:90,mirrorScore:{home:2,away:1}},
 {...base,id:'missing',home:'West City',away:'South FC',mirrorMinute:null,entryMinute:28},
 {...base,id:'win',home:'Valley United',away:'Harbour FC',status:'SETTLED',result:'WIN',finalScore:{home:4,away:2},settlementSource:'DIRECT_FINAL_FALLBACK'},
 {...base,id:'loss',home:'Forest FC',away:'Lake United',status:'SETTLED',result:'LOSS',finalScore:{home:0,away:1}},
 {...base,id:'corner',home:'Home Wanderers',away:'Away Rangers',marketLabel:'Corners · Over / Under',selection:'OVER',line:'9.5',status:'SETTLED',result:'HALF_WIN',finalScore:{home:1,away:1},finalCorners:{home:6,away:4}},
];
export const fixtures={
 'live-73':{live:true,minute:73,score:{home:2,away:0}},'live-81':{live:true,minute:81,score:{home:1,away:1}},
 half:{live:true,status:'HT',score:{home:0,away:0}},added:{live:true,minute:'90+3',score:{home:1,away:2}},
 ended:{finished:true,status:'FT',minute:90,score:{home:2,away:1}}
};
