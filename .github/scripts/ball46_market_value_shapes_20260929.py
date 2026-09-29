#!/usr/bin/env python3
import urllib.request,json,pathlib
BASE='https://www.ball46.com'
def fetch(p):
 req=urllib.request.Request(BASE+p+'?shape=20260929',headers={'User-Agent':'Ball46-Market-Shape/20260929','Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=40) as r:return json.loads(r.read().decode())
def rows(obj):
 if isinstance(obj,list): return obj
 if isinstance(obj,dict):
  for k in ['data','signals','rows','items','results','statistics']:
   v=obj.get(k)
   if isinstance(v,list): return v
 return []
def group(r):
 s=' '.join(str(r.get(k,'')) for k in ['market','marketLabel','providerMarket']).lower()
 if 'corner' in s:return 'CORNER'
 if 'card' in s:return 'CARDS'
 if '1x2' in s or r.get('providerMarket')=='1x2':return '1X2'
 if 'handicap' in s or ' ah' in ' '+s:return 'AH'
 if 'goal' in s or 'over' in s or 'under' in s:return 'GOALS_OU'
 return 'OTHER'
keys=['market','marketLabel','providerMarket','selection','line','odds','entryMinute','minute','mirrorMinute','entryScore','scoreAt','mirrorScore','finalScore','entryCorners','liveCorners','finalCorners','entryCards','liveCards','finalCards','status','result']
out=[]
for endpoint in ['/api/engine/signals','/api/engine/statistics']:
 data=rows(fetch(endpoint)); out.append('=== '+endpoint+' rows='+str(len(data))+' ===')
 seen={}
 for r in data:
  g=group(r)
  if g not in seen: seen[g]=r
 for g,r in seen.items():
  out.append('\n['+g+']')
  for k in keys:
   if k in r: out.append(k+'='+json.dumps(r.get(k),ensure_ascii=False,sort_keys=True))
 # report all distinct card object shapes found
 cardrows=[r for r in data if group(r)=='CARDS']
 out.append('\nCARD_ROWS='+str(len(cardrows)))
 for i,r in enumerate(cardrows[:8]):
  out.append('CARD_SAMPLE_'+str(i)+'='+json.dumps({k:r.get(k) for k in keys if k in r},ensure_ascii=False,sort_keys=True))
path=pathlib.Path('ball46-market-value-shapes-20260929.txt'); path.write_text('\n'.join(out),encoding='utf-8'); print('\n'.join(out[-40:]))
