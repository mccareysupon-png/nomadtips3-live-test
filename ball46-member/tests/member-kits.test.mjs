import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const script=fs.readFileSync(new URL('../public/member-kits.js',import.meta.url),'utf8');
const ctx=vm.createContext({});
vm.runInContext(script,ctx);
const calc=(expr)=>vm.runInContext(expr,ctx);

test('12 premium football kit variants are registered',()=>{
  assert.equal(calc('MEMBER_KIT_NAMES.length'),12);
  assert.equal(new Set(calc('[...MEMBER_KIT_NAMES]')).size,12);
});

test('team ID keeps a stable primary color across rerenders',()=>{
  const a=calc('memberStableKitIndex(187,"Blue United")');
  assert.equal(calc('memberStableKitIndex(187,"Renamed Display Label")'),a);
  assert.equal(calc('memberStableKitIndex(187,"Blue United")'),a);
});

test('fallback team name selection is stable without an ID',()=>{
  assert.equal(calc('memberStableKitIndex(null,"Blue United")'),
               calc('memberStableKitIndex(null,"  BLUE UNITED  ")'));
});

test('different HOME/AWAY kit color groups are enforced on collisions',()=>{
  for(let h=0;h<30;h++)for(let a=0;a<30;a++){
    const p=calc('memberKitPair({homeId:'+h+',home:"Home",awayId:'+a+',away:"Away"})');
    assert.notEqual(calc('MEMBER_KIT_GROUPS['+p.home+']'),
                    calc('MEMBER_KIT_GROUPS['+p.away+']'));
  }
});

test('all 12 kit choices are reachable by the stable hash',()=>{
  const found=new Set();
  for(let id=0;id<1500;id++)found.add(calc('memberStableKitIndex('+id+',"Club")'));
  assert.equal(found.size,12);
});

test('only the expanded Featured Match inserts team kit images',()=>{
  const member=fs.readFileSync(new URL('../public/member.js',import.meta.url),'utf8');
  assert.equal((member.match(/memberKitPicture\(kitPair\.home\)/g)||[]).length,1);
  assert.equal((member.match(/memberKitPicture\(kitPair\.away\)/g)||[]).length,1);
  const html=fs.readFileSync(new URL('../public/member.html',import.meta.url),'utf8');
  assert(html.indexOf('/member-kits.js')<html.indexOf('/member.js'));
  assert(html.includes('/member-kits.js'));
});

test('all 12 approved transparent WebP jersey images exist in public assets',()=>{
  const names=calc('[...MEMBER_KIT_NAMES]');
  for(const name of names){
    const filename=new URL('../public/assets/kits/webp/2x/'+name+'.webp',import.meta.url);
    const bytes=fs.readFileSync(filename);
    assert(bytes.length>1000,'file too small: '+name);
    assert.equal(bytes.toString('ascii',0,4),'RIFF');
    assert.equal(bytes.toString('ascii',8,12),'WEBP');
  }
});
