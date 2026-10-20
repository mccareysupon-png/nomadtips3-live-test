// BALL46 Member: deterministic team kits, scoped to the expanded Featured Match card.
const MEMBER_KIT_NAMES = [
  'kit_01_red','kit_02_royal_blue','kit_03_emerald_green','kit_04_gold_yellow',
  'kit_05_royal_purple','kit_06_bright_orange','kit_07_hot_pink','kit_08_sky_blue',
  'kit_09_white_silver','kit_10_carbon_black','kit_11_deep_navy','kit_12_burgundy'
];
// Similar shades should not appear as HOME and AWAY in the same expanded match.
const MEMBER_KIT_GROUPS = ['red','blue','green','gold','purple','gold','red','blue','white','black','blue','red'];
function memberStableKitIndex(teamId,teamName){
  const identified=teamId!==null&&teamId!==undefined&&String(teamId).trim()!=='';
  const key=identified?'id:'+String(teamId):'name:'+String(teamName??'').trim().normalize('NFKC').toLowerCase();
  let hash=2166136261;
  for(let i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);
  return (hash>>>0)%MEMBER_KIT_NAMES.length;
}
function memberKitPair(fixture){
  const h=memberStableKitIndex(fixture.homeId,fixture.home);
  const preferred=memberStableKitIndex(fixture.awayId,fixture.away);
  let a=preferred;
  if(MEMBER_KIT_GROUPS[a]===MEMBER_KIT_GROUPS[h]){
    // Stable per fixture: only resolve conflicting shades for AWAY.
    for(let offset=1;offset<MEMBER_KIT_NAMES.length;offset++){
      const candidate=(preferred+offset)%MEMBER_KIT_NAMES.length;
      if(MEMBER_KIT_GROUPS[candidate]!==MEMBER_KIT_GROUPS[h]){a=candidate;break;}
    }
  }
  return {home:h,away:a};
}
function memberKitPicture(index){
  const slug=MEMBER_KIT_NAMES[index];
  const picture=node('picture','member-team-kit');
  const img=node('img');
  img.src='/assets/kits/webp/2x/'+slug+'.webp';
  img.alt='';
  img.setAttribute('aria-hidden','true');
  img.width=160;img.height=160;
  img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>{picture.hidden=true;}); // Team name remains visible.
  picture.append(img);
  return picture;
}
