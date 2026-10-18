"""Strict visual-only amendment to BALL46 mobile Deep Teal injected assets."""
import sys
from pathlib import Path

CSS_MARK = '<style id="b46-mobile-deep-teal-20261018">'
JS_MARK = '<script id="b46-mobile-deep-teal-runtime-20261018">'
PATCH_MARK = 'b46m-compact-brand-hidden-heading-20261018'
OVERRIDE = """
/* b46m-compact-brand-hidden-heading-20261018 | mobile only */
@media (max-width:760px) {
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-pageinfo { display:none!important; }
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-tagline,
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-drawerhead small { display:none!important; }
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-brand {
    font-family:'Arial Black',Arial,Helvetica,sans-serif!important;
    font-weight:900!important;
    font-size:21px!important;
    letter-spacing:-.065em!important;
    line-height:1.05!important;
    color:#fff!important;
    text-transform:none!important;
  }
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-brand strong { color:#22c55e!important; }
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-drawerhead strong {
    font-family:'Arial Black',Arial,Helvetica,sans-serif!important;
    font-size:21px!important;
    font-weight:900!important;
    line-height:1.05!important;
    color:#fff!important;
    text-transform:none!important;
  }
  html[data-b46m-teal="1"] #b46m-teal-shell .b46m-drawerhead strong span { color:#22c55e!important; }
}
""".strip()

def patch(html):
    assert html.count(CSS_MARK)==1, 'DEEP_TEAL_STYLE_MISSING'
    assert html.count(JS_MARK)==1, 'DEEP_TEAL_SCRIPT_MISSING'
    assert PATCH_MARK not in html, 'PATCH_ALREADY_APPLIED'
    assert '<section class="workspace singlepage">' in html, 'WORKSPACE_MISSING'
    assert 'data-status-filter="all"' in html, 'FILTER_MISSING'
    assert 'data-workspace-view="signal"' in html, 'SIGNAL_MISSING'
    assert 'class="b46m-pageinfo"' in html, 'PAGE_HEADING_MISSING'
    before_top='class="b46m-brand">BALL<strong>46</strong>'
    after_top='class="b46m-brand">ball<strong>46</strong>'
    before_drawer='<strong>BALL<span>46</span>'
    after_drawer='<strong>ball<span>46</span>'
    assert html.count(before_top)==1 and html.count(before_drawer)==1, 'BRAND_DRIFT'
    css_end=html.index('</style>',html.index(CSS_MARK))
    assert css_end<html.index(JS_MARK), 'SCRIPT_ORDER_DRIFT'
    out=html[:css_end]+'\n'+OVERRIDE+'\n'+html[css_end:]
    out=out.replace(before_top,after_top,1).replace(before_drawer,after_drawer,1)
    assert out.replace(after_top,before_top,1).replace(after_drawer,before_drawer,1).replace('\n'+OVERRIDE+'\n','',1)==html, 'UNRELATED_HTML_CHANGED'
    assert out.count(PATCH_MARK)==1, 'MARKER_WRONG'
    return out

if __name__=='__main__':
    assert len(sys.argv)==3
    inp=Path(sys.argv[1]).read_text(encoding='utf-8')
    out=patch(inp)
    Path(sys.argv[2]).write_text(out,encoding='utf-8')
    print('BALL46: compact brand and heading hidden; untouched-base invariant PASS')
