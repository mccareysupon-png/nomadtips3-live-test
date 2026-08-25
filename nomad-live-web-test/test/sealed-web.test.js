import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import worker from '../src/index.js';

const project=dirname(fileURLToPath(new URL('../wrangler.jsonc',import.meta.url)));
const frontend=join(project,'../nomad-live');
const engineProject=join(project,'../nomad-live-engine');
const config=JSON.parse(readFileSync(join(project,'wrangler.jsonc'),'utf8'));
const runtimeSource=readFileSync(join(frontend,'runtime-config.js'),'utf8');
const engineWrangler=readFileSync(join(engineProject,'wrangler.toml'),'utf8');
const TEST_HOST='nomadtips3-live-web-test.mccarey-supon.workers.dev';
const TEST_ENGINE_HOST='nomadtips3-live-engine-test.mccarey-supon.workers.dev';
const PRODUCTION_ENGINE='https://nomadtips3-live-engine.mccarey-supon.workers.dev';
const API_ROUTES=new Map([
  ['/api/feed','/feed'],
  ['/api/statistics','/statistics'],
  ['/api/config','/config'],
  ['/api/health','/health'],
]);

const frontendFiles=(directory=frontend)=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
  const path=join(directory,entry.name);
  return entry.isDirectory()?frontendFiles(path):entry.isFile()?[path]:[];
});

function configuredRuntime(hostname){
  const document={documentElement:{dataset:{}}};
  const window={location:{hostname}};
  vm.runInNewContext(runtimeSource,{window,document});
  return {runtime:window.NOMAD_RUNTIME,dataset:document.documentElement.dataset};
}

