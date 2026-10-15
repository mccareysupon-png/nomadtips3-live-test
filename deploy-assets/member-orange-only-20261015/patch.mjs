import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const BASE='41c55f81-ac4d-4582-9c81-5067ad40a3e8';
export const SCRIPT='ball46-production';
export const ORIGINAL_KITS='ee7084e051d455af5959df298e65ee940019b7f51c6ad4c8f1ff9c37a404e5e6';
export const CANDIDATE_KITS=ORIGINAL_KITS;
export function patchMemberColors(html){
 const found=[...html.matchAll(/<style id="b46-member-gold-1011">[\s\S]*?<\/style>/g)];
 assert.equal(found.length,1,'MEMBER_STYLE_COUNT_CHANGED');const old=found[0][0];
 const variables='\na[data-b46-member-entry="rail"]{--b46-member-orange:#fb923c}\nhtml[data-theme="light"] a[data-b46-member-entry="rail"]{--b46-member-orange:#c2410c}\n';
 const substitutions=[['#ffe57c','var(--b46-member-orange)'],['#f8df9b','#fb923c'],['#acbbcf','#fb923c'],['#16af73','var(--b46-member-orange)'],['Yellow at rest; green on hover and active.','Orange text and icons in resting, hover and active states.']];
 let block=old;const proof=[];for(const [before,after]of substitutions){const count=block.split(before).length-1;assert(count>0,'MEMBER_COLOR_ANCHOR:'+before);proof.push({before,after,count});block=block.replaceAll(before,after);}
 block=block.replace('<style id="b46-member-gold-1011">','<style id="b46-member-gold-1011">'+variables);
 const candidate=html.replace(old,block);assert.equal(candidate.replace(block,old),html,'UNRELATED_HTML_CHANGED');
 assert.equal((candidate.match(/href="https:\/\/member\.ball46\.com\/pricing"/g)||[]).length,(html.match(/href="https:\/\/member\.ball46\.com\/pricing"/g)||[]).length,'MEMBER_LINK_CHANGED');
 return {html:candidate,originalStyle:old,candidateStyle:block,proof};
}
