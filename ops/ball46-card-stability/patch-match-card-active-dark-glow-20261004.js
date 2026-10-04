const fs=require('fs');
const [,,srcPath,outPath]=process.argv;
if(!srcPath||!outPath) throw new Error('USAGE: node patch-match-card-active-dark-glow-20261004.js <src> <out>');
let s=fs.readFileSync(srcPath,'utf8');
const MARK='B46_MATCH_CARD_ACTIVE_DARK_GLOW_20261004';
const PREV='B46_MATCH_CARD_THEME_CONTRAST_20261004';
if(s.includes(MARK)) throw new Error('MATCH_CARD_ACTIVE_DARK_GLOW_ALREADY_PRESENT_STOP');
for(const anchor of [PREV,'B46_MAIN_CARDS_SQUARE_20261003','B46_MATCH_CLOCK_COLORS_20261003','.match-row']){
  if(!s.includes(anchor)) throw new Error(`BASE_ANCHOR_MISSING:${anchor}`);
}
const patch=`\n\n/* ${MARK}: dark selected card stays black; green edge/glow only. */\nhtml[data-theme="dark"] body .workspace.singlepage .match-row.active {\n  background: #030605 !important;\n  border-top-color: #2ACF83 !important;\n  border-bottom-color: #2ACF83 !important;\n  box-shadow: 0 0 0 1px rgba(42,207,131,.22), 0 0 14px rgba(42,207,131,.16) !important;\n}\n`;
s+=patch;
for(const x of [MARK,'html[data-theme="dark"] body .workspace.singlepage .match-row.active','background: #030605 !important','#2ACF83','rgba(42,207,131,.16)']){
  if(!s.includes(x)) throw new Error(`PATCH_VERIFY_MISSING:${x}`);
}
if(/(?:padding|margin|width|height|border-width|border-style|transform)\s*:/i.test(patch)) throw new Error('GEOMETRY_CHANGE_STOP');
fs.writeFileSync(outPath,s);
console.log(JSON.stringify({ok:true,marker:MARK,inputBytes:Buffer.byteLength(fs.readFileSync(srcPath)),outputBytes:Buffer.byteLength(s)}));