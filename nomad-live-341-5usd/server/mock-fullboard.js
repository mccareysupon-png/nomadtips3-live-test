export function buildMockFullBoard(nowIso=new Date().toISOString(),tick=0){
  const n=(base,step=1)=>base+(tick*step);
  const mk=(id,league,home,away,minute,score,stats,line,homeOdds,awayOdds)=>({
    id,
    league:{id:id*10,name:league},
    teams:{home:{id:id*10+1,name:home},away:{id:id*10+2,name:away}},
    kickoff_utc:nowIso,
    status:'in_play',
    status_code:String(minute),
    goals:{home:score[0],away:score[1],half_home:score[0]&&1||0,half_away:0},
    corners:{home:stats.corners.home,away:stats.corners.away,half_home:2,half_away:1},
    cards:{home:{yellow:1,red:0},away:{yellow:1,red:0}},
    statistics:{
      attacks:stats.attacks,
      dangerous_attacks:stats.dangerous_attacks,
      shots_on_target:stats.shots_on_target,
      shots_off_target:stats.shots_off_target,
      possession:stats.possession
    },
    events:[
      {type:'corner',minute:Math.max(1,minute-3),team:'home',count:1},
      {type:'shot_on_target',minute:Math.max(1,minute-2),team:'home',count:1}
    ],
    odds:{
      bookmakers:[{
        name:'Bet365',
        markets:{asian_handicap:{inplay:{line,home:homeOdds,away:awayOdds,updated_at:nowIso}}}
      }]
    }
  });
  return {
    success:1,
    data:[
      mk(341001,'Demo Premier','Sirius FC','Vega Athletic',67,[1,0],{
        attacks:{home:n(55,2),away:n(43,1)},dangerous_attacks:{home:n(32,2),away:n(21,1)},shots_on_target:{home:n(4,1),away:2},shots_off_target:{home:n(6,1),away:3},corners:{home:n(4,1),away:2},possession:{home:58,away:42}
      },-0.5,1.88,1.96),
      mk(341002,'Demo Cup','Alpha United','Beta City',74,[1,1],{
        attacks:{home:n(61,2),away:n(49,1)},dangerous_attacks:{home:n(37,2),away:n(24,1)},shots_on_target:{home:n(5,1),away:2},shots_off_target:{home:n(7,1),away:3},corners:{home:n(5,1),away:2},possession:{home:60,away:40}
      },0,1.82,2.04),
      mk(341003,'Demo League','North FC','South FC',58,[0,0],{
        attacks:{home:n(45,1),away:n(44,1)},dangerous_attacks:{home:n(23,1),away:n(22,1)},shots_on_target:{home:n(2,0),away:2},shots_off_target:{home:n(4,1),away:4},corners:{home:n(3,0),away:3},possession:{home:51,away:49}
      },-0.25,1.76,2.10)
    ],
    pagination:{page:1,per_page:500,count:3,has_more:false}
  };
}
