#!/usr/bin/env python3
import argparse, hashlib, json, math, re, time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[2]
FEED_PATH = ROOT / "the-king-feed.json"
STATE_PATH = ROOT / "the-king-state.json"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36 NOMADTIPS3-TheKing/1.0"
SOURCE_HOSTS = ["www.soccerway.com", "uk.soccerway.com", "ng.soccerway.com"]
EXCLUDE_RE = re.compile(r"\b(friendly|club friendly|u[- ]?\d{2}|youth|reserve|women'?s friendly)\b", re.I)
SCORE_RE = re.compile(r"(?<!\d)(\d{1,2})\s*[-–:]\s*(\d{1,2})(?!\d)")
BOOKMAKERS = ["Bet365", "1xBet", "Pinnacle", "Betway", "Unibet", "William Hill", "Marathonbet"]

def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def load_json(path, default):
    try: return json.loads(path.read_text(encoding="utf-8"))
    except Exception: return default

def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def absolute(host, href):
    if not href: return None
    if href.startswith("http"): return href
    return urljoin(f"https://{host}/", href)

def swap_host(url, host):
    p = urlparse(url)
    return urlunparse((p.scheme or "https", host, p.path, p.params, p.query, p.fragment))

class Http:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8"})
        self.health = {}
    def get(self, url, timeout=18):
        host = urlparse(url).netloc; started = time.time()
        try:
            r = self.s.get(url, timeout=timeout, allow_redirects=True)
            ok = r.status_code == 200 and len(r.text) > 500
            self.health[host] = {"ok":ok,"status":r.status_code,"ms":int((time.time()-started)*1000)}
            if not ok: raise RuntimeError(f"HTTP {r.status_code} / {len(r.text)} bytes")
            return r.text
        except Exception as e:
            self.health[host] = {"ok":False,"error":str(e)[:180],"ms":int((time.time()-started)*1000)}
            raise

def text_norm(s): return re.sub(r"\s+", " ", (s or "")).strip()

def same_name(a,b):
    a=re.sub(r"[^a-z0-9]+","",a.lower()); b=re.sub(r"[^a-z0-9]+","",b.lower())
    return bool(a and b and (a==b or a in b or b in a))

def find_fixture_rows(html, host):
    soup=BeautifulSoup(html,"html.parser"); out=[]; seen=set()
    for node in soup.find_all(["tr","li","div","article"]):
        teams=[]
        for a in node.find_all("a",href=True):
            href=a.get("href") or ""; label=text_norm(a.get_text(" ",strip=True))
            if "/teams/" in href and label and len(label)<=80 and not any(same_name(label,x["name"]) for x in teams):
                teams.append({"name":label,"url":absolute(host,href)})
        if len(teams)<2: continue
        raw=text_norm(node.get_text(" ",strip=True))
        if EXCLUDE_RE.search(raw): continue
        home,away=teams[0],teams[1]; key=(home["name"].lower(),away["name"].lower())
        if key in seen: continue
        seen.add(key)
        ma=next((a for a in node.find_all("a",href=True) if "/matches/" in (a.get("href") or "")),None)
        league=""
        for a in node.find_all("a",href=True):
            href=a.get("href") or ""; label=text_norm(a.get_text(" ",strip=True))
            if label and "/teams/" not in href and "/matches/" not in href and len(label)<90 and label not in (home["name"],away["name"]):
                league=label; break
        kickoff=None; t=node.find("time")
        if t: kickoff=t.get("datetime") or text_norm(t.get_text(" ",strip=True))
        if not kickoff:
            m=re.search(r"\b([01]?\d|2[0-3]):[0-5]\d\b",raw); kickoff=m.group(0) if m else None
        out.append({"home":home["name"],"away":away["name"],"home_url":home["url"],"away_url":away["url"],"match_url":absolute(host,ma.get("href")) if ma else None,"league":league,"kickoff":kickoff,"source":host})
    return out

def discover_fixtures(http,date_str):
    yyyy,mm,dd=date_str.split("-"); errors=[]; rows=[]
    for host in SOURCE_HOSTS:
        try:
            got=find_fixture_rows(http.get(f"https://{host}/matches/{yyyy}/{mm}/{dd}/"),host); rows.extend(got)
            if got: break
        except Exception as e: errors.append(f"{host}: {e}")
    unique=[]; seen=set()
    for x in rows:
        k=(x["home"].lower(),x["away"].lower())
        if k not in seen: seen.add(k); unique.append(x)
    return unique,errors

