#!/usr/bin/env python3
"""Build BALL46 Member loading splash from verified current protected HTML and live member JS."""
import pathlib,sys,hashlib
ROOT=pathlib.Path('ball46-member/member-loading-20261020')
def h(b):return hashlib.sha256(b).hexdigest()
def once(s,a,b,label):
  assert s.count(a)==1, 'SOURCE_ANCHOR_DRIFT:'+label
  return s.replace(a,b,1)
def main():
  assert len(sys.argv)==2,'usage: patch_member.py <directory containing verified live member assets>'
  d=pathlib.Path(sys.argv[1])
  htmlraw=(d/'member.html').read_bytes()
  jsraw=(d/'member.js').read_bytes()
  # Protected member.html comes from immutable source 05c276f7 (last successful Member
  # full deployment), while member.js is fetched byte-for-byte from current live assets.
  assert b'kpiV7=desktop-nine-in-one-row-20261020' in htmlraw,'PROTECTED_HTML_SOURCE_VERSION_DRIFT'
  assert b'favoriteStorageInit(session.member)' in jsraw,'MEMBER_JS_SOURCE_VERSION_DRIFT'
  assert b'mobileV5=' in htmlraw,'MOBILE_V5_HEADER_MISSING'
  assert b'ball46:member-data-ready' not in jsraw,'LOADER_ALREADY_WIRED'
  html=htmlraw.decode('utf8');js=jsraw.decode('utf8')
  signature='BALL46_MEMBER_GRAPHITE_SPLASH_V1_20261020'
  assert signature not in html and signature not in js,'LOADER_ALREADY_INSTALLED'
  overlay='''<div id="b46-member-loading" role="status" aria-live="polite" aria-label="Loading Member data">
  <div class="b46-ml-center">
    <div class="b46-ml-wordmark" aria-label="ball46 MEMBER"><div class="b46-ml-logo">ball<span class="b46-ml-orange">46</span></div><div class="b46-ml-member">MEMBER</div></div>
    <div class="b46-ml-ring-box" aria-hidden="true"><span class="b46-ml-ring"></span></div>
    <p class="b46-ml-status">LOADING MEMBER DATA</p>
    <p class="b46-ml-help"></p><button class="b46-ml-retry" type="button">RETRY CONNECTION</button>
  </div>
</div>'''
  html=once(html,'</head>','  <link rel="stylesheet" href="/member-loading.css?v=20261020-graphite-v1">\n</head>','style link')
  html=once(html,'<body class="page-member">','<body class="page-member">\n'+overlay,'body overlay')
  html=once(html,'<script src="/member.js?','<script src="/member-loading.js?v=20261020-graphite-v1" defer></script>\n<script src="/member.js?','JS ordering')
  js=once(js,'  state.payload=daily;\n  favoriteStorageInit(session.member);\n  render();\n  setInterval',
          '  state.payload=daily;\n  favoriteStorageInit(session.member);\n  render();\n  window.dispatchEvent(new Event(\'ball46:member-data-ready\'));\n  setInterval','boot ready after render')
  js=once(js,"  empty.textContent='Member Signal Center is temporarily unavailable.';\n});",
           "  empty.textContent='Member Signal Center is temporarily unavailable.';\n  window.dispatchEvent(new Event('ball46:member-data-error'));\n});",'boot error')
  assert html.count('id="b46-member-loading"')==1
  assert js.count("new Event('ball46:member-data-ready')")==1
  assert js.count("new Event('ball46:member-data-error')")==1
  assert len(js)-len(jsraw)<300 and len(html)-len(htmlraw)<1200,'PATCH_SCOPE_TOO_BROAD'
  (d/'member.html').write_text(html,'utf8')
  (d/'member.js').write_text(js,'utf8')
  for file in ['member-loading.css','member-loading.js']:
    data=(ROOT/file).read_bytes()
    assert signature.encode() in data,'LOADER_MARKER_MISSING'
    (d/file).write_bytes(data)
  print('MEMBER_LOADING_PATCHED_ONLY',{'originalHtmlSha':h(htmlraw),'originalJsSha':h(jsraw),'newHtmlSha':h(html.encode()),'newJsSha':h(js.encode()),'created':['member-loading.css','member-loading.js'],'unchanged':'all other assets'})
if __name__=='__main__':main()
