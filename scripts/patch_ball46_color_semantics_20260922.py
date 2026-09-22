from pathlib import Path
import re

INDEX = Path('nomad-live-343/index.html')
CSS_NAME = 'color-semantics-343.css'
JS_NAME = 'color-semantics-343.js'
VERSION = '343-color-semantics-20260922a'

html = INDEX.read_text()

# Idempotent: remove only an older copy of this dedicated presentation sidecar.
html = re.sub(r'<link\b[^>]*href=["\'](?:\./|/)?color-semantics-343\.css(?:\?[^"\']*)?["\'][^>]*>\s*', '', html, flags=re.I)
html = re.sub(r'<script\b[^>]*src=["\'](?:\./|/)?color-semantics-343\.js(?:\?[^"\']*)?["\'][^>]*>\s*</script>\s*', '', html, flags=re.I)

css_tag = f'<link rel="stylesheet" href="{CSS_NAME}?v={VERSION}">'
js_tag = f'<script src="{JS_NAME}?v={VERSION}" defer></script>'

if '</head>' not in html.lower():
    raise SystemExit('HEAD_CLOSE_MISSING')
if '</body>' not in html.lower():
    raise SystemExit('BODY_CLOSE_MISSING')

# Load CSS last in the head and JS last in the body so one semantic owner wins
# without changing any renderer, provider, odds or engine code.
html, n_css = re.subn(r'</head>', css_tag + '</head>', html, count=1, flags=re.I)
html, n_js = re.subn(r'</body>', js_tag + '</body>', html, count=1, flags=re.I)
if n_css != 1 or n_js != 1:
    raise SystemExit(f'INSERT_FAILED:{n_css}:{n_js}')

if html.count(CSS_NAME) != 1 or html.count(JS_NAME) != 1:
    raise SystemExit('SEMANTIC_SIDECAR_DUPLICATE')

INDEX.write_text(html)
print('BALL46_COLOR_SEMANTICS_INDEX_PATCH_OK')