def team_matches_url(url):
    if not url:return None
    p=urlparse(url); path=p.path.rstrip("/")
    if not path.endswith("/matches"): path += "/matches"
    return urlunparse((p.scheme,p.netloc,path+"/","","",""))

def parse_recent_matches(html,team_name,max_n=10):
    soup=BeautifulSoup(html,"html.parser"); rows=[]
    for node in soup.find_all(["tr","li","div"]):
        raw=text_norm(node.get_text(" ",strip=True)); score=SCORE_RE.search(raw)
        if not score: continue
        anchors=[text_norm(a.get_text(" ",strip=True)) for a in node.find_all("a",href=True) if "/teams/" in (a.get("href") or "")]
        anchors=[a for a in anchors if a]
        if len(anchors)<2: continue
        home,away=anchors[0],anchors[1]
        if not (same_name(team_name,home) or same_name(team_name,away)): continue
        hg,ag=int(score.group(1)),int(score.group(2)); is_home=same_name(team_name,home); gf,ga=(hg,ag) if is_home else (ag,hg)
        result="W" if gf>ga else "D" if gf==ga else "L"; key=(home,away,hg,ag)
        if any(r["_key"]==key for r in rows): continue
        rows.append({"gf":gf,"ga":ga,"result":result,"venue":"home" if is_home else "away","_key":key})
        if len(rows)>=max_n: break
    for r in rows:r.pop("_key",None)
    return rows

def weighted_stats(rows,venue=None):
    subset=[r for r in rows if venue is None or r["venue"]==venue][:6]
    if not subset:return None
    weights=[1.0,.86,.72,.60,.50,.42][:len(subset)]; z=sum(weights)
    return {"n":len(subset),"gf":sum(w*r["gf"] for w,r in zip(weights,subset))/z,"ga":sum(w*r["ga"] for w,r in zip(weights,subset))/z,"ppg":sum(w*({"W":3,"D":1,"L":0}[r["result"]]) for w,r in zip(weights,subset))/z,"clean_sheet":sum(w*(r["ga"]==0) for w,r in zip(weights,subset))/z,"failed_to_score":sum(w*(r["gf"]==0) for w,r in zip(weights,subset))/z}

def pmf(k,lam): return math.exp(-lam)*(lam**k)/math.factorial(k)

def dixon_coles_matrix(lh,la,rho=-.08,max_goals=7):
    mat=[[pmf(i,lh)*pmf(j,la) for j in range(max_goals+1)] for i in range(max_goals+1)]
    for (i,j),c in {(0,0):1-lh*la*rho,(0,1):1+lh*rho,(1,0):1+la*rho,(1,1):1-rho}.items(): mat[i][j]*=max(.01,c)
    z=sum(map(sum,mat)); return [[x/z for x in row] for row in mat]

def score_model(home_rows,away_rows):
    ho,ao=weighted_stats(home_rows),weighted_stats(away_rows); hv,av=weighted_stats(home_rows,"home"),weighted_stats(away_rows,"away")
    if not ho or not ao or ho["n"]<5 or ao["n"]<5 or not hv or not av or hv["n"]<2 or av["n"]<2:return None
    lh=min(3.6,max(.2,.54*(.62*hv["gf"]+.38*ho["gf"])+.46*(.62*av["ga"]+.38*ao["ga"])+.10))
    la=min(3.6,max(.2,.54*(.62*av["gf"]+.38*ao["gf"])+.46*(.62*hv["ga"]+.38*ho["ga"])))
    mat=dixon_coles_matrix(lh,la); ph=pd=pa=btts=odd=0.; best=(0.,0,0)
    for i,row in enumerate(mat):
        for j,p in enumerate(row):
            if i>j:ph+=p
            elif i==j:pd+=p
            else:pa+=p
            if i>0 and j>0:btts+=p
            if (i+j)%2:odd+=p
            if p>best[0]:best=(p,i,j)
    probs={"home":ph,"draw":pd,"away":pa}; ordered=sorted(probs.items(),key=lambda kv:kv[1],reverse=True); side,conf=ordered[0]; edge=conf-ordered[1][1]
    eligible=(conf>.70) if side=="draw" else (conf>=.58 and edge>=.12)
    return {"lambda_home":round(lh,3),"lambda_away":round(la,3),"home_win":round(ph,4),"draw":round(pd,4),"away_win":round(pa,4),"projected_score":f"{best[1]}-{best[2]}","btts_yes":round(btts,4),"btts_no":round(1-btts,4),"odd":round(odd,4),"even":round(1-odd,4),"side":side,"confidence":conf,"edge":edge,"eligible":eligible}

