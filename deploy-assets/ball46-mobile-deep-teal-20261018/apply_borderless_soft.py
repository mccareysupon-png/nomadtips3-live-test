#!/usr/bin/env python3
"""Add owner-approved mobile-only visual overrides to exact Active BALL46 HTML."""
import sys
from pathlib import Path

MARK = 'b46gn-mobile-borderless-soft-20261019'
REQUIRED = (
    'id="b46gn-mobile-wide7-hidehero-20261018"',
    'id="b46gn-tools-markets-wide7-20261019"',
    'id="b46gn-mobile-real-board-20261018"',
    'id="b46gn-flow-kits-menu-runtime-20261018"',
    'id="b46m-teal-shell"',
    'id="b46gn-results"',
    'data-b46m-searchbutton',
    'data-b46m-open',
)
def patch(html,css):
    assert len(html)>100000,'CURRENT_ACTIVE_HTML_UNEXPECTEDLY_SHORT'
    assert all(t in html for t in REQUIRED),'CURRENT_PRODUCTION_ANCHOR_DRIFT'
    assert MARK not in html,'PATCH_ALREADY_INSTALLED'
    assert html.count('</body>')==1,'BODY_TAG_DRIFT'
    assert '@media (max-width:760px)' in css,'MOBILE_MEDIA_GUARD_MISSING'
    assert 1200<len(css)<8000,'CSS_SIZE_UNEXPECTED'
    assert all(token in css for token in ('[data-b46m-open]','[data-b46m-searchbutton]','.b46gn-card','.b46gn-sheet',':focus-visible')),'CSS_SELECTOR_MISSING'
    assert not any(x in css for x in ('<style','</style>','<script','</script>')),'CSS_HAS_HTML_OR_JS'
    addition='\n<style id="'+MARK+'">\n'+css+'\n</style>\n'
    result=html.replace('</body>',addition+'</body>')
    assert result.replace(addition,'',1)==html,'UNRELATED_PRODUCTION_HTML_MUTATED'
    return result
if __name__=='__main__':
    assert len(sys.argv)==4,'usage: apply_borderless_soft.py active-index.html overrides.css candidate-index.html'
    input_file,css_file,output_file=map(Path,sys.argv[1:])
    output_file.write_text(patch(input_file.read_text(encoding='utf8'),css_file.read_text(encoding='utf8')),encoding='utf8')
    print('PASS: additive mobile CSS only; preserved original Active HTML')
