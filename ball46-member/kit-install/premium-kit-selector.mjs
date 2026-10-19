// BALL46_MEMBER_PREMIUM_16KITS_20261019 — deterministic appearance only.
export const PREMIUM_KIT_PRESETS=Object.freeze([[1,12],[3,16],[6,4],[9,8],[10,14],[13,11],[15,2],[7,5]].map(x=>Object.freeze(x)));
export function premiumKitHash(str){let v=2166136261;for(let i=0;i<str.length;i++){v^=str.charCodeAt(i);v=Math.imul(v,16777619);}return v>>>0;}
export function premiumKitsForFixture(selected,featured){
  const id=selected?.fixtureId??featured?.fixtureId??null;
  const key=id!==null&&String(id).trim()?'fixture:'+String(id).trim():'fallback:'+[
    featured?.league??selected?.league??'',featured?.home??selected?.home??'',
    featured?.away??selected?.away??'',featured?.kickoffTime??featured?.kickoff??selected?.kickoffTime??selected?.kickoff??''
  ].map(x=>String(x??'').trim().toLocaleLowerCase('en-US')).join('|');
  return PREMIUM_KIT_PRESETS[premiumKitHash(key)%PREMIUM_KIT_PRESETS.length];
}
