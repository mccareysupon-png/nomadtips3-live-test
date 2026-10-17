import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{readFileSync}from'node:fs';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='a7c9d22f-1d69-4cbf-9f40-1a8ef6dfff0f',SCRIPT='ball46-production',ORIGINAL_HTML='2e2154a0a86aa090376af85b57fd25644af2643fb5396c7339d788a6107e7812';
export const ORIGINAL_KITS='ee7084e051d455af5959df298e65ee940019b7f51c6ad4c8f1ff9c37a404e5e6',CANDIDATE_KITS=ORIGINAL_KITS;
export function validateCss(css){
 assert(!/@import|url\s*\(|<\/?(?:script|style)/i.test(css),'UNEXPECTED_RESOURCE');
 const clean=css.trim(),rules=[...clean.matchAll(/([^{}]+)\{([^{}]+)\}/g)];assert.equal(rules.length,2);assert.equal(rules.map(x=>x[0]).join('').replace(/\s/g,''),clean.replace(/\s/g,''));
 for(let i=0;i<2;i++){const theme=i===0?'light':'dark',color=i===0?'#000000':'#FFFFFF';assert.equal(rules[i][1].trim(),'html:root[data-theme="'+theme+'"] a[data-b46-member-entry="rail"] .b46-premium-members .b46-premium-detail strong','ONLY_BADGE_NUMBER_SELECTOR');assert.equal(rules[i][2].trim(),'color:'+color+'!important','ONLY_APPROVED_COLOR');}
 return{rules:2,selectors:2,properties:['color'],light:'#000000',dark:'#FFFFFF'};
}
export function patchMemberBadge(html){
 assert.equal(sha(html),ORIGINAL_HTML,'ACTIVE_HTML_DRIFT');assert(!html.includes('b46-member-count-only-20261017'),'ALREADY_PATCHED');assert.equal(html.split('</head>').length-1,1);
 const badges=[...html.matchAll(/<span class="b46-premium-members"[^>]*>[\s\S]*?<\/strong><\/span><\/span>/g)];assert.equal(badges.length,1,'BADGE_COUNT');const oldBadge=badges[0][0],icons=[...oldBadge.matchAll(/<svg\b[\s\S]*?<\/svg>/g)],labels=[...oldBadge.matchAll(/<small>MEMBERS<\/small>/g)];assert.equal(icons.length,1);assert.equal(labels.length,1);assert(oldBadge.includes('<strong>1,011</strong>'));
 const newBadge=oldBadge.replace(icons[0][0],'').replace(labels[0][0],'');assert(!/<svg|<small/.test(newBadge),'BADGE_REMOVAL_FAILED');
 const css=readFileSync(new URL('./colors.css',import.meta.url),'utf8'),guard=validateCss(css),block='\n<style id="b46-member-count-only-20261017">\n'+css+'\n</style>\n',result=html.replace(oldBadge,newBadge).replace('</head>',block+'</head>');assert.equal(result.replace(block,'').replace(newBadge,oldBadge),html,'UNRELATED_HTML_CHANGED');return{html:result,css,block,oldBadge,newBadge,guard};
}
