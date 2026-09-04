#!/usr/bin/env python3
from pathlib import Path

PATH = Path('nomad-live/prediction2.html')
SCRIPT_TAG = '  <script src="prediction2-feed-cards.js?v=20260903-auto-v1"></script>\n'
OWNER_LABELS_OLD = '  <script src="prediction2-owner-override-labels.js?v=20260903-owner-v1"></script>\n'
OWNER_LABELS_TAG = '  <script src="prediction2-owner-override-labels.js?v=20260904-stats-v3"></script>\n'
INLINE_ANALYSIS_TAG = '  <script src="prediction2-inline-analysis.js?v=20260903-inline-v1"></script>\n'
STATS_V3_TAG = '  <script src="prediction2-stats-v3.js?v=20260904-v3"></script>\n'
SCRIPT_MARKER = '  <script src="site-footer.js?v=20260825-rail-v2"></script>\n'
GRID_OLD = '<section class="king-preview-grid" aria-label="Prediction2 preview picks">'
GRID_NEW = '<section class="king-preview-grid" aria-label="Prediction2 auto picks" hidden>'

# The embedded legacy feed renderer stays neutral for historical statistics.
# Statistics V3 owns scorebar/HISTORY/DAILY from 2026-09-04 onward.
SETTLED_OLD = "        const settled=(data.history||[]).filter(x=>x.result==='WIN'||x.result==='LOSS');"
SETTLED_NEW = "        const settled=[];"
DRAWS_OLD = "        const draws=(data.history||[]).filter(x=>x.result==='DRAW'||x.result==='PUSH').length;"
DRAWS_NEW = "        const draws=0;"
AUTO_HISTORY_OLD = "        if(today.length===0&&settled.length>0)activateTab('history');"
AUTO_HISTORY_NEW = "        activateTab('today');"
TODAY_ONLY_STYLE = '''  <style id="prediction2-today-only-hardlock">
    body[data-page="prediction2"] .king-scorebar,
    body[data-page="prediction2"] .king-tabs button[data-tab="history"],
    body[data-page="prediction2"] .king-tabs button[data-tab="daily"],
    body[data-page="prediction2"] .king-panel[data-panel="history"],
    body[data-page="prediction2"] .king-panel[data-panel="daily"]{display:none!important}
  </style>
'''


def main():
    text = PATH.read_text(encoding='utf-8')
    original = text

    if GRID_OLD in text:
        text = text.replace(GRID_OLD, GRID_NEW, 1)

    if SCRIPT_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found')
        text = text.replace(SCRIPT_MARKER, SCRIPT_TAG + SCRIPT_MARKER, 1)

    if OWNER_LABELS_OLD in text:
        text = text.replace(OWNER_LABELS_OLD, OWNER_LABELS_TAG, 1)
    elif OWNER_LABELS_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found for owner labels')
        text = text.replace(SCRIPT_MARKER, OWNER_LABELS_TAG + SCRIPT_MARKER, 1)

    if INLINE_ANALYSIS_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found for inline analysis')
        text = text.replace(SCRIPT_MARKER, INLINE_ANALYSIS_TAG + SCRIPT_MARKER, 1)

    if STATS_V3_TAG not in text:
        if SCRIPT_MARKER not in text:
            raise SystemExit('site-footer script marker not found for Statistics V3')
        text = text.replace(SCRIPT_MARKER, STATS_V3_TAG + SCRIPT_MARKER, 1)

    if SETTLED_OLD in text:
        text = text.replace(SETTLED_OLD, SETTLED_NEW, 1)
    if DRAWS_OLD in text:
        text = text.replace(DRAWS_OLD, DRAWS_NEW, 1)
    if AUTO_HISTORY_OLD in text:
        text = text.replace(AUTO_HISTORY_OLD, AUTO_HISTORY_NEW, 1)

    # Remove the temporary TODAY-only display lock. V3 owns these surfaces now.
    if TODAY_ONLY_STYLE in text:
        text = text.replace(TODAY_ONLY_STYLE, '', 1)

    if text != original:
        PATH.write_text(text, encoding='utf-8')
        print('Prediction2 patched: KING Statistics V3 owns scorebar, HISTORY and DAILY.')
    else:
        print('Prediction2 Statistics V3 wiring already current.')


if __name__ == '__main__':
    main()
