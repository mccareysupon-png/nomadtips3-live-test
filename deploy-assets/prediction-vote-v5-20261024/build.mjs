import assert from'node:assert/strict';
import{readFile,writeFile,mkdir}from'node:fs/promises';
import postcss from'postcss';
const base='deploy-assets/prediction-vote-v5-20261024/';
const raw=await readFile(base+'approved-v5-preview.html','utf8');
const stylesheet=raw.match(/<style>([\s\S]*?)<\/style>/)?.[1];
const start=raw.indexOf('<article class="prediction"'),end=raw.indexOf('</article>',start)+10;
assert(stylesheet&&start>0&&end>start,'APPROVED_V5_PARTS_MISSING');
const template=raw.slice(start,end);
assert(template.includes('id="homeJersey"')&&template.includes('id="awayJersey"')&&template.includes('data-vote="0"')&&template.includes('id="audienceBars"'));
const root=postcss.parse(stylesheet);
root.walkRules(rule=>{
 const selectors=rule.selectors||[rule.selector];
 rule.selectors=selectors.map(a=>{
  let s=a.trim();
  if(s===':root')return '.b46-v5';
  if(s.startsWith('[data-theme="light"]'))return'html[data-theme="light"] .b46-v5'+s.slice('[data-theme="light"]'.length);
  if(s.startsWith('body'))return'.b46-v5'+s.slice('body'.length);
  if(s.startsWith('.preview.mobile'))return'.b46-v5'+s.slice('.preview.mobile'.length);
  return'.b46-v5 '+s;
 });
});
const css=root.toString()+'\n.b46-v5 .prediction{max-width:100%;margin:0;border:0!important}.b46-v5 .prediction *{min-width:0}'+
 '\n.b46-v5 .results,.b46-v5 .model,.b46-v5 .matchline,.b46-v5 .vote-choice{border:0!important}'+
 '\n.b46-v5 .prediction{box-shadow:0 16px 36px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.04)}'+
 '\n.b46-v5 .b46-v5-empty{font-size:10px;color:var(--muted);line-height:1.6;padding:7px}';
const imagesMatch=raw.match(/const jerseys = (\[[^\n]+\]);/);
assert(imagesMatch,'SIX_3D_JERSEYS_MISSING');const assets=JSON.parse(imagesMatch[1]);
assert.equal(assets.length,6);assert(assets.every(x=>x.src.startsWith('data:image/png;base64,')));
const sizes=assets.map(x=>Buffer.from(x.src.split(',')[1],'base64').length);
assert(sizes.every(x=>x>1000&&x<400000));
const images=assets.map(x=>x.src.split(',')[1]);
const controller=await readFile(base+'v5-controller.js','utf8');
assert(controller.includes('__V5_TEMPLATE__')&&controller.includes('__V5_CSS__'));
const assembled=controller.replace('__V5_TEMPLATE__',JSON.stringify(template)).replace('__V5_CSS__',JSON.stringify(css));
await mkdir(base+'build',{recursive:true});
await writeFile(base+'build/v5-browser.js',assembled);
await writeFile(base+'build/v5-browser.mjs','export const browserScript='+JSON.stringify(assembled)+';\n');
await writeFile(base+'build/v5-jerseys.mjs','export const jerseyPng='+JSON.stringify(images)+';\n');
console.log('B46_V5_COMPILED='+JSON.stringify({codeLength:assembled.length,cssLength:css.length,jerseys:assets.map((x,i)=>({i,label:x.label,bytes:sizes[i]})),templateLength:template.length}));
