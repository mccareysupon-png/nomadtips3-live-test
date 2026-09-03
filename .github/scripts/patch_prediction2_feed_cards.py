#!/usr/bin/env python3
from pathlib import Path

PATH = Path('nomad-live/prediction2.html')
SCRIPT_TAG = '  <script src="prediction2-feed-cards.js?v=20260903-auto-v1"></script>\n'
OWNER_LABELS_TAG = '  <script src="prediction2-owner-override-labels.js?v=20260903-owner-v1"></script>\n'
SCRIPT_MARKER = '  <script src="site-footer.js?v=20260825-rail-v2"></script>\n'
GRID_OLD = '<section class="king-preview-grid" aria-label="Prediction2 preview picks">'
GRID_NEW = '<section class="king-preview-grid" aria-label="Prediction2 auto picks" hidden>'


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

    if text != original:
        PATH.write_text(text, encoding='utf-8')
        print('Prediction2 patched for feed-driven cards and owner-threshold labels.')
    else:
        print('Prediction2 feed-card patch already applied.')


if __name__ == '__main__':
    main()
