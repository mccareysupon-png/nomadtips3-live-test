from pathlib import Path
import re

CSS_HREF = 'ball46-product-pages-v1.css?v=343-product-pages-v1-20260920'

PAGES = {
    'nomad-live-343/signal.html': 'ball46-product-page ball46-product-signals',
    'nomad-live-343/statistics.html': 'ball46-product-page ball46-product-statistics',
}

required_hooks = {
    'nomad-live-343/signal.html': [
        'data-next-signal-state',
        'data-next-active-matches',
        'data-next-active-signals',
        'data-next-market-summary',
        'data-next-signal-list',
        'signal-next.js',
    ],
    'nomad-live-343/statistics.html': [
        'data-next-stat-state',
        'data-next-total',
        'data-next-win-rate',
        'data-ceo-performance',
        'data-next-stat-markets',
        'data-next-stat-body',
        'statistics-next.js',
    ],
}

for filename, body_classes in PAGES.items():
    p = Path(filename)
    s = p.read_text(encoding='utf-8')
    before = s

    for hook in required_hooks[filename]:
        if hook not in s:
            raise SystemExit(f'REQUIRED_HOOK_MISSING:{filename}:{hook}')

    # Add the isolated presentation layer after existing page CSS.
    if CSS_HREF not in s:
        marker = '</head>'
        if marker not in s:
            raise SystemExit(f'HEAD_CLOSE_MISSING:{filename}')
        s = s.replace(marker, f'<link rel="stylesheet" href="{CSS_HREF}">\n{marker}', 1)

    # Preserve any existing body classes while adding product-page identity.
    m = re.search(r'<body(?:\s+class="([^"]*)")?([^>]*)>', s, flags=re.I)
    if not m:
        raise SystemExit(f'BODY_TAG_MISSING:{filename}')
    existing = (m.group(1) or '').split()
    merged = []
    for cls in existing + body_classes.split():
        if cls and cls not in merged:
            merged.append(cls)
    attrs = m.group(2) or ''
    replacement = f'<body class="{" ".join(merged)}"{attrs}>'
    s = s[:m.start()] + replacement + s[m.end():]

    # Revision marker is presentation-only and helps verify the live cutover.
    rev = '343-product-pages-v1-20260920'
    if 'name="ball46-page-revision"' in s:
        s = re.sub(r'(<meta\s+name="ball46-page-revision"\s+content=")[^"]*(")', rf'\g<1>{rev}\2', s, count=1, flags=re.I)
    else:
        s = s.replace('<meta name="theme-color"', f'<meta name="ball46-page-revision" content="{rev}">\n<meta name="theme-color"', 1)

    # Guard against accidental removal of runtime hooks.
    for hook in required_hooks[filename]:
        if hook not in s:
            raise SystemExit(f'HOOK_REMOVED:{filename}:{hook}')

    if s == before:
        raise SystemExit(f'NO_CHANGE:{filename}')
    p.write_text(s, encoding='utf-8')

print('BALL46_PRODUCT_PAGES_PATCH_PASS')
