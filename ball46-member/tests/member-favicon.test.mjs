import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const publicDir=new URL('../public/',import.meta.url);
const favicon=readFileSync(new URL('favicon.svg',publicDir),'utf8');
const pages=['member','pricing','login','success'];

test('Ball46 Member favicon is a self-contained SVG in the deployed public asset directory',()=>{
 assert.match(favicon,/<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
 assert.match(favicon,/data-icon-version="member-favicon-20261010"/);
 assert.match(favicon,/>46<\/text>/);
 assert.match(favicon,/#07111b/);
 assert.match(favicon,/#ffe31a/);
 assert.doesNotMatch(favicon,/<(?:image|script|foreignObject)\b/i);
 assert.doesNotMatch(favicon,/https?:\/\//i);
});
test('Every Member subdomain HTML page declares the same versioned favicon',()=>{
 for(const page of pages){
  const html=readFileSync(new URL(page+'.html',publicDir),'utf8');
  assert.match(html,/<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg\?v=20261010-ball46-member1">/);
  assert.ok(html.indexOf('rel="icon"')<html.indexOf('</head>'));
 }
});
