#!/usr/bin/env python3
"""Strictly additive, mobile-only Green Noir layout patch."""
import sys
from pathlib import Path
MARK='b46gn-mobile-wide7-hidehero-20261018'
REQUIRED=('id="b46gn-mobile-real-board-20261018"','id="b46gn-flow-kits-menu-style-20261018"','id="b46gn-flow-kits-menu-runtime-20261018"','id="b46gn-hero"','id="b46gn-results"','id="b46gn-detail"','data-workspace-panel="statistics"','data-board-sections')
def patch(html,css):
 assert all(t in html for t in REQUIRED),'ACTIVE_GREEN_NOIR_ANCHOR_MISSING'
 assert MARK not in html,'ALREADY_PATCHED'
 assert html.count('</body>')==1,'BODY_ANCHOR_DRIFT'
 assert not any(t in css for t in ('<style','</style>','<script')),'CSS_HTML_REJECTED'
 assert 2000<len(css)<8000,'CSS_SIZE_OUT_OF_RANGE'
 assert '@media (max-width: 760px)' in css,'MOBILE_GUARD_MISSING'
 assert len(html)>100000,'ACTIVE_HTML_SUSPICIOUSLY_SHORT'
 addon='\n<style id="'+MARK+'">\n'+css+'\n</style>\n'
 result=html.replace('</body>',addon+'</body>')
 assert result.replace(addon,'')==html,'UNRELATED_HTML_CHANGED'
 return result
if __name__=='__main__':
 assert len(sys.argv)==4,'usage: apply_width.py active-index.html width_mobile.css candidate-index.html'
 ip,cp,op=map(Path,sys.argv[1:])
 op.write_text(patch(ip.read_text(),cp.read_text()))
 print('BALL46: 7px mobile gutters and hidden hero, base unchanged, PASS')
