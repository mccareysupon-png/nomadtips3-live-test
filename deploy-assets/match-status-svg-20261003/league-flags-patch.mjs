import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const TOKEN='343-league-flags-menu-143-20261003a';
export const assetSource=readFileSync(new URL('./league-flags-343.asset.js', import.meta.url),'utf8');

export function registry(source=assetSource){
  const codesBlock=source.match(/const CODES=\{([\s\S]*?)\n\};/);
  assert(codesBlock,'CODES_BLOCK_MISSING');
  const pairs=[...codesBlock[1].matchAll(/"([^"]+)":"([^"]+)"/g)].map(match=>[match[1],match[2]]);
  const map=Object.fromEntries(pairs);
  return { map, aliases:pairs.length, icons:new Set(pairs.map(([,code])=>code)).size };
}

export function validateAsset(source=assetSource){
  const info=registry(source);
  assert.equal(info.aliases,167,'FLAG_ALIAS_COUNT_MISMATCH');
  assert.equal(info.icons,143,'FLAG_ICON_COUNT_MISMATCH');
  assert.equal(info.map['northern ireland'],'gb-nir','NORTHERN_IRELAND_FLAG_WRONG');
  assert.equal(info.map['england'],'gb-eng','ENGLAND_FLAG_WRONG');
  assert.equal(info.map['scotland'],'gb-sct','SCOTLAND_FLAG_WRONG');
  assert.equal(info.map['wales'],'gb-wls','WALES_FLAG_WRONG');
  assert.equal(info.map['thailand'],'th','THAILAND_FLAG_WRONG');
  assert(source.includes('flag-icons@7.5.0/flags/4x3/'),'FLAG_ICON_LIBRARY_CHANGED');
  for(const selector of ["'[data-league-filter] > span'","'.league-block .league-head > strong'","'.match-card .league-scoreboard'","'[data-featured-league]'"]) assert(source.includes(selector),`FLAG_TARGET_MISSING:${selector}`);
  return info;
}

export function patchIndex(html){
  const tag=`<script src="league-flags-343.js?v=${TOKEN}" defer></script>`;
  const existing=[...html.matchAll(/<script\s+src="league-flags-343\.js[^"]*"\s+defer><\/script>/g)];
  let next=html;
  if(existing.length>1) throw new Error(`LEAGUE_FLAG_SCRIPT_DUPLICATE:${existing.length}`);
  if(existing.length===1){
    next=html.replace(existing[0][0],tag);
  }else{
    const dashboard=/<script\s+src="dashboard-v2-stage3\.js[^"]*"\s+defer><\/script>/;
    const hit=html.match(dashboard);
    assert(hit,'DASHBOARD_SCRIPT_ANCHOR_MISSING');
    next=html.replace(dashboard,`${hit[0]}${tag}`);
  }
  const count=(next.match(/league-flags-343\.js/g)||[]).length;
  assert.equal(count,1,'LEAGUE_FLAG_SCRIPT_COUNT_BAD');
  assert(next.includes(tag),'LEAGUE_FLAG_SCRIPT_TOKEN_MISSING');
  return next;
}
