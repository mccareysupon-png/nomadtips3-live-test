/* BALL46 Statistics -> Leagues: existing filter, existing live navigation, no new UI */
export const TARGET='/dashboard-v2-stage3-featured-facts-20261013a.js';
export const OLD_HANDLER="$$('[data-league-filter]').forEach(btn=>btn.addEventListener('click',()=>{leagueFilter=leagueFilter===btn.dataset.leagueFilter?'all':btn.dataset.leagueFilter;renderLeagueFilters();renderBoard()}))";
export const NEW_HANDLER="$$('[data-league-filter]').forEach(btn=>btn.addEventListener('click',()=>{if(document.body.dataset.workspaceView==='statistics'){document.querySelector('[data-status-filter=\"all\"]')?.click()}leagueFilter=leagueFilter===btn.dataset.leagueFilter?'all':btn.dataset.leagueFilter;renderLeagueFilters();renderBoard()}))";
export function patchNav(source){
 const count=source.split(OLD_HANDLER).length-1;
 if(count!==1)throw Error('ORIGINAL_LEAGUE_HANDLER_DRIFT '+count);
 const out=source.replace(OLD_HANDLER,NEW_HANDLER);
 if(out.replace(NEW_HANDLER,OLD_HANDLER)!==source)throw Error('UNRELATED_CODE_CHANGED');
 return out;
}
