#!/usr/bin/env python3
from pathlib import Path

PATH = Path('nomad-live/prediction2.html')
SCRIPT_TAG = '  <script src="prediction2-feed-cards.js?v=20260903-auto-v1"></script>\n'
OWNER_LABELS_TAG = '  <script src="prediction2-owner-override-labels.js?v=20260903-owner-v1"></script>\n'
INLINE_ANALYSIS_TAG = '  <script src="prediction2-inline-analysis.js?v=20260903-inline-v1"></script>\n'
SCRIPT_MARKER = '  <script src="site-footer.js?v=20260825-rail-v2"></script>\n'
GRID_OLD = '<section class="king-preview-grid" aria-label="Prediction2 preview picks">'
GRID_NEW = '<section class="king-preview-grid" aria-label="Prediction2 auto picks" hidden>'

# Prediction2 is a TODAY-only public surface. Historical KING records stay in the
# source feed, but this page must not consume or render them.
SETTLED_OLD = "        const settled=(data.history||[]).filter(x=>x.result==='WIN'||x.result==='LOSS');"
SETTLED_NEW = "        const settled=[];"
DRAWS_OLD = "        const draws=(data.history||[]).filter(x=>x.result==='DRAW'||x.result==='PUSH').length;"
DRAWS_NEW = "        const draws=0;"
AUTO_HISTORY_OLD = "        if(today.length===0&&settled.length>0)activateTab('history');"
AUTO_HISTORY_NEW = "        activateTab('today');"
HEAD_MARKER = '</head>'
TODAY_ONLY_STYLE = '''  <style id="prediction2-today-only-hardlock">
    body[data-page="prediction2"] .king-scorebar,
    body[data-page="prediction2"] .king-tabs button[data-tab="history"],
    body[data-page="prediction2"] .king-tabs button[data-tab="daily"],
    body[data-page="prediction2"] .king-panel[data-panel="history"],
    body[data-page="prediction2"] .king-panel[data-panel="daily"]{display:none!important}
  </style>
'''


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'{label} marker not found')
    return text.replace(old, new, 1)


def main():
    text = PATH.read_text(encoding='utf-8')
    original = text

    if GRID_OLD in text:
        text = text.replace(GRID_OLD, GRID_NEW, 1)

    if SCRIPT_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found')
        text = text.replace(SCRIPT_MARKER, SCRIPT_TAG + SCRIPT_MARKER, 1)

    if OWNER_LABELS_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found for owner labels')
        text = text.replace(SCRIPT_MARKER, OWNER_LABELS_TAG + SCRIPT_MARKER, 1)

    if INLINE_ANALYSIS_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found for inline analysis')
        text = text.replace(SCRIPT_MARKER, INLINE_ANALYSIS_TAG + SCRIPT_MARKER, 1)

    text = replace_once(text, SETTLED_OLD, SETTLED_NEW, 'settled history')
    text = replace_once(text, DRAWS_OLD, DRAWS_NEW, 'draw history')
    text = replace_once(text, AUTO_HISTORY_OLD, AUTO_HISTORY_NEW, 'history auto-switch')

    if 'id="prediction2-today-only-hardlock"' not in text:
        if HEAD_MARKER not in text:
            raise SystemExit('head marker not found')
        text = text.replace(HEAD_MARKER, TODAY_ONLY_STYLE + HEAD_MARKER, 1)

    if text != original:
        PATH.write_text(text, encoding='utf-8')
        print('Prediction2 patched: TODAY-only hard lock active; history retained only in source feed.')
    else:
        print('Prediction2 TODAY-only hard lock already applied.')


if __name__ == '__main__':
    main()