def extract_1x2_odds(html):
    soup=BeautifulSoup(html,"html.parser"); cand=[]
    for node in soup.find_all(["tr","li","div"]):
        s=text_norm(node.get_text(" ",strip=True))
        if len(s)>250 or not any(b.lower() in s.lower() for b in BOOKMAKERS): continue
        nums=[float(x) for x in re.findall(r"\b([1-9]\d?\.\d{2})\b",s)]; nums=[x for x in nums if 1.01<=x<=30]
        if len(nums)>=3:
            book=next((b for b in BOOKMAKERS if b.lower() in s.lower()),"Bookmaker"); cand.append((book,nums[:3]))
    if not cand:return None
    cand.sort(key=lambda x:BOOKMAKERS.index(x[0]) if x[0] in BOOKMAKERS else 99); book,nums=cand[0]
    return {"bookmaker":book,"home":nums[0],"draw":nums[1],"away":nums[2]}

def fetch_team_rows(http,url,name):
    for u in [team_matches_url(url),url]:
        if not u:continue
        try:
            rows=parse_recent_matches(http.get(u),name)
            if len(rows)>=5:return rows
        except Exception:pass
    return []

def stable_id(date_str,home,away): return hashlib.sha1(f"{date_str}|{home}|{away}".encode()).hexdigest()[:16]

def analyse_fixture(http,fx,date_str):
    hr=fetch_team_rows(http,fx["home_url"],fx["home"]); ar=fetch_team_rows(http,fx["away_url"],fx["away"]); model=score_model(hr,ar)
    if not model or not model["eligible"] or model["side"]=="draw":return None,{"reason":"MODEL_GATE","home_n":len(hr),"away_n":len(ar)}
    if not fx.get("match_url"):return None,{"reason":"NO_MATCH_URL"}
    try: market=extract_1x2_odds(http.get(fx["match_url"]))
    except Exception as e:return None,{"reason":"MATCH_FETCH_FAILED","detail":str(e)[:120]}
    if not market:return None,{"reason":"NO_VERIFIED_1X2_ODDS"}
    side=model["side"]; locked=float(market[side])
    if locked<1.70:return None,{"reason":"ODDS_GATE","odds":locked}
    team=fx["home"] if side=="home" else fx["away"]
    return {"id":stable_id(date_str,fx["home"],fx["away"]),"date":date_str,"kickoff":fx.get("kickoff"),"league":fx.get("league"),"home":fx["home"],"away":fx["away"],"pick":f"{team} Win","side":side,"odds":round(locked,2),"odds_source":market["bookmaker"],"confidence":round(model["confidence"],4),"edge":round(model["edge"]*100,1),"result":"PENDING","ft":None,"source_url":fx["match_url"],"home_url":fx["home_url"],"away_url":fx["away_url"],"model":{"lambda_home":model["lambda_home"],"lambda_away":model["lambda_away"],"home_win":model["home_win"],"draw":model["draw"],"away_win":model["away_win"]},"data_quality":{"home_recent":len(hr),"away_recent":len(ar)}},None

def parse_ft(html,home,away):
    soup=BeautifulSoup(html,"html.parser"); texts=[text_norm(soup.title.get_text(" ",strip=True) if soup.title else "")]
    for tag in soup.find_all(["h1","h2","tr","div","span"]):
        s=text_norm(tag.get_text(" ",strip=True))
        if len(s)<=220 and same_name(home,s) and same_name(away,s):texts.append(s)
    for s in texts:
        if any(k in s.lower() for k in ["ft","full time","finished","final"]):
            m=SCORE_RE.search(s)
            if m:return int(m.group(1)),int(m.group(2))
    return None

