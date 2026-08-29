#!/usr/bin/env python3
"""Isolated Forebet -> REVIEW staging engine for Soccer Predictions."""
from __future__ import annotations
import argparse, json, re, time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
import requests
from bs4 import BeautifulSoup

HOSTS={"forebet.com","www.forebet.com"}
UA="Mozilla/5.0 (compatible; NOMAD-SoccerPredictions/1.0; manual-review collector)"

def now(): return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00","Z")
def clamp(x,a=0,b=100): return max(a,min(b,float(x)))
def slug(s): return re.sub(r"[^a-z0-9]+","-",s.lower()).strip("-")
def validate(u):
    p=urlparse(u)
    if p.scheme!="https" or p.hostname not in HOSTS or "/football/matches/" not in p.path:
        raise ValueError(f"unsupported Forebet match URL: {u}")
def norm3(v):
    t=sum(max(0,float(x)) for x in v) or 1
    a=[round(100*max(0,float(x))/t,2) for x in v]
    a[2]=round(100-a[0]-a[1],2); return a
def pair(h,a,invert=False):
    if h is None or a is None: return None
    h,a=max(float(h),0),max(float(a),0)
    if invert: h,a=1/(h+.05),1/(a+.05)
    t=h+a
    hp=50 if t<=0 else round(100*h/t)
    return {"home":int(hp),"away":100-int(hp)}
def form_score(x):
    if not x: return None
    w,d,l=x.get("win",0),x.get("draw",0),x.get("loss",0); n=w+d+l
    return None if not n else 100*(3*w+d)/(3*n)
def text_of(s): return re.sub(r"\s+"," ",s.get_text(" ",strip=True)).strip()

def teams(soup):
    title=soup.title.get_text(" ",strip=True) if soup.title else ""
    m=re.search(r"^(.+?)\s+vs\s+(.+?)\s+Prediction",title,re.I)
    if not m: raise ValueError("teams not found in page title")
    return m.group(1).strip(),m.group(2).strip()

def parse_1x2(t,h,a):
    anchor=re.search(r"Home team Away team Prob\.\s*%\s*1\s*X\s*2\s*Pred\s*Correct score",t,re.I) or re.search(r"Prob\.\s*%\s*1\s*X\s*2\s*Pred",t,re.I)
    if not anchor:return None
    w=t[anchor.end():anchor.end()+1200]
    m=re.search(rf"{re.escape(h)}\s+{re.escape(a)}.*?(\d{{1,3}})\s+(\d{{1,3}})\s+(\d{{1,3}})\s+([12X])\s+([0-9]+-[0-9]+)",w,re.I)
    if not m:return None
    tail=w[m.end():m.end()+350]
    trip=re.findall(r"(?<![\d.])(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+\.\d{2})(?![\d.])",tail)
    odds=None
    if trip:
        x=trip[0]; odds={"home":float(x[0]),"draw":float(x[1]),"away":float(x[2])}
    return {"probability":{"home":float(m[1]),"draw":float(m[2]),"away":float(m[3])},"prediction":m[4].upper(),"correctScore":m[5],"odds1x2":odds}

def summaries(t,h,a):
    out={}
    for side,team in (("home",h),("away",a)):
        m=re.search(rf"{re.escape(team)}\s+Last 6 matches(.{{0,2000}}?)Win\s+(\d+)\s+\d+%\s+Draw\s+(\d+)\s+\d+%\s+Lost\s+(\d+)\s+\d+%",t,re.I)
        if m: out[side]={"win":int(m[2]),"draw":int(m[3]),"loss":int(m[4])}
    return out or None

def venue(t,h,a):
    out={}
    for side,pat in (("home",rf"{re.escape(h)}\s+home matches"),("away",rf"{re.escape(a)}\s+away matches")):
        m=re.search(pat+r"(.{0,1600}?)Win\s+(\d+)\s+\d+%\s+Draw\s+(\d+)\s+\d+%\s+Lost\s+(\d+)\s+\d+%",t,re.I)
        if m: out[side]={"win":int(m[2]),"draw":int(m[3]),"loss":int(m[4])}
    return out or None

def goals(t):
    m=re.search(r"Goals\s+Scored\s+\d+\s+Avg\.\s*per game\s+([\d.]+)\s+Conceded\s+\d+\s+Avg\.\s*per game\s+([\d.]+)\s+Scored\s+\d+\s+Avg\.\s*per game\s+([\d.]+)\s+Conceded\s+\d+\s+Avg\.\s*per game\s+([\d.]+)",t,re.I)
    return None if not m else {"home":{"gf":float(m[1]),"ga":float(m[2])},"away":{"gf":float(m[3]),"ga":float(m[4])}}
