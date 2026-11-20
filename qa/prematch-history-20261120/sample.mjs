export function fixture(id,kickoff,home=1,away=2,hg=2,ag=1,status='finished'){
 return {id,league:{id:123},teams:{home:{id:home},away:{id:away}},kickoff_ts:kickoff,status,status_code:status==='finished'?'full':null,goals:{home:hg,away:ag}};
}
export const base=1760000000;
export function seed(){return Array.from({length:12},(_,i)=>fixture(100+i,base+i*3600,i%2===0?1:2,i%2===0?2:1,i%3,1));}