def verify_result(http,rec):
    url=rec.get("source_url"); votes=[]; used=[]
    if not url:return None,used
    for host in SOURCE_HOSTS:
        try:
            ft=parse_ft(http.get(swap_host(url,host)),rec["home"],rec["away"])
            if ft:votes.append(ft);used.append(host)
        except Exception:continue
    if not votes:return None,used
    ft,n=Counter(votes).most_common(1)[0]
    if n<2:return None,used
    return ft,[used[i] for i,v in enumerate(votes) if v==ft]

def selection(date_str):
    http=Http(); feed=load_json(FEED_PATH,{"history":[],"today":[]}); fixtures,errors=discover_fixtures(http,date_str); qualified=[]; rejected=[]
    for fx in fixtures[:180]:
        try:
            rec,rej=analyse_fixture(http,fx,date_str)
            if rec:qualified.append(rec)
            elif rej:rejected.append({"match":f'{fx["home"]} vs {fx["away"]}',**rej})
        except Exception as e:rejected.append({"match":f'{fx["home"]} vs {fx["away"]}',"reason":"ENGINE_ERROR","detail":str(e)[:160]})
    qualified.sort(key=lambda x:(x["confidence"],x["edge"],x["odds"]),reverse=True); qualified=qualified[:6]
    history=feed.get("history") or []; known={x.get("id") for x in history if x.get("id")}
    for rec in qualified:
        if rec["id"] not in known:history.append(rec.copy())
    feed.update({"today":qualified,"history":history,"updated_at":now_iso(),"dataset":"the-king-live","note":"Automated Full-Time Winner First feed. Supplemental markets remain unpublished."}); save_json(FEED_PATH,feed)
    state=load_json(STATE_PATH,{}); state.update({"engine":"the-king-v1","last_selection_run":now_iso(),"selection_date":date_str,"fixtures_seen":len(fixtures),"qualified":len(qualified),"rejected":len(rejected),"pending":sum(1 for x in history if x.get("result")=="PENDING"),"source_health":http.health,"discovery_errors":errors,"status":"OK" if fixtures else "SOURCE_EMPTY"}); save_json(STATE_PATH,state)
    print(json.dumps({"mode":"select","date":date_str,"fixtures":len(fixtures),"qualified":len(qualified),"pending":state["pending"]}))

def settlement():
    http=Http(); feed=load_json(FEED_PATH,{"history":[],"today":[]}); history=feed.get("history") or []; settled=0
    for rec in history:
        if rec.get("result")!="PENDING":continue
        ft,verified=verify_result(http,rec)
        if ft:
            hg,ag=ft; side=rec.get("side"); won=(side=="home" and hg>ag) or (side=="away" and ag>hg); rec.update({"ft":f"{hg}-{ag}","result":"WIN" if won else "LOSS","settled_at":now_iso(),"verified_by":verified}); settled+=1
    by_id={x.get("id"):x for x in history}; feed["history"]=history; feed["today"]=[by_id.get(x.get("id"),x) for x in (feed.get("today") or [])]; feed["updated_at"]=now_iso(); save_json(FEED_PATH,feed)
    state=load_json(STATE_PATH,{}); state.update({"engine":"the-king-v1","last_settlement_run":now_iso(),"settled_this_run":settled,"pending":sum(1 for x in history if x.get("result")=="PENDING"),"source_health":http.health,"status":"OK"}); save_json(STATE_PATH,state)
    print(json.dumps({"mode":"settle","settled":settled,"pending":state["pending"]}))

def self_test():
    strong=[{"gf":2,"ga":0,"result":"W","venue":"home" if i%2==0 else "away"} for i in range(6)]; weak=[{"gf":0,"ga":2,"result":"L","venue":"away" if i%2==0 else "home"} for i in range(6)]; m=score_model(strong,weak); assert m and m["home_win"]>m["away_win"]; print(json.dumps({"self_test":"PASS","home_win":m["home_win"],"edge":round(m["edge"]*100,1)}))

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("mode",choices=["select","settle","self-test"]); ap.add_argument("--date",default=datetime.now(timezone.utc).strftime("%Y-%m-%d")); a=ap.parse_args()
    if a.mode=="select":selection(a.date)
    elif a.mode=="settle":settlement()
    else:self_test()
if __name__=="__main__":main()
