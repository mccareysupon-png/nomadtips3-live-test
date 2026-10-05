import os, json, base64, urllib.request, urllib.error, pathlib, subprocess, time, hashlib

ACCOUNT=os.environ['CF_ACCOUNT']; TOKEN=os.environ['CF_TOKEN']; SCRIPT='ball46-production'
API=f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}'
AUTH={'Authorization':f'Bearer {TOKEN}','Accept':'application/json'}
AFF='https://record.betsson.com/_o1mNd-AGmETmaNxVyOS5PWNd7ZgqdRLk/1/'
LOGO='https://raw.githubusercontent.com/mccareysupon-png/nomadtips3-live-test/ops/ball46-betsson-affiliate-20261005/assets/affiliate/betsson-logo.png'
ROOT=pathlib.Path('/tmp/b46-betsson-deploy'); ROOT.mkdir(exist_ok=True)

def getj(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers=AUTH),timeout=30) as r: j=json.load(r)
    if isinstance(j,dict) and j.get('success') is False: raise RuntimeError('CF_API_FAIL '+json.dumps(j)[:1000])
    return j

def fetch(url):
    req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'Ball46-Deploy-Guard'})
    with urllib.request.urlopen(req,timeout=35) as r: return r.status,dict(r.headers),r.read()

def rollback(version):
    print('ROLLBACK_TO',version)
    env=os.environ.copy(); env['CLOUDFLARE_ACCOUNT_ID']=ACCOUNT; env['CLOUDFLARE_API_TOKEN']=TOKEN
    subprocess.run(['npx','--yes','wrangler@4.92.0','versions','deploy',f'{version}@100%','--name',SCRIPT,'-y','--message','Auto rollback Betsson affiliate'],env=env,check=False)

d=getj(f'{API}/workers/scripts/{SCRIPT}/deployments')['result']['deployments'][0]
active=[v for v in (d.get('versions') or []) if float(v.get('percentage',0))>=99.999]
if len(active)!=1: raise SystemExit('ACTIVE_VERSION_AMBIGUOUS '+repr(active))
pre=str(active[0]['version_id'])
v=getj(f'{API}/workers/workers/{SCRIPT}/versions/{pre}?include=modules')['result']
mods=v.get('modules') or []
main=[m for m in mods if m.get('name')=='index.js' and m.get('content_base64')]
if len(main)!=1: raise SystemExit('INDEX_MODULE_MISSING '+repr([m.get('name') for m in mods]))
src=base64.b64decode(main[0]['content_base64']).decode()
if 'export default' not in src: raise SystemExit('DEFAULT_EXPORT_MISSING')
bindings=v.get('bindings') or []; names={b.get('name'):b for b in bindings}
expected={'ASSETS':('assets',None),'ENGINE':('service','nomadtips3-engine-343'),'FULL_MARKET':('service','nomadtips3-full-market-343-ball46'),'HUB':('service','nomadtips3-5usd-hub-343')}
for n,(typ,svc) in expected.items():
    b=names.get(n) or {}
    if b.get('type')!=typ or (svc and b.get('service')!=svc): raise SystemExit('BINDING_MOVED '+n+' '+repr(b))
if v.get('compatibility_date')!='2026-09-09' or (v.get('compatibility_flags') or []): raise SystemExit('COMPAT_MOVED')
asset_cfg=(v.get('assets') or {}).get('config') or {}; want={'base_path':'/','html_handling':'none','not_found_handling':'none','run_worker_first':True}
if {k:asset_cfg.get(k) for k in want}!=want: raise SystemExit('ASSET_CONFIG_MOVED '+repr(asset_cfg))
status,headers,live=fetch('https://ball46-production.mccarey-supon.workers.dev/full-market-bookmaker-343.js?betsson-pre='+str(time.time_ns()))
text=live.decode()
for marker in ('AFFILIATE_URLS','BOOK_LOGO_URLS',"['1xbet','1xBet']"):
    if marker not in text: raise SystemExit('LIVE_RENDERER_MARKER_MISSING '+marker)
if "['betsson','Betsson']" in text or 'B46_BETSSON_AFFILIATE_20261005' in text:
    print('ALREADY_PRESENT_NO_DEPLOY'); raise SystemExit(0)
print('CURRENT_LOCK_OK',pre,'runtime_sha',hashlib.sha256(src.encode()).hexdigest(),'live_js_sha',hashlib.sha256(live).hexdigest())

