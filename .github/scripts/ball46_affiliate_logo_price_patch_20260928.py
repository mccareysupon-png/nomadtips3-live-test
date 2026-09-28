from pathlib import Path
import re, sys

if len(sys.argv) != 3:
    raise SystemExit('usage: patch.py <full-market-bookmaker-343.js> <full-market-bookmaker-343.css>')
js_path=Path(sys.argv[1]); css_path=Path(sys.argv[2])
s=js_path.read_text()
c=css_path.read_text()

ONE="https://reffpa.com/L?tag=d_6082319m_97c_&site=6082319&ad=97"
WH="https://campaigns.williamhill.com/C.ashx?btag=a_189870b_33c_&affid=1739384&siteid=189870&adid=33&c="
ONE_LOGO="https://upload.wikimedia.org/wikipedia/commons/d/d3/1xBet-Logo.png"
WH_LOGO="https://upload.wikimedia.org/wikipedia/commons/8/87/William_Hill_logo.png"

# Preconditions: current renderer already owns affiliate price anchors for both verified books.
for needle in [
    "const AFFILIATE_URLS=Object.freeze({",
    f"'1xbet':'{ONE}'",
    f"'williamhill':'{WH}'",
    "function affiliatePriceHtml(v,slug)",
    'data-b46-affiliate-odds',
    "['1xbet','1xBet']",
    "['bet365','Bet365'],['pinnacle','Pinnacle'],['williamhill','William Hill']",
]:
    if needle not in s: raise SystemExit('PRECONDITION_MISSING:'+needle)

# Do not stack an old logo implementation.
if 'BOOK_LOGO_URLS' in s or 'function bookLabelHtml(b)' in s:
    raise SystemExit('LOGO_LAYER_ALREADY_PRESENT')

# Insert logo map immediately after affiliate map.
pat=re.compile(r"(const AFFILIATE_URLS=Object\.freeze\(\{\n\s*'1xbet':'[^']+',\n\s*'williamhill':'[^']+'\n\}\);\n)")
m=pat.search(s)
if not m: raise SystemExit('AFFILIATE_MAP_BLOCK_NOT_FOUND')
logo_map=(
"const BOOK_LOGO_URLS=Object.freeze({\n"
+f"  '1xbet':'{ONE_LOGO}',\n"
+f"  'williamhill':'{WH_LOGO}'\n"
+"});\n"
)
s=s[:m.end()]+logo_map+s[m.end():]

# Add renderer-owned, non-clickable logo label. Fallback remains plain bookmaker text.
needle="function affiliatePriceHtml(v,slug){"
pos=s.find(needle)
if pos<0: raise SystemExit('AFFILIATE_PRICE_FN_NOT_FOUND')
fn_end=s.find('\nfunction marketTable',pos)
if fn_end<0: raise SystemExit('MARKET_TABLE_BOUNDARY_NOT_FOUND')
book_fn=(
"\nfunction bookLabelHtml(b){const src=BOOK_LOGO_URLS[b?.slug];if(!src)return esc(b?.name||b?.slug||'Bookmaker');return `<span class=\"fmb-book-logo\" data-b46-book-logo=\"${esc(b.slug)}\" aria-label=\"${esc(b.name)}\"><img src=\"${esc(src)}\" alt=\"${esc(b.name)}\" loading=\"lazy\" decoding=\"async\" referrerpolicy=\"no-referrer\"></span>`}\n"
)
s=s[:fn_end]+book_fn+s[fn_end:]

old='<b>${esc(b.name)}</b><i></i></button>'
new='<b>${bookLabelHtml(b)}</b><i></i></button>'
if s.count(old)!=1: raise SystemExit('BOOK_LABEL_USE_COUNT_'+str(s.count(old)))
s=s.replace(old,new,1)

# Make affiliate-price clicks explicitly escape surrounding UI click handlers without preventing navigation.
old_start="document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-fmb-book]');if(btn){e.preventDefault();e.stopPropagation();chooseBook(btn)}},true);"
new_start="document.addEventListener('click',e=>{const affiliate=e.target.closest?.('a[data-b46-affiliate-odds]');if(affiliate){e.stopPropagation();return}const btn=e.target.closest?.('[data-fmb-book]');if(btn){e.preventDefault();e.stopPropagation();chooseBook(btn)}},true);"
if s.count(old_start)!=1: raise SystemExit('CLICK_HANDLER_COUNT_'+str(s.count(old_start)))
s=s.replace(old_start,new_start,1)

css_marker='/* B46_AFFILIATE_LOGO_PRICE_STANDARD_20260928 */'
if css_marker in c: raise SystemExit('CSS_STANDARD_ALREADY_PRESENT')
c=c.rstrip()+"\n\n"+css_marker+"\n"+(
".fmb-book-logo{display:flex;align-items:center;justify-content:flex-start;width:auto;max-width:50px;height:12px;max-height:12px;overflow:hidden;pointer-events:none}\n"
".fmb-book-logo img{display:block;width:auto;height:auto;max-width:50px;max-height:12px;object-fit:contain;object-position:left center;pointer-events:none}\n"
".fmb-affiliate-odds{display:inline-block;position:relative;z-index:2;min-width:24px;pointer-events:auto;touch-action:manipulation}\n"
)+"\n"

# Semantic guards.
if '<a' in book_fn.lower(): raise SystemExit('LOGO_MUST_NOT_BE_LINK')
for url in [ONE,WH,ONE_LOGO,WH_LOGO]:
    if url not in s: raise SystemExit('EXPECTED_URL_MISSING:'+url)
if s.count('function bookLabelHtml(b)')!=1: raise SystemExit('BOOK_FN_COUNT')
if s.count('data-b46-book-logo')!=1: raise SystemExit('BOOK_LOGO_MARKER_COUNT')
if s.count('data-b46-affiliate-odds')<1: raise SystemExit('PRICE_LINK_MARKER_MISSING')
if '<td>${esc(c?.line||\'—\')}</td><td>${affiliatePriceHtml' not in s:
    raise SystemExit('LINE_PRICE_SEPARATION_MISSING')

js_path.write_text(s)
css_path.write_text(c)
print('BALL46_AFFILIATE_LOGO_PRICE_PATCH_OK')
