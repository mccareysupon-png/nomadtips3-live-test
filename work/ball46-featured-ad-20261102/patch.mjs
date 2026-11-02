import assert from 'node:assert/strict';
export const MARK='B46_FEATURED_AFFILIATE_20261102';
export const IMAGE='b46-featured-1xbet-20261102.webp';
export const JS='b46-featured-affiliate-20261102.js';
export const CSS='b46-featured-affiliate-20261102.css';
export function patchIndexHtml(html){
 assert.equal(typeof html,'string');
 assert(html.includes('<section class="side-card featured-card" data-featured>'),'LIVE_FEATURED_ANCHOR_MISSING');
 assert(!html.includes(MARK),'ALREADY_PATCHED');
 assert.equal(html.split('</body>').length-1,1,'BODY_ANCHOR_NOT_UNIQUE');
 const addition=`\n<!-- ${MARK} -->\n<link rel="stylesheet" href="/${CSS}?v=20261102">\n<script defer src="/${JS}?v=20261102"></script>\n`;
 const after=html.replace('</body>',addition+'</body>');
 assert.equal(after.replace(addition,''),html,'UNSCOPED_HTML_CHANGE');
 return after;
}