wrapper="""import original from './original.js';
export * from './original.js';
const AFF=%s;
const LOGO=%s;
function addMap(s,name,value){const re=new RegExp('(const '+name+'=Object\\.freeze\\(\\{)([\\s\\S]*?)(\\}\\);)');const m=s.match(re);if(!m)throw new Error(name+'_MAP_MISSING');if(m[2].includes("'betsson'"))return s;let body=m[2];if(body.trim()&&!body.trim().endsWith(','))body+=',';body+="\\n  'betsson':"+JSON.stringify(value)+"\\n";return s.replace(re,m[1]+body+m[3])}
function patch(s){if(s.includes('B46_BETSSON_AFFILIATE_20261005'))return s;s=addMap(s,'AFFILIATE_URLS',AFF);s=addMap(s,'BOOK_LOGO_URLS',LOGO);if(!s.includes("['betsson','Betsson']")){const n="['1xbet','1xBet']";if(!s.includes(n))throw new Error('BOOK_REGISTRY_ANCHOR_MISSING');s=s.replace(n,n+",['betsson','Betsson']")}return '/* B46_BETSSON_AFFILIATE_20261005 */\\n'+s}
const wrapped={...original};
wrapped.fetch=async function(request,env,ctx){const u=new URL(request.url);if(u.pathname==='/full-market-bookmaker-343.js'){const res=await env.ASSETS.fetch(request);if(!res.ok)return res;const out=patch(await res.text());const h=new Headers(res.headers);h.set('cache-control','no-store, no-cache, must-revalidate');h.set('content-type','application/javascript; charset=utf-8');return new Response(out,{status:res.status,headers:h})}return original.fetch(request,env,ctx)};
export default wrapped;
"""%(json.dumps(AFF),json.dumps(LOGO))
(ROOT/'index.js').write_text(wrapper); (ROOT/'original.js').write_text(src)
meta={'main_module':'index.js','keep_assets':True,'compatibility_date':v.get('compatibility_date'),'bindings':bindings}
for k in ('observability','placement','limits','tail_consumers','logpush'):
    if v.get(k) is not None: meta[k]=v[k]
(ROOT/'metadata.json').write_text(json.dumps(meta,separators=(',',':')))

env=os.environ.copy(); env['CLOUDFLARE_ACCOUNT_ID']=ACCOUNT; env['CLOUDFLARE_API_TOKEN']=TOKEN
deployed=False
try:
    cmd=['curl','-fsS','-X','PUT',f'{API}/workers/scripts/{SCRIPT}','-H',f'Authorization: Bearer {TOKEN}','-F',f'metadata=@{ROOT}/metadata.json;type=application/json','-F',f'index.js=@{ROOT}/index.js;type=application/javascript+module','-F',f'original.js=@{ROOT}/original.js;type=application/javascript+module']
    raw=subprocess.check_output(cmd,env=env); result=json.loads(raw)
    if result.get('success') is not True: raise RuntimeError('UPLOAD_FAIL '+json.dumps(result)[:1000])
    deployed=True; print('UPLOAD_OK')
    time.sleep(5)
    _,_,body=fetch('https://ball46-production.mccarey-supon.workers.dev/full-market-bookmaker-343.js?betsson-post='+str(time.time_ns())); s=body.decode()
    for marker in ('B46_BETSSON_AFFILIATE_20261005',AFF,LOGO,"['betsson','Betsson']"):
        if marker not in s: raise RuntimeError('POST_MARKER_MISSING '+marker)
    _,_,logo=fetch(LOGO)
    if not logo.startswith(b'\x89PNG\r\n\x1a\n'): raise RuntimeError('LOGO_NOT_PNG')
    for ep in ('board','signals','statistics'):
        _,_,b=fetch(f'https://www.ball46.com/api/engine/{ep}?betsson-health={time.time_ns()}'); j=json.loads(b)
        if j.get('ok') is not True: raise RuntimeError(ep+'_NOT_OK '+str(j)[:400])
    nd=getj(f'{API}/workers/scripts/{SCRIPT}/deployments')['result']['deployments'][0]; av=[x for x in (nd.get('versions') or []) if float(x.get('percentage',0))>=99.999]
    if len(av)!=1: raise RuntimeError('POST_ACTIVE_AMBIGUOUS')
    nv=str(av[0]['version_id']); nvdata=getj(f'{API}/workers/workers/{SCRIPT}/versions/{nv}?include=modules')['result']; nac=(nvdata.get('assets') or {}).get('config') or {}
    if {k:nac.get(k) for k in want}!=want: raise RuntimeError('POST_ASSET_CONFIG_MOVED '+repr(nac))
    print('BETSSON_PRODUCTION_VERIFY_PASS',nv)
except Exception:
    if deployed: rollback(pre)
    raise
