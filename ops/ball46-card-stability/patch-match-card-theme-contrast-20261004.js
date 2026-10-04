const fs=require('fs');
const [,,srcPath,outPath]=process.argv;
if(!srcPath||!outPath) throw new Error('USAGE: node patch-match-card-theme-contrast-20261004.js <src> <out>');
let s=fs.readFileSync(srcPath,'utf8');
const MARK='B46_MATCH_CARD_THEME_CONTRAST_20261004';
if(s.includes(MARK)) throw new Error('MATCH_CARD_THEME_CONTRAST_ALREADY_PRESENT_STOP');
for(const anchor of ['B46_MAIN_CARDS_SQUARE_20261003','B46_MATCH_CLOCK_COLORS_20261003','.match-row']){
  if(!s.includes(anchor)) throw new Error(`BASE_ANCHOR_MISSING:${anchor}`);
}
const patch=`\n\n/* ${MARK}: presentation-only match-card contrast; geometry, active state, data and behavior untouched. */\nbody .workspace.singlepage .match-row:not(.active) {\n  background: #E5EBE8 !important;\n  border-top-color: #C8D2CD !important;\n  border-bottom-color: #C8D2CD !important;\n}\n@media (hover:hover) and (pointer:fine) {\n  body .workspace.singlepage .match-row:not(.active):hover {\n    background: #DFE7E3 !important;\n    border-top-color: #BAC8C1 !important;\n    border-bottom-color: #BAC8C1 !important;\n  }\n}\nhtml[data-theme="dark"] body .workspace.singlepage .match-row:not(.active) {\n  background: #030605 !important;\n  border-top-color: #17221D !important;\n  border-bottom-color: #17221D !important;\n}\n@media (hover:hover) and (pointer:fine) {\n  html[data-theme="dark"] body .workspace.singlepage .match-row:not(.active):hover {\n    background: #07100C !important;\n    border-top-color: #24372E !important;\n    border-bottom-color: #24372E !important;\n  }\n}\n`;
s+=patch;
for(const x of [MARK,'.match-row:not(.active)','background: #E5EBE8 !important','background: #030605 !important','#C8D2CD','#17221D']){
  if(!s.includes(x)) throw new Error(`PATCH_VERIFY_MISSING:${x}`);
}
if(/\.match-row\.active\s*\{[^}]*background/i.test(patch)) throw new Error('ACTIVE_MATCH_CARD_OVERRIDDEN_STOP');
if(/(?:padding|margin|width|height|border-width|border-style|box-shadow|transform)\s*:/i.test(patch)) throw new Error('GEOMETRY_OR_SHADOW_CHANGE_STOP');
fs.writeFileSync(outPath,s);
console.log(JSON.stringify({ok:true,marker:MARK,inputBytes:Buffer.byteLength(fs.readFileSync(srcPath)),outputBytes:Buffer.byteLength(s)}));