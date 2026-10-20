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
// 12 lightweight heritage editions: fixed team colors, 1950s/1970s detailing.
// Entire artwork is local inline SVG: no external image request per expanded card.
// Palette: fabric base, shoulder highlight, seam shadow, antique collar/crest, design.
const MEMBER_VINTAGE_PALETTES=[
  ['#982E40','#C85A6B','#541A2D','#E8D2AE','sash'],
  ['#254F87','#5C89BB','#152C52','#EFE3CB','center'],
  ['#236B51','#56A081','#123A30','#E2C996','pin'],
  ['#B79142','#E2BF71','#765722','#26354B','hoops'],
  ['#5A477E','#9380B3','#302445','#CFB184','center'],
  ['#B76740','#D89468','#702F22','#F3DFBF','chevron'],
  ['#A8617B','#D499A9','#5D2C43','#F8E4CE','band'],
  ['#76B0C4','#B0D8E5','#437B94','#29435B','pin'],
  ['#DDDACE','#FFF7E8','#AAA69E','#354D63','sash'],
  ['#2B3035','#5A6165','#141C22','#D3B17B','center'],
  ['#233957','#537397','#101F37','#E6CE9E','hoops'],
  ['#752E48','#A4536D','#3D1729','#EBD4B2','chevron']
];
let memberVintageSvgSeq=0;
function memberVintageKitPattern(kind,trim,deep){
  switch(kind){
    case 'sash':return '<path d="M24 38 45 26 114 143H92Z" fill="'+trim+'" opacity=".77"/><path d="M43 28 50 26 119 143H112Z" fill="'+deep+'" opacity=".55"/>';
    case 'center':return '<path d="M68 24H93V144H68Z" fill="'+trim+'" opacity=".82"/><path d="M77 25H85V144H77Z" fill="'+deep+'" opacity=".71"/>';
    case 'pin':return [50,63,76,89,102,115].map(x=>'<path d="M'+x+' 27V145" stroke="'+trim+'" stroke-width="2.3" opacity=".55"/>').join('');
    case 'hoops':return [50,79,108].map(y=>'<path d="M41 '+y+'h78v10H41Z" fill="'+deep+'" opacity=".46"/><path d="M41 '+y+'h78" stroke="'+trim+'" stroke-width="2" opacity=".6"/>').join('');
    case 'chevron':return '<path d="M36 55 80 86 124 55V66L80 97 36 66Z" fill="'+trim+'" opacity=".72"/><path d="M38 68 80 99 122 68" fill="none" stroke="'+deep+'" stroke-width="3.5" opacity=".5"/>';
    default:return '<path d="M42 64h76v20H42Z" fill="'+trim+'" opacity=".67"/><path d="M42 74h76" stroke="'+deep+'" stroke-width="4" opacity=".5"/>';
  }
}
function memberVintageKitSVG(index){
  const [base,light,deep,trim,design]=MEMBER_VINTAGE_PALETTES[index];
  const uniq=++memberVintageSvgSeq;
  const fabric='member-vintage-fabric-'+uniq;
  const fold='member-vintage-fold-'+uniq;
  const clip='member-vintage-cut-'+uniq;
  const weave='member-vintage-weave-'+uniq;
  const outline='M55 24 68 20Q80 31 92 20L105 24 128 35 148 57 132 74 116 60 116 141Q80 148 44 141L44 60 28 74 12 57 32 35Z';
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 160 160');
  svg.setAttribute('width','160');svg.setAttribute('height','160');
  svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  svg.innerHTML='<defs>'
    +'<linearGradient id="'+fabric+'" x1="0" y1="0" x2="0.9" y2="1"><stop stop-color="'+light+'"/><stop offset=".43" stop-color="'+base+'"/><stop offset="1" stop-color="'+deep+'"/></linearGradient>'
    +'<linearGradient id="'+fold+'" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#060A13" stop-opacity=".34"/><stop offset=".28" stop-color="#FFF" stop-opacity=".10"/><stop offset=".51" stop-color="#FFF" stop-opacity=".015"/><stop offset=".79" stop-color="#FFF" stop-opacity=".09"/><stop offset="1" stop-color="#060A13" stop-opacity=".31"/></linearGradient>'
    +'<pattern id="'+weave+'" width="4" height="4" patternUnits="userSpaceOnUse"><path d="M.5 0v4 M2.5 0v4" stroke="#FFF" stroke-opacity=".04" stroke-width=".45"/></pattern>'
    +'<clipPath id="'+clip+'"><path d="'+outline+'"/></clipPath></defs>'
    +'<path d="'+outline+'" fill="url(#'+fabric+')" stroke="'+deep+'" stroke-width="2.2" stroke-linejoin="round"/>'
    +'<g clip-path="url(#'+clip+')">'
    +memberVintageKitPattern(design,trim,deep)
    +'<path d="M44 60Q56 78 51 143M116 60Q104 78 109 143" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="4"/>'
    +'<path d="M28 36Q38 50 44 68M132 36Q122 50 116 68" fill="none" stroke="#FFF" stroke-opacity=".17" stroke-width="2"/>'
    +'<path d="'+outline+'" fill="url(#'+fold+')"/><path d="'+outline+'" fill="url(#'+weave+')"/>'
    +'<path d="M12 57 28 74 37 61 21 44ZM148 57 132 74 123 61 139 44Z" fill="'+deep+'" opacity=".30"/>'
    +'<path d="M15 60 28 73 35 63M145 60 132 73 125 63" fill="none" stroke="'+trim+'" stroke-width="3.4" opacity=".84"/>'
    +'<path d="M47 139Q80 146 113 139" fill="none" stroke="'+trim+'" stroke-width="2.8" opacity=".72"/>'
    +'<path d="M50 39Q55 81 50 132M110 39Q105 81 110 132" fill="none" stroke="'+trim+'" stroke-width=".75" opacity=".32" stroke-dasharray="2 3"/>'
    +'</g>'
    +'<path d="M68 20Q80 32 92 20L96 24Q80 44 64 24Z" fill="'+trim+'" stroke="'+deep+'" stroke-width="1.7"/>'
    +'<path d="M71 20Q80 28 89 20L89 26Q80 35 71 26Z" fill="'+deep+'"/>'
    +'<path d="M79 35V56" stroke="'+trim+'" stroke-width="3" opacity=".86"/><circle cx="79" cy="43" r="1.35" fill="'+deep+'"/><circle cx="79" cy="50" r="1.35" fill="'+deep+'"/>'
    +'<g transform="translate(94 46)"><path d="M0 0Q10 -4 20 0V15Q10 23 0 15Z" fill="'+trim+'" stroke="'+deep+'" stroke-width="1.3"/><path d="M3 3Q10 1 17 3V13Q10 18 3 13Z" fill="'+deep+'"/><path d="M10 4V15M6 8H14" stroke="'+trim+'" stroke-width="1.3" opacity=".9"/></g>'
    +'<path d="M55 24 68 20M92 20 105 24" fill="none" stroke="'+trim+'" stroke-width="2" stroke-linecap="round" opacity=".6"/>';
  return svg;
}
function memberKitPicture(index){
  const slug=MEMBER_KIT_NAMES[index];
  const picture=node('span','member-team-kit');
  picture.setAttribute('aria-hidden','true');
  // All 12 colorways draw from one compact template. No URL fetch or flicker on updates.
  try{
    picture.append(memberVintageKitSVG(index));
  }catch{
    const img=node('img');
    img.src='/assets/kits/webp/2x/'+slug+'.webp';
    img.alt='';img.width=160;img.height=160;
    img.loading='lazy';img.decoding='async';
    img.addEventListener('error',()=>{picture.hidden=true;});
    picture.append(img);
  }
  return picture;
}
