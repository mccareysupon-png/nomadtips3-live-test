import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import worker from '../src/index.js';

const project=dirname(fileURLToPath(new URL('../wrangler.jsonc',import.meta.url)));
const frontend=join(project,'../nomad-live');
const config=JSON.parse(readFileSync(join(project,'wrangler.jsonc'),'utf8'));
const TEST_HOST='nomadtips3-live-web-test.mccarey-supon.workers.dev';
const TEST_ENGINE='https://nomadtips3-live-engine-test.mccarey-supon.workers.dev';
const PRODUCTION_ENGINE_HOST='nomadtips3-live-engine.mccarey-supon.workers.dev';

const frontendFiles=(directory=frontend)=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const path=join(directory,entry.name);
  return entry.isDirectory()?frontendFiles(path):entry.isFile()?[path]:[];
});

test('wrangler config publishes only the dedicated workers.dev TEST Worker from nomad-live assets',()=>{
  assert.equal(config.name,'nomadtips3-live-web-test');
  assert.equal(config.workers_dev,true);
  assert.equal(config.preview_urls,false);
  assert.equal(config.assets.directory,'../nomad-live');
  assert.equal(config.assets.binding,'ASSETS');
  assert.equal(config.assets.run_worker_first,true);
  assert.equal(config.vars.NOMAD_WEB_MODE,'sealed');
  assert.equal('routes' in config,false);
  assert.equal('route' in config,false);
  assert.equal('durable_objects' in config,false);
  assert.equal('services' in config,false);
});

test('the configured static asset directory contains every required 3.41 TEST page',()=>{
  for(const page of ['index.html','statistics.html','settings.html','health.html','runtime-config.js']){
    assert.equal(existsSync(join(frontend,page)),true,`${page} must come from nomad-live/`);
  }
});

test('the dedicated workers.dev hostname is classified as TEST and routes only to the TEST Engine',()=>{
  const document={documentElement:{dataset:{}}};
  const window={location:{hostname:TEST_HOST}};
  vm.runInNewContext(readFileSync(join(frontend,'runtime-config.js'),'utf8'),{window,document});

  assert.equal(window.NOMAD_RUNTIME.environment,'test');
  assert.equal(window.NOMAD_RUNTIME.production,false);
  assert.equal(window.NOMAD_RUNTIME.host,TEST_HOST);
  assert.equal(window.NOMAD_RUNTIME.engineBase,TEST_ENGINE);
  assert.equal(document.documentElement.dataset.nomadEnvironment,'test');
});

test('Production Engine hostname is centralized in runtime-config.js only',()=>{
  const violations=frontendFiles()
    .filter(path=>relative(frontend,path)!=='runtime-config.js')
    .filter(path=>readFileSync(path,'utf8').includes(PRODUCTION_ENGINE_HOST))
    .map(path=>relative(frontend,path));

  assert.deepEqual(violations,[]);
});

test('SEALED mode blocks every page and asset before static assets or network can run',async()=>{
  let assetCalls=0;
  let networkCalls=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{networkCalls++;throw new Error('SEALED mode attempted a network request');};

  try{
    for(const path of ['/','/index.html','/statistics.html','/settings.html','/health.html','/runtime-config.js']){
      const response=await worker.fetch(new Request(`https://${TEST_HOST}${path}`),{
        NOMAD_WEB_MODE:'sealed',
        ASSETS:{fetch:async()=>{assetCalls++;return new Response('unexpected asset');}},
      });
      const body=await response.text();
      assert.equal(response.status,403);
      assert.equal(response.headers.get('x-nomad-web-mode'),'SEALED');
      assert.match(body,/NOMAD_TEST_WEB_SEALED/);
      assert.doesNotMatch(body,/<script\b|nomadtips3-live-engine|\/feed|\/health|\/config/i);
    }
  }finally{
    globalThis.fetch=originalFetch;
  }

  assert.equal(assetCalls,0);
  assert.equal(networkCalls,0);
});

test('missing or unexpected mode fails closed',async()=>{
  let assetCalls=0;
  const response=await worker.fetch(new Request(`https://${TEST_HOST}/`),{
    ASSETS:{fetch:async()=>{assetCalls++;return new Response('unexpected asset');}},
  });

  assert.equal(response.status,403);
  assert.equal(assetCalls,0);
});

test('open mode can forward the same branch revision to the static asset binding after Access is configured',async()=>{
  let forwardedUrl=null;
  const request=new Request(`https://${TEST_HOST}/index.html`);
  const response=await worker.fetch(request,{
    NOMAD_WEB_MODE:'open',
    ASSETS:{fetch:async incoming=>{forwardedUrl=incoming.url;return new Response('asset');}},
  });

  assert.equal(response.status,200);
  assert.equal(await response.text(),'asset');
  assert.equal(forwardedUrl,request.url);
});
