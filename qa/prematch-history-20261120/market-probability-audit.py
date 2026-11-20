# Offline probability estimation. Uses existing provider observations only.
# Market-derived probabilities are not independent evidence of an edge.
import json,pathlib,collections,math
def load(p):return json.loads(p.read_text())
def rawrows(folder,pattern):
 for p in pathlib.Path(folder).glob(pattern):
  j=load(p);yield from (j if isinstance(j,list) else j.get('body',j).get('data',[]))
def normalize(f):
 return dict(id=int(f['id']),league=int(f['league']['id']),home=int(f['teams']['home']['id']),away=int(f['teams']['away']['id']),kickoff=int(f['kickoff_ts']),hg=int(f['goals']['home']),ag=int(f['goals']['away']))
archive=load(pathlib.Path('merged/archive-merge.json'))['source']['rows']
hist={int(r['fixture_id']):dict(id=int(r['fixture_id']),league=int(r['league_id']),home=int(r['home_id']),away=int(r['away_id']),kickoff=int(r['kickoff']),hg=int(r['hg']),ag=int(r['ag'])) for r in archive}
for folder,pattern in [('daily','page-*.json'),('history','history-*.json')]:
 for f in rawrows(folder,pattern):
  if f.get('status')=='finished' and f.get('status_code')=='full':
   r=normalize(f);hist[r['id']]=r
assert len(hist)==585
bot=load(pathlib.Path('history/bot-result.json'))
ids={str(r['fixtureId']) for r in bot['rows']}
assert len(ids)==548
team=collections.defaultdict(list)
for r in hist.values():
 team[r['home']].append((r['kickoff'],r['hg'],r['ag']))
 team[r['away']].append((r['kickoff'],r['ag'],r['hg']))
def last(id,k):return sorted((r for r in team[id] if r[0]<k),reverse=True)[:10]
def counts(rs,reverse=False):
 c=[0,0,0]
 for _,gf,ga in rs:
  o=0 if gf>ga else 1 if gf==ga else 2;c[2-o if reverse else o]+=1
 return c
def prices(f):
 o=f.get('odds',{}).get('1x2',{})
 for name in ['closing','opening']:
  b=o.get(name)
  if isinstance(b,dict):
   p=[b.get(k) for k in ['home','draw','away']]
   if all(isinstance(v,(float,int)) and math.isfinite(v) and v>1 for v in p):return p,name
 return None,None
keys=['HOME_WIN','DRAW','AWAY_WIN'];limits=[.50,.33,.50];ranges=[(1.6,3.5),(2.9,4.2),(1.6,3.5)]
rows=[];seen=set();metadata=collections.Counter()
for f in rawrows('scheduled','scheduled-*.json'):
 fid=str(f['id'])
 if fid not in ids or fid in seen:continue
 seen.add(fid);p,phase=prices(f)
 if not p:continue
 for k in f.get('odds',{}).get('1x2',{}):metadata[k]+=1
 h=last(int(f['teams']['home']['id']),f['kickoff_ts']);a=last(int(f['teams']['away']['id']),f['kickoff_ts'])
 n=len(h)+len(a);q=[1/x for x in p];q=[x/sum(q) for x in q]
 c=[x+y for x,y in zip(counts(h),counts(a,True))]
 # Prior equivalent to six observed results, fixed exploratory setting.
 # A single historical observation cannot establish a reliable independent edge.
 model=[(6*q[i]+c[i])/(6+n) for i in range(3)]
 sides=[]
 for i,k in enumerate(keys):
  e=model[i]-q[i];ev=model[i]*p[i]-1
  sides.append(dict(side=k,price=p[i],market=q[i],estimate=model[i],edge=e,ev=ev,probability=model[i]>=limits[i],screen=model[i]>=limits[i] and ranges[i][0]<=p[i]<=ranges[i][1] and e>=.01 and ev>=.01))
 tier='market_only' if n==0 else 'sparse' if min(len(h),len(a))<3 else 'both_min3'
 rows.append(dict(id=fid,home=f['teams']['home']['name'],away=f['teams']['away']['name'],history=[len(h),len(a)],tier=tier,phase=phase,sides=sides))
assert len(rows)==548,len(rows)
coverage={}
for tier in ['market_only','sparse','both_min3']:
 r=[x for x in rows if x['tier']==tier]
 coverage[tier]={'estimated':len(r),'probability_threshold':sum(any(y['probability'] for y in x['sides']) for x in r),'exploratory_price_edge_ev_screen':sum(any(y['screen'] for y in x['sides']) for x in r)}
report={'total':len(rows),'coverage':coverage,'market_threshold':sum(any(y['market']>=limits[i] for i,y in enumerate(x['sides'])) for x in rows),'estimate_threshold':sum(any(y['probability'] for y in x['sides']) for x in rows),'exploratory_screen':sum(any(y['screen'] for y in x['sides']) for x in rows),'odds_fields':dict(metadata),'prior_weight':6,'provider_calls':0,'published':0,'status':'OFFLINE_EXPLORATORY_UNCALIBRATED'}
pathlib.Path('evidence').mkdir(exist_ok=True)
pathlib.Path('evidence/market-probability.json').write_text(json.dumps({'report':report,'rows':rows},ensure_ascii=False,indent=2))
print('MARKET_PROBABILITY_AUDIT '+json.dumps(report,ensure_ascii=False))