def shots(t):
    m=re.search(r"Shots\s+.+?Total shots\s+\d+\s+([\d.]+).*?(\d+)%OFF target\s+(\d+)%ON target.*?Total shots\s+\d+\s+([\d.]+).*?(\d+)%OFF target\s+(\d+)%ON target",t,re.I)
    return None if not m else {"home":{"shots":float(m[1]),"onTargetPct":float(m[3])},"away":{"shots":float(m[4]),"onTargetPct":float(m[6])}}
def possession(t):
    m=re.search(r"Passes.+?Ball Possession\s+(\d+)%.*?Ball Possession\s+(\d+)%",t,re.I)
    return None if not m else {"home":float(m[1]),"away":float(m[2])}
def h2h(t,h,a):
    s=t.find("Head to head"); e=t.find("Match Intro",s+1) if s>=0 else -1
    if s<0:return None
    z=t[s:e if e>s else s+9000]
    m=re.search(rf"{re.escape(h)}\s+(\d+)\s+\d+%\s+Draw\s+(\d+)\s+\d+%\s+{re.escape(a)}\s+(\d+)\s+\d+%",z,re.I)
    return None if not m else {"home":int(m[1]),"draw":int(m[2]),"away":int(m[3])}
def form_tokens(t,h,a):
    m=re.search(rf"{re.escape(h)}\s+VS\s+{re.escape(a)}(.{{0,800}}?)\b(\d{{2}}/\d{{2}}/\d{{4}})",t,re.I)
    if not m:return None
    tok=re.findall(r"\b[WDL]\b",m[1])
    if len(tok)>=12:return {"home":tok[:6],"away":tok[6:12]}
    return None

def derive(raw):
    src=(raw.get("forebet") or {}).get("probability")
    base=norm3([src.get("home",33.34),src.get("draw",33.33),src.get("away",33.33)]) if src else [33.34,33.33,33.33]
    ev=[]
    rf=raw.get("recentFormSummary") or {}; hs,as_=form_score(rf.get("home")),form_score(rf.get("away"))
    if hs is not None and as_ is not None: ev.append(("Recent Form",hs,as_,.20))
    vf=raw.get("homeAwaySummary") or {}; hs,as_=form_score(vf.get("home")),form_score(vf.get("away"))
    if hs is not None and as_ is not None: ev.append(("Home / Away Form",hs,as_,.15))
    g=raw.get("goals") or {}
    if g.get("home") and g.get("away"):
        q=pair(g["home"]["gf"],g["away"]["gf"]); ev.append(("Attack Strength",q["home"],q["away"],.15))
        q=pair(g["home"]["ga"],g["away"]["ga"],True); ev.append(("Defense Stability",q["home"],q["away"],.10))
    sh=raw.get("shots") or {}
    if sh.get("home") and sh.get("away"):
        q=pair(sh["home"]["shots"],sh["away"]["shots"]); ev.append(("Shot Volume",q["home"],q["away"],.10))
        hsot=sh["home"]["shots"]*sh["home"]["onTargetPct"]/100; asot=sh["away"]["shots"]*sh["away"]["onTargetPct"]/100
        q=pair(hsot,asot); ev.append(("Shots on Target",q["home"],q["away"],.10))
        if g.get("home") and g.get("away"):
            q=pair(g["home"]["gf"]/max(sh["home"]["shots"],.01),g["away"]["gf"]/max(sh["away"]["shots"],.01)); ev.append(("Conversion Rate",q["home"],q["away"],.05))
    hh=raw.get("h2h")
    if hh and sum(hh.values()):
        n=sum(hh.values()); ev.append(("H2H",100*hh["home"]/n,100*hh["away"]/n,.05))
    ev.append(("Source Probability",base[0],base[2],.10))
    w=sum(x[3] for x in ev); home_sig=sum(x[1]*x[3] for x in ev)/w; away_sig=sum(x[2]*x[3] for x in ev)/w
    close=1-min(abs(home_sig-away_sig)/100,1); draw=clamp(base[1]*.75+25*close*.25,8,40)
    ph,pd,pa=norm3([base[0]*.55+home_sig*.45,draw,base[2]*.55+away_sig*.45])
    probs={"home":ph,"draw":pd,"away":pa}; side=max(probs,key=probs.get)
    preferred=["Attack Strength","Shot Volume","Shots on Target","Recent Form","Home / Away Form","Defense Stability","Conversion Rate"]
    metric={name:{"label":name,"home":round(h),"away":round(a)} for name,h,a,_ in ev if name!="Source Probability"}
    stats={"home":{},"away":{}}
    if g.get("home") and g.get("away"):
        for s in ("home","away"): stats[s].update({"gf":g[s]["gf"],"ga":g[s]["ga"]})
    if sh.get("home") and sh.get("away"):
        stats["home"]["sot"]=round(sh["home"]["shots"]*sh["home"]["onTargetPct"]/100,1); stats["away"]["sot"]=round(sh["away"]["shots"]*sh["away"]["onTargetPct"]/100,1)
    ps=raw.get("possession") or {}
    if ps:
        stats["home"]["pos"]=f"{ps['home']:.0f}%"; stats["away"]["pos"]=f"{ps['away']:.0f}%"
    blocks={"probability":bool(src),"recentForm":bool(rf),"homeAwayForm":bool(vf),"goals":bool(g),"shots":bool(sh),"h2h":bool(hh),"possession":bool(ps)}
    return {"probability":probs,"side":side,"confidence":round(probs[side],2),"metrics":[metric[x] for x in preferred if x in metric],"stats":stats,"quality":{"status":"complete" if sum(blocks.values())>=6 else "partial","missing":[k for k,v in blocks.items() if not v]}}

