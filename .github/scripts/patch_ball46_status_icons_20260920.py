from pathlib import Path

PAGE = Path('nomad-live-343/index.html')
MARKER = 'ball46-status-icons-v1'

s = PAGE.read_text(encoding='utf-8')

if MARKER in s:
    print('STATUS_ICONS_ALREADY_APPLIED')
    raise SystemExit(0)

replacements = {
    '<button class="filter" data-status-filter="live"><span><i class="status-dot live"></i>Live</span><b data-filter-count="live">0</b></button>':
    '<button class="filter" data-status-filter="live"><span><svg class="status-icon status-icon-live" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle class="status-live-core" cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/><path d="M8.7 8.7a4.7 4.7 0 0 0 0 6.6M15.3 8.7a4.7 4.7 0 0 1 0 6.6"/><path d="M5.8 5.8a8.8 8.8 0 0 0 0 12.4M18.2 5.8a8.8 8.8 0 0 1 0 12.4"/></svg>Live</span><b data-filter-count="live">0</b></button>',
    '<button class="filter" data-status-filter="signal"><span><i class="signal-native-mark">◆</i>Signal</span><b data-filter-count="signal">0</b></button>':
    '<button class="filter" data-status-filter="signal"><span><svg class="status-icon status-icon-signal" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/></svg>Signal</span><b data-filter-count="signal">0</b></button>',
    '<button class="filter" data-status-filter="scheduled"><span><i class="status-dot upcoming"></i>Upcoming</span><b data-filter-count="scheduled">0</b></button>':
    '<button class="filter" data-status-filter="scheduled"><span><svg class="status-icon status-icon-upcoming" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>Upcoming</span><b data-filter-count="scheduled">0</b></button>',
    '<button class="filter" data-status-filter="unknown"><span><i class="status-dot waiting"></i>Waiting</span><b data-filter-count="unknown">0</b></button>':
    '<button class="filter" data-status-filter="unknown"><span><svg class="status-icon status-icon-waiting" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 4h10M7 20h10M8 4c0 3.8 1.5 5.2 4 8-2.5 2.8-4 4.2-4 8M16 4c0 3.8-1.5 5.2-4 8 2.5 2.8 4 4.2 4 8"/></svg>Waiting</span><b data-filter-count="unknown">0</b></button>',
    '<button class="filter" data-status-filter="finished"><span><i class="status-dot finished"></i>Finished</span><b data-filter-count="finished">0</b></button>':
    '<button class="filter" data-status-filter="finished"><span><svg class="status-icon status-icon-finished" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>Finished</span><b data-filter-count="finished">0</b></button>',
}

for old, new in replacements.items():
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'STATUS_ICON_SOURCE_MISMATCH:{count}:{old[:80]}')
    s = s.replace(old, new, 1)

style = '''<style id="ball46-status-icons-v1">\n.filter .status-icon{width:15px;height:15px;display:inline-block;flex:0 0 15px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;vertical-align:-2px;transition:opacity .15s ease,transform .15s ease}\n.filter[data-status-filter="live"] .status-icon{color:var(--green-2)}\n.filter[data-status-filter="signal"] .status-icon{color:#c49a3a}\n.filter[data-status-filter="scheduled"] .status-icon{color:#6f88a0}\n.filter[data-status-filter="unknown"] .status-icon{color:var(--amber)}\n.filter[data-status-filter="finished"] .status-icon{color:#8b9690}\n.filter:hover .status-icon,.filter.active .status-icon{transform:translateY(-.5px)}\n.status-icon-live .status-live-core{animation:ball46-status-pulse 1.8s ease-in-out infinite}\n@keyframes ball46-status-pulse{0%,100%{opacity:1}50%{opacity:.45}}\n@media(prefers-reduced-motion:reduce){.status-icon-live .status-live-core{animation:none}}\n@media(max-width:760px){.filter .status-icon{width:14px;height:14px;display:block;margin:0 auto 3px}}\n</style>'''

if '</head>' not in s:
    raise SystemExit('HEAD_CLOSE_NOT_FOUND')
s = s.replace('</head>', style + '</head>', 1)

for token in (
    MARKER,
    'status-icon-live',
    'status-icon-signal',
    'status-icon-upcoming',
    'status-icon-waiting',
    'status-icon-finished',
    'data-filter-count="live"',
    'data-filter-count="signal"',
):
    if token not in s:
        raise SystemExit(f'PATCH_VERIFY_MISSING:{token}')

PAGE.write_text(s, encoding='utf-8')
print('BALL46_STATUS_ICONS_PATCH_PASS')