function testEnvironmentConfig(){
  const marker='[env.test]';
  const start=engineWrangler.indexOf(marker);
  assert.notEqual(start,-1,'TEST Engine environment must exist');
  const remainder=engineWrangler.slice(start+marker.length);
  const nextSection=remainder.search(/\n\[/);
  return nextSection===-1?remainder:remainder.slice(0,nextSection);
}

test('wrangler config publishes the dedicated TEST Web with one exact TEST Engine service binding',()=>{
  assert.equal(config.name,'nomadtips3-live-web-test');
  assert.equal(config.workers_dev,true);
  assert.equal(config.preview_urls,false);
  assert.equal(config.assets.directory,'../nomad-live');
  assert.equal(config.assets.binding,'ASSETS');
  assert.equal(config.assets.run_worker_first,true);
  assert.deepEqual(config.services,[{binding:'TEST_ENGINE',service:'nomadtips3-live-engine-test'}]);
  assert.equal(config.vars.NOMAD_WEB_MODE,'sealed');
  assert.equal('routes' in config,false);
  assert.equal('route' in config,false);
  assert.equal('durable_objects' in config,false);
});

test('the configured static asset directory contains every required 3.41 TEST page',()=>{
  for(const page of ['index.html','statistics.html','settings.html','health.html','runtime-config.js']){
    assert.equal(existsSync(join(frontend,page)),true,page+' must come from nomad-live/');
  }
});

test('TEST browser runtime uses same-origin /api while Production routing stays unchanged',()=>{
  const testRuntime=configuredRuntime(TEST_HOST);
  const production=configuredRuntime('www.nomadtips3.com');
  const browserFeed=new URL(testRuntime.runtime.engineBase+'/feed','https://'+TEST_HOST+'/');

  assert.equal(testRuntime.runtime.environment,'test');
  assert.equal(testRuntime.runtime.production,false);
  assert.equal(testRuntime.runtime.host,TEST_HOST);
  assert.equal(testRuntime.runtime.engineBase,'/api');
  assert.equal(browserFeed.origin,'https://'+TEST_HOST);
  assert.equal(browserFeed.pathname,'/api/feed');
  assert.equal(testRuntime.dataset.nomadEnvironment,'test');
  assert.equal(production.runtime.environment,'production');
  assert.equal(production.runtime.production,true);
  assert.equal(production.runtime.engineBase,PRODUCTION_ENGINE);
});

test('browser assets never contain the public TEST Engine hostname',()=>{
  const violations=frontendFiles()
    .filter(path=>readFileSync(path,'utf8').includes(TEST_ENGINE_HOST))
    .map(path=>relative(frontend,path));

  assert.deepEqual(violations,[]);
});

test('Production Engine hostname is centralized in runtime-config.js only',()=>{
  const productionHost=new URL(PRODUCTION_ENGINE).hostname;
  const violations=frontendFiles()
    .filter(path=>relative(frontend,path)!=='runtime-config.js')
    .filter(path=>readFileSync(path,'utf8').includes(productionHost))
    .map(path=>relative(frontend,path));

  assert.deepEqual(violations,[]);
});

test('TEST Engine has no public workers.dev or preview ingress while Production routing is unchanged',()=>{
  const rootConfig=engineWrangler.slice(0,engineWrangler.indexOf('[env.test]'));
  const testConfig=testEnvironmentConfig();

  assert.match(rootConfig,/^name = "nomadtips3-live-engine"$/m);
  assert.match(rootConfig,/^workers_dev = true$/m);
  assert.match(testConfig,/^name = "nomadtips3-live-engine-test"$/m);
  assert.match(testConfig,/^workers_dev = false$/m);
  assert.match(testConfig,/^preview_urls = false$/m);
});

test('SEALED mode blocks static assets and every /api route before bindings or network can run',async()=>{
  let assetCalls=0;
  let bindingCalls=0;
  let networkCalls=0;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>{networkCalls++;throw new Error('SEALED mode attempted a network request');};

  try{
    const paths=[
      '/','/index.html','/statistics.html','/settings.html','/health.html','/runtime-config.js',
      '/api','/api/feed','/api/statistics','/api/config','/api/health','/api/unknown',
    ];
    for(const path of paths){
      const response=await worker.fetch(new Request('https://'+TEST_HOST+path),{
        NOMAD_WEB_MODE:'sealed',
        ASSETS:{fetch:async()=>{assetCalls++;return new Response('unexpected asset');}},
        TEST_ENGINE:{fetch:async()=>{bindingCalls++;return new Response('unexpected engine');}},
      });
      const body=await response.text();
      assert.equal(response.status,403);
      assert.equal(response.headers.get('x-nomad-web-mode'),'SEALED');
      assert.match(body,/NOMAD_TEST_WEB_SEALED/);
      assert.doesNotMatch(body,/<script\b|nomadtips3-live-engine|\/api|\/feed|\/health|\/config/i);
    }
  }finally{
    globalThis.fetch=originalFetch;
  }

  assert.equal(assetCalls,0);
  assert.equal(bindingCalls,0);
  assert.equal(networkCalls,0);
});

test('missing or unexpected mode fails closed',async()=>{
  let assetCalls=0;
  let bindingCalls=0;
  const response=await worker.fetch(new Request('https://'+TEST_HOST+'/api/feed'),{
    ASSETS:{fetch:async()=>{assetCalls++;return new Response('unexpected asset');}},
    TEST_ENGINE:{fetch:async()=>{bindingCalls++;return new Response('unexpected engine');}},
  });

  assert.equal(response.status,403);
  assert.equal(assetCalls,0);
  assert.equal(bindingCalls,0);
});

test('open mode maps only approved same-origin /api routes through TEST_ENGINE',async()=>{
  const calls=[];
  let assetCalls=0;
  const env={
    NOMAD_WEB_MODE:'open',
    ASSETS:{fetch:async()=>{assetCalls++;return new Response('unexpected asset');}},
    TEST_ENGINE:{fetch:async incoming=>{
      const body=['GET','HEAD'].includes(incoming.method)?null:await incoming.text();
      calls.push({
        url:incoming.url,
        method:incoming.method,
        settingsKey:incoming.headers.get('x-settings-key'),
        body,
      });
      return new Response(JSON.stringify({ok:true}),{
        status:200,
        headers:{'content-type':'application/json'},
      });
    }},
  };

  for(const [browserPath,enginePath] of API_ROUTES){
    const response=await worker.fetch(
      new Request('https://'+TEST_HOST+browserPath+'?source=web'),
      env,
    );
    assert.equal(response.status,200);
    const call=calls.at(-1);
    const downstream=new URL(call.url);
    assert.equal(downstream.origin,'https://nomadtips3-live-engine-test.internal');
    assert.equal(downstream.pathname,enginePath);
    assert.equal(downstream.search,'?source=web');
    assert.equal(call.method,'GET');
  }

  const postResponse=await worker.fetch(new Request('https://'+TEST_HOST+'/api/config',{
    method:'POST',
    headers:{'content-type':'application/json','x-settings-key':'owner-test-key'},
    body:'{"config":{"minuteFrom":72}}',
  }),env);
  assert.equal(postResponse.status,200);
  assert.equal(calls.at(-1).method,'POST');
  assert.equal(calls.at(-1).settingsKey,'owner-test-key');
  assert.equal(calls.at(-1).body,'{"config":{"minuteFrom":72}}');
  assert.equal(assetCalls,0);
});

test('open mode fails closed for unknown /api routes or a missing TEST_ENGINE binding',async()=>{
  let assetCalls=0;
  let bindingCalls=0;
  const env={
    NOMAD_WEB_MODE:'open',
    ASSETS:{fetch:async()=>{assetCalls++;return new Response('unexpected asset');}},
    TEST_ENGINE:{fetch:async()=>{bindingCalls++;return new Response('unexpected engine');}},
  };

  for(const path of ['/api','/api/feed/','/api/unknown']){
    const response=await worker.fetch(new Request('https://'+TEST_HOST+path),env);
    assert.equal(response.status,404);
  }
  const unavailable=await worker.fetch(new Request('https://'+TEST_HOST+'/api/feed'),{
    NOMAD_WEB_MODE:'open',
    ASSETS:env.ASSETS,
  });
  assert.equal(unavailable.status,503);
  assert.equal(assetCalls,0);
  assert.equal(bindingCalls,0);
});

test('open mode forwards non-API requests to the static asset binding',async()=>{
  let forwardedUrl=null;
  let bindingCalls=0;
  const request=new Request('https://'+TEST_HOST+'/index.html');
  const response=await worker.fetch(request,{
    NOMAD_WEB_MODE:'open',
    ASSETS:{fetch:async incoming=>{forwardedUrl=incoming.url;return new Response('asset');}},
    TEST_ENGINE:{fetch:async()=>{bindingCalls++;return new Response('unexpected engine');}},
  });

  assert.equal(response.status,200);
  assert.equal(await response.text(),'asset');
  assert.equal(forwardedUrl,request.url);
  assert.equal(bindingCalls,0);
});