def parse(html,url,hints):
    soup=BeautifulSoup(html,"html.parser"); t=text_of(soup); h,a=teams(soup)
    raw={"forebet":parse_1x2(t,h,a),"recentForm":form_tokens(t,h,a),"recentFormSummary":summaries(t,h,a),"homeAwaySummary":venue(t,h,a),"goals":goals(t),"shots":shots(t),"possession":possession(t),"h2h":h2h(t,h,a)}
    d=derive(raw); side=d["side"]; pick=f"{h} Win" if side=="home" else f"{a} Win" if side=="away" else "Draw"
    oddsmap=(raw.get("forebet") or {}).get("odds1x2") or {}; odd=oddsmap.get(side,hints.get("odds"))
    league=hints.get("league")
    if not league:
        m=re.search(r"\b\d+(?:st|nd|rd|th)\s+place\s+(.+?)\s+\d+(?:st|nd|rd|th)\s+place\b",t,re.I); league=m[1].strip() if m else "Other"
    kickoff=hints.get("kickoff")
    if not kickoff:
        m=re.search(r"\b\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}\s+GMT\b",t); kickoff=m[0] if m else "—"
    return {"id":hints.get("id") or slug(h+"-"+a),"league":league,"kickoff":kickoff,"kickoffAt":hints.get("kickoffAt"),"home":h,"away":a,"homeLogo":hints.get("homeLogo"),"awayLogo":hints.get("awayLogo"),"pick":pick,"odds":odd,"confidence":d["confidence"],"abc":"REVIEW","featured":False,"nomadPick":False,"reviewStatus":"review","metricsStatus":"source","source":url,"sourceMeta":{"provider":"Forebet","url":url,"fetchedAt":now(),"policy":"facts-only; editorial text is not copied"},"sourceFacts":raw,"analysisData":{"probability":d["probability"],"metrics":d["metrics"],"form":raw.get("recentForm") or {},"h2h":raw.get("h2h") or {},"stats":d["stats"],"dataQuality":d["quality"]},"analysis":None,"engine":{"name":"nomad-forebet-semi-auto","version":1,"suggestedSide":side,"humanApprovalRequired":True}}

def loadq(path):
    x=json.loads(path.read_text(encoding="utf-8")); rows=x.get("matches") if isinstance(x,dict) else x
    if not isinstance(rows,list): raise ValueError("queue must be an array or object with matches")
    out=[]
    for r in rows:
        r={"url":r} if isinstance(r,str) else r
        if not isinstance(r,dict) or not r.get("url"): raise ValueError("queue item missing url")
        validate(str(r["url"])); out.append(r)
    return out

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--queue",required=True,type=Path); ap.add_argument("--output",required=True,type=Path); ap.add_argument("--delay",type=float,default=4); ap.add_argument("--timeout",type=int,default=20); a=ap.parse_args()
    staged=[]; errors=[]; q=loadq(a.queue)
    for i,item in enumerate(q):
        u=str(item["url"])
        try:
            r=requests.get(u,timeout=a.timeout,headers={"User-Agent":UA,"Accept-Language":"en-US,en;q=0.9"}); r.raise_for_status(); staged.append(parse(r.text,u,item))
        except Exception as e: errors.append({"url":u,"error":str(e)})
        if i<len(q)-1: time.sleep(max(2,a.delay))
    payload={"generatedAt":now(),"mode":"semi-auto-staging","provider":"Forebet","liveScore":False,"humanApprovalRequired":True,"matches":staged,"errors":errors}
    a.output.parent.mkdir(parents=True,exist_ok=True); a.output.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"staged={len(staged)} errors={len(errors)} output={a.output}"); return 0 if not errors else 2
if __name__=="__main__": raise SystemExit(main())
