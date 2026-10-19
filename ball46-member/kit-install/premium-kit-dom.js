// BALL46_MEMBER_PREMIUM_16KITS_20261019 — display-only helpers for Expanded Match Card.
const PREMIUM_KIT_PRESETS=Object.freeze([[1,12],[3,16],[6,4],[9,8],[10,14],[13,11],[15,2],[7,5]].map(pair=>Object.freeze(pair)));
function premiumKitHash(value){
  let hash=2166136261;
  for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return hash>>>0;
}
function premiumKitsForFixture(selected,featured){
  const fixtureId=selected?.fixtureId??featured?.fixtureId??null;
  const seed=fixtureId!==null&&String(fixtureId).trim()
    ? 'fixture:'+String(fixtureId).trim()
    : 'fallback:'+[
        featured?.league??selected?.league??'',
        featured?.home??selected?.home??'',
        featured?.away??selected?.away??'',
        featured?.kickoffTime??featured?.kickoff??selected?.kickoffTime??selected?.kickoff??''
      ].map(v=>String(v??'').trim().toLocaleLowerCase('en-US')).join('|');
  return PREMIUM_KIT_PRESETS[premiumKitHash(seed)%PREMIUM_KIT_PRESETS.length];
}
function appendPremiumMatchKit(team,side,kitNumber){
  const image=node('img','premium-match-kit premium-match-kit-'+side);
  const filename='kit_'+String(kitNumber).padStart(2,'0')+'.png';
  image.setAttribute('alt','');
  image.setAttribute('aria-hidden','true');
  image.width=512;image.height=512;
  image.loading='lazy';image.decoding='async';
  image.addEventListener('load',()=>{
    if(image.naturalWidth>0)team.classList.add('premium-kit-ready');
  },{once:true});
  image.addEventListener('error',()=>{
    image.hidden=true;
    team.classList.remove('premium-kit-ready');
  },{once:true});
  image.src='/assets/premium-kits/'+filename;
  team.append(image);
}
