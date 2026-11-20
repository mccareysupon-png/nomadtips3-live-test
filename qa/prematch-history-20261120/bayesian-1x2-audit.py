# Offline experiment only. No API, no write to any Worker, no issue of picks.
import json, pathlib, math, collections, heapq
from datetime import datetime
def read(p): return json.loads(p.read_text())
def load_raw(folder, pattern):
    for p in pathlib.Path(folder).glob(pattern):
        j=read(p)
        for f in (j if isinstance(j,list) else j.get('body',j).get('data',[])): yield f
def raw(f):
    return dict(id=int(f['id']),league=int(f['league']['id']),home=int(f['teams']['home']['id']),away=int(f['teams']['away']['id']),kickoff=int(f['kickoff_ts']),hg=int(f['goals']['home']),ag=int(f['goals']['away']))
archive=read(pathlib.Path('merged/archive-merge.json'))['source']['rows']
rows={int(r['fixture_id']):dict(id=int(r['fixture_id']),league=int(r['league_id']),home=int(r['home_id']),away=int(r['away_id']),kickoff=int(r['kickoff']),hg=int(r['hg']),ag=int(r['ag'])) for r in archive}
for folder,pattern in [('daily','page-*.json'),('history','history-*.json')]:
    for f in load_raw(folder,pattern):
        if f.get('status')=='finished' and f.get('status_code')=='full':
            r=raw(f);rows[r['id']]=r
assert len(rows)==585, len(rows)
old=read(pathlib.Path('history/bot-result.json'))
oldrows={str(r['fixtureId']):r for r in old['rows']}
upcoming={}
for f in load_raw('scheduled','scheduled-*.json'):
    if str(f['id']) in oldrows:
        upcoming[str(f['id'])]=dict(id=int(f['id']),league=int(f['league']['id']),home=int(f['teams']['home']['id']),away=int(f['teams']['away']['id']),kickoff=int(f['kickoff_ts']),homeName=f['teams']['home']['name'],awayName=f['teams']['away']['name'])
assert len(upcoming)==len(oldrows)==548
def outcome(r): return 0 if r['hg']>r['ag'] else 1 if r['hg']==r['ag'] else 2
def plus(a,b):return [x+y for x,y in zip(a,b)]
def prob(c):return [x/sum(c) for x in c]
def counts(a):
    c=[0,0,0]
    for x in a:c[x]+=1
    return c
def prior(g,l):
    # symmetric Dirichlet regularization of empirical match outcome proportions
    global_p=prob([x+1 for x in g])
    return prob([x+20*p for x,p in zip(l,global_p)])
def posterior(c,p,k=6):
    return prob([x+k*y for x,y in zip(c,p)])
def avg(a,b):return [(x+y)/2 for x,y in zip(a,b)]
class Model:
    def __init__(self):
        self.g=[0]*3;self.l=collections.defaultdict(lambda:[0]*3);self.h=collections.defaultdict(list);self.a=collections.defaultdict(list);self.t=collections.defaultdict(list)
    def add(self,r):
        o=outcome(r);self.g[o]+=1;self.l[r['league']][o]+=1
        self.h[r['home']].append((r['kickoff'],o));self.a[r['away']].append((r['kickoff'],o))
        self.t[r['home']].append((r['kickoff'],o));self.t[r['away']].append((r['kickoff'],2-o))
    def get(self,r):
        p=prior(self.g,self.l[r['league']]);h=r['home'];a=r['away']
        hc=counts([o for _,o in sorted(self.h[h])[-10:]]);ac=counts([o for _,o in sorted(self.a[a])[-10:]])
        ph=posterior(hc,p);pa=posterior(ac,p);m=avg(ph,pa)
        ht=[o for _,o in sorted(self.t[h])[-10:]];at=[o for _,o in sorted(self.t[a])[-10:]]
        rawp=avg(prob(counts(ht)),prob(counts([2-o for o in at]))) if ht and at else None
        return p,m,rawp,(len(ht),len(at)),(sum(hc),sum(ac)),sum(self.l[r['league']])
def loss(p,o):return (sum((x-int(i==o))**2 for i,x in enumerate(p)),-math.log(max(1e-12,p[o])))
def metrics(a):
    return dict(n=len(a),brier=round(sum(x[0] for x in a)/len(a),6),logloss=round(sum(x[1] for x in a)/len(a),6)) if a else dict(n=0)
# Results are admitted at least four hours after kickoff to avoid using a concurrent game's score.
m=Model();ordered=sorted(rows.values(),key=lambda r:(r['kickoff'],r['id']));i=0;allp=[];allb=[];eligiblep=[];eligibleb=[];eligibler=[];venuep=[];venueb=[]
for r in ordered:
    while i<len(ordered) and ordered[i]['kickoff']<=r['kickoff']-14400:m.add(ordered[i]);i+=1
    if sum(m.g)<20:continue
    p,b,rr,n,v,l=m.get(r);o=outcome(r);allp.append(loss(p,o));allb.append(loss(b,o))
    if min(n)>=3:eligiblep.append(loss(p,o));eligibleb.append(loss(b,o));eligibler.append(loss(rr,o))
    if min(v)>=1:venuep.append(loss(p,o));venueb.append(loss(b,o))
backtest={'all':{'prior':metrics(allp),'bayes':metrics(allb)},'same_min3':{'prior':metrics(eligiblep),'bayes':metrics(eligibleb),'old_raw':metrics(eligibler)},'both_venue_history':{'prior':metrics(venuep),'bayes':metrics(venueb)}}
# Current rows already evaluated by the test Bot are the only candidate list.
m=Model()
for r in ordered:m.add(r)
categories=collections.Counter();threshold=0;oldthreshold=0;withvenue=0;modelrows=[];league_coverage=collections.Counter()
for k,r in upcoming.items():
    p,b,rr,n,v,l=m.get(r)
    categories['both_history_min3' if min(n)>=3 else 'both_history_min1' if min(n)>=1 else 'one_or_no_history']+=1
    league_coverage['league_data' if l else 'global_only']+=1
    if min(v)>=1:withvenue+=1
    # model estimates may be displayed with source and sample size; never issue signal.
    if min(n)>=1 and min(v)>=1 and (b[0]>=.50 or b[1]>=.33 or b[2]>=.50):threshold+=1
    if min(n)>=3 and rr and (rr[0]>=.50 or rr[1]>=.33 or rr[2]>=.50):oldthreshold+=1
    if min(n)>=1: modelrows.append({'id':k,'home':r['homeName'],'away':r['awayName'],'overallHistory':n,'venueHistory':v,'leagueSample':l,'prior':p,'bayesian':b,'old':rr})
report={'archive':len(rows),'upcoming':len(upcoming),'priorGlobal':prob([x+1 for x in m.g]),'coverage':dict(categories),'leagueCoverage':dict(league_coverage),'bothVenueHistory':withvenue,'bayesianThresholdBothVenue':threshold,'oldThresholdMin3':oldthreshold,'backtest':backtest,'status':'EXPLORATORY_NOT_CALIBRATED','providerCalls':0,'published':0,'samples':sorted(modelrows,key=lambda r:(-min(r['venueHistory']),r['id']))[:12]}
pathlib.Path('evidence').mkdir(exist_ok=True);pathlib.Path('evidence/bayesian-1x2-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print('BAYESIAN_AUDIT '+json.dumps(report,ensure_ascii=False))
