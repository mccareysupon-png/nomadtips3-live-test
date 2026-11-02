const pressure=Array.from({length:91},(_,minute)=>{const home=50+Math.round(Math.sin(minute/8)*22+Math.cos(minute/3)*6);return{minute,home,away:100-home}});
const signals=[{id:'s-home',minute:22,market:'Asian Handicap · Full Time',selection:'home',line:.25,odds:1.85,bookmaker:'Example Book',entryScore:'1–0'},{id:'s-away',minute:42,market:'1X2 · Full Time',selection:'away',odds:2.1,bookmaker:'Example Book',entryScore:'1–0'},{id:'s-over',minute:64,market:'Over / Under · Full Time',selection:'over',line:2.5,odds:1.91,bookmaker:'Example Book',entryScore:'1–1'},{id:'s-under',minute:81,market:'Over / Under · Full Time',selection:'under',line:3.5,odds:1.875,bookmaker:'Example Book',entryScore:'2–1'}];
const events=[{type:'goal',side:'home',minute:18},{type:'corner',side:'away',minute:27},{type:'yellow',side:'home',minute:44},{type:'goal',side:'away',minute:53},{type:'red',side:'away',minute:66},{type:'goal',side:'home',minute:78}];
export function dataset(mode='standard'){const data={source:'SYNTHETIC PREVIEW — NOT LIVE',home:'Home TEST A',away:'Away TEST A',minute:90,score:'2–1',points:pressure.map(p=>({...p})),signals:signals.map(s=>({...s})),events:events.map(e=>({...e}))};
 if(mode==='dense')data.signals=Array.from({length:18},(_,i)=>({...signals[i%4],id:'dense-'+i,minute:28+(i%9)*.35}));
 if(mode==='gap')data.points=data.points.filter(p=>p.minute>=14&&(p.minute<38||p.minute>52));
 if(mode==='empty')data.signals=[];
 if(mode==='partial'){data.signals.push({id:'no-clock',selection:'home',market:'1X2',odds:1.9},{id:'future-clock',minute:96,selection:'away',market:'1X2',odds:2.0});}
 if(mode==='stoppage'){data.minute=96;data.points=Array.from({length:97},(_,minute)=>({...pressure[minute%91],minute}));data.signals.push({id:'added-time',matchTime:'90+3:30',selection:'away',market:'Asian Handicap',line:0,odds:1.96});}
 if(mode==='no-history')data.points=[];
 return data;
}
