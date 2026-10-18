#!/usr/bin/env python3
"""Strict, additive main-production mobile CSS amendment (no HTML replacement)."""
from pathlib import Path
import sys
MARK='b46gn-tools-markets-wide7-20261019'
REQ=['id="b46gn-mobile-wide7-hidehero-20261018"','id="b46gn-flow-kits-menu-style-20261018"','id="b46gn-flow-kits-menu-runtime-20261018"','id="b46gn-results"','data-workspace-panel="statistics"','data-board-sections','id="b46m-drawer"']

def patch(html,css):
 assert len(html)>100000,'ACTIVE_INDEX_TOO_SMALL'
 assert all(x in html for x in REQ),'PRODUCTION_HTML_ANCHOR_CHANGED'
 assert MARK not in html,'PATCH_ALREADY_PRESENT'
 assert html.count('</body>')==1,'BODY_ANCHOR_CHANGED'
 assert '@media (max-width:760px)' in css,'NOT_MOBILE_ONLY'
 assert len(css)>1000 and len(css)<6000,'CSS_SIZE_UNEXPECTED'
 assert not any(x in css for x in ['<style','</style>','<script','</script>']),'CSS_CONTAINS_HTML'
 addon='\n<style id="'+MARK+'">\n'+css+'\n</style>\n'
 result=html.replace('</body>',addon+'</body>')
 assert result.replace(addon,'')==html,'UNRELATED_HTML_WOULD_CHANGE'
 return result
if __name__=='__main__':
 assert len(sys.argv)==4,'usage: apply_tools_markets.py active.html patch.css candidate.html'
 before,style,after=map(Path,sys.argv[1:])
 after.write_text(patch(before.read_text(encoding='utf-8'),style.read_text(encoding='utf-8')),encoding='utf-8')
 print('MOBILE_TOOLS_MARKETS_7PX_PATCH_PASS')
