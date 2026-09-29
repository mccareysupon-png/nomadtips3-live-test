#!/usr/bin/env python3
import urllib.request, pathlib, re
BASE='https://www.ball46.com'

def get(name):
    req=urllib.request.Request(f'{BASE}/{name}?extract=20260929',headers={'User-Agent':'Ball46-TopCard-Extract/20260929','Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=40) as r:return r.read().decode('utf-8','replace')
js=get('dashboard-v2-stage3.js')
css=get('dashboard-v2-tune.css')

def extract_function(src,name):
    needle=f'function {name}('
    s=src.find(needle)
    if s<0:return 'NOT_FOUND'
    b=src.find('{',s)
    depth=0; quote=None; esc=False; i=b
    while i<len(src):
        c=src[i]
        if quote:
            if esc: esc=False
            elif c=='\\': esc=True
            elif c==quote: quote=None
        else:
            if c in "'\"`": quote=c
            elif c=='{': depth+=1
            elif c=='}':
                depth-=1
                if depth==0:return src[s:i+1]
        i+=1
    return src[s:s+12000]

def css_context(src,token,radius=1600):
    out=[]; start=0
    while True:
        p=src.find(token,start)
        if p<0:break
        out.append(src[max(0,p-radius):min(len(src),p+radius)])
        start=p+len(token)
        if len(out)>=12:break
    return '\n\n--- CSS HIT ---\n'.join(out)

parts=[]
for fn in ['renderWorkspaceScorebar','signalDetailsHtml','inlineSignalHtml','scorebarSignalMeta','scorebarSignalText']:
    parts.append(f'===== FUNCTION {fn} =====\n{extract_function(js,fn)}\n')
parts.append('===== WORKSPACE SCOREBAR CSS =====\n'+css_context(css,'.workspace-scorebar',1800))
parts.append('\n===== SCOREBAR DATA ATTR CSS =====\n'+css_context(css,'data-workspace-scorebar-slot',1200))
path=pathlib.Path('ball46-topcard-extract-20260929.txt')
path.write_text('\n'.join(parts),encoding='utf-8')
print('WROTE',path,'bytes',path.stat().st_size)
