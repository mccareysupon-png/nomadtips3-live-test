import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const frontend=fileURLToPath(new URL('../../nomad-live/',import.meta.url));
const read=name=>readFileSync(join(frontend,name),'utf8');
const PRODUCTION_ENGINE='https://nomadtips3-live-engine.mccarey-supon.workers.dev';
const TEST_ENGINE_HOST='nomadtips3-live-engine-test.mccarey-supon.workers.dev';

function configuredRuntime(hostname){
  const document={documentElement:{dataset:{}}};
  const window={location:{hostname}};
  vm.runInNewContext(read('runtime-config.js'),{window,document});
  return {runtime:window.NOMAD_RUNTIME,dataset:document.documentElement.dataset};
}

async function runLivePage(engineBase){
  const requests=[];
  const list={innerHTML:'',querySelectorAll:()=>[]};
  const document={
    querySelector:selector=>selector==='.match-list'?list:null,
    querySelectorAll:()=>[],
  };
  const context={
    window:{NOMAD_RUNTIME:engineBase?{engineBase}:{}},
    location:{pathname:'/nomad-live/index.html'},
    document,
    setInterval(){},
    fetch:async url=>{
      requests.push(url);
      return {ok:true,json:async()=>({counts:{},matches:[],cycle:1})};
    },
    console,
  };
  vm.runInNewContext(read('runtime.js'),context);
  await new Promise(resolve=>setImmediate(resolve));
  return requests;
}

function frontendFiles(directory=frontend){
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    return entry.isDirectory()?frontendFiles(path):entry.isFile()?[path]:[];
  });
}

test('runtime routing contract keeps bound hosts on same-origin /api and GitHub Pages direct',()=>{
  const boundProductionHosts=[
    'www.nomadtips3.com',
    'nomadtips3.com',
    'nomadtips3-live-web-production-canary.mccarey-supon.workers.dev',
  ];

  for(const host of boundProductionHosts){
    const configured=configuredRuntime(host);
    assert.equal(configured.runtime.host,host);
    assert.equal(configured.runtime.environment,'production');
    assert.equal(configured.runtime.production,true);
    assert.equal(configured.runtime.test,false);
    assert.equal(configured.runtime.engineBase,'/api');
    assert.equal(configured.runtime.transport,'service-binding');
    assert.equal(configured.dataset.nomadEnvironment,'production');
  }

  const githubPages=configuredRuntime('mccareysupon-png.github.io');
  assert.equal(githubPages.runtime.environment,'production');
  assert.equal(githubPages.runtime.production,true);
  assert.equal(githubPages.runtime.test,false);
  assert.equal(githubPages.runtime.engineBase,PRODUCTION_ENGINE);
  assert.equal(githubPages.runtime.transport,'direct');
  assert.equal(githubPages.dataset.nomadEnvironment,'production');

  const testHost=configuredRuntime('nomadtips3-live-web-test.mccarey-supon.workers.dev');
  assert.equal(testHost.runtime.environment,'test');
  assert.equal(testHost.runtime.production,false);
  assert.equal(testHost.runtime.test,true);
  assert.equal(testHost.runtime.engineBase,'/api');
  assert.equal(testHost.runtime.transport,'service-binding');
  assert.equal(testHost.dataset.nomadEnvironment,'test');
  assert.equal('engineUrl' in testHost.runtime,false);
});

test('Live loads runtime config before runtime and footer never loads a hidden runtime',()=>{
  const page=read('index.html');
  const configPosition=page.indexOf('src="runtime-config.js');
  const runtimePosition=page.indexOf('src="runtime.js');

  assert.notEqual(configPosition,-1,'Live page must load runtime-config.js');
  assert.notEqual(runtimePosition,-1,'Live page must explicitly load runtime.js');
  assert.ok(configPosition<runtimePosition,'runtime-config.js must load first');
  assert.match(page.slice(runtimePosition),/^src="runtime\.js[^"]*" defer/);
  assert.doesNotMatch(read('site-footer.js'),/import\s*\([^)]*runtime\.js/);
});

test('Live /feed uses the same-origin TEST API base',async()=>{
  assert.deepEqual(await runLivePage('/api'),['/api/feed']);
});

test('Live fails closed instead of inventing an engine when runtime config is missing',async()=>{
  assert.deepEqual(await runLivePage(null),[]);
});

test('Live, Statistics, Settings, Health, retention and entry scores share engineBase',()=>{
  for(const file of ['runtime.js','statistics-live.js','settings.html','health-live.js','signal-retention.js','live-entry-score.js']){
    assert.match(read(file),/window\.NOMAD_RUNTIME\?\.engineBase/,file+' must read the configured engineBase');
  }
});

test('only the centralized runtime config may contain the Production engine hostname',()=>{
  const host=new URL(PRODUCTION_ENGINE).hostname;
  const violations=frontendFiles()
    .filter(path=>relative(frontend,path)!=='runtime-config.js')
    .filter(path=>readFileSync(path,'utf8').includes(host))
    .map(path=>relative(frontend,path));

  assert.deepEqual(violations,[]);
});

test('no browser asset contains the public TEST Engine hostname',()=>{
  const violations=frontendFiles()
    .filter(path=>readFileSync(path,'utf8').includes(TEST_ENGINE_HOST))
    .map(path=>relative(frontend,path));

  assert.deepEqual(violations,[]);
});
