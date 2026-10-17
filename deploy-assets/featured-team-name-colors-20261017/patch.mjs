import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='916e2ad6-88eb-452e-9ff2-a7c778061f7a',SCRIPT='ball46-production';
export const ORIGINAL_KITS='ee7084e051d455af5959df298e65ee940019b7f51c6ad4c8f1ff9c37a404e5e6',CANDIDATE_KITS=ORIGINAL_KITS;
export const ORIGINAL_HTML='c7c9dc4320be875c8ee0a259a2b6dca88c26c9c35f7a1e1be9a4b3c06d704333';
export function validateCss(css){
 assert(!/@import|url\s*\(|<\/?(?:script|style)/i.test(css),'UNEXPECTED_RESOURCE');
 const clean=css.replace(/\/\*[\s\S]*?\*\//g,'').trim(),rules=[...clean.matchAll(/([^{}]+)\{([^{}]+)\}/g)];
 assert.equal(rules.length,2,'RULE_COUNT');assert.equal(rules.map(x=>x[0]).join('').replace(/\s/g,''),clean.replace(/\s/g,''),'UNPARSED_CSS');
 for(let i=0;i<2;i++){const theme=i===0?'light':'dark',color=i===0?'#000000':'#FFFFFF';
  assert.equal(rules[i][2].trim(),'color:'+color+'!important','ONLY_APPROVED_COLOR');
  assert.deepEqual(rules[i][1].trim().split(',').map(s=>s.trim()),['home','away'].map(s=>'html:root[data-theme="'+theme+'"] body .workspace.singlepage .featured-card [data-featured-'+s+']'),'ONLY_FEATURED_NAME_SELECTORS');
 }
 return {rules:2,selectors:4,properties:['color'],light:'#000000',dark:'#FFFFFF'};
}
export function patchFeaturedNames(html){assert.equal(sha(html),ORIGINAL_HTML,'ACTIVE_HTML_DRIFT');assert(!html.includes('b46-featured-team-name-colors-20261017'),'ALREADY_PATCHED');assert.equal(html.split('</head>').length-1,1,'HEAD_ANCHOR_COUNT');const css=readFileSync(new URL('./colors.css',import.meta.url),'utf8'),guard=validateCss(css),block='\n<style id="b46-featured-team-name-colors-20261017">\n'+css+'\n</style>\n',result=html.replace('</head>',block+'</head>');assert.equal(result.replace(block,''),html,'UNRELATED_HTML_CHANGED');return{html:result,css,block,guard};}
