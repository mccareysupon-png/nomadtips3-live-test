#!/usr/bin/env python3
from pathlib import Path

path = Path("index.html")
text = path.read_text(encoding="utf-8")

old_css = '.team{text-align:center;min-width:0}.crest{display:grid;place-items:center;width:48px;height:48px;margin:0 auto 9px;border:1px solid #484848;border-radius:50%;background:#1b1b1b;color:var(--muted);font-size:15px;font-weight:950}.team-name{font-size:18px;font-weight:900;overflow-wrap:anywhere}.team-side{margin-top:5px;color:var(--muted);font-size:8px;letter-spacing:.13em}'
new_css = '.team{text-align:center;min-width:0}.crest{position:relative;width:48px;height:48px;margin:0 auto 9px}.crest::before{content:"";position:absolute;inset:2px 1px 1px;background:var(--shirt,#2563eb);clip-path:polygon(25% 9%,40% 2%,60% 2%,75% 9%,98% 28%,82% 44%,72% 35%,72% 96%,28% 96%,28% 35%,18% 44%,2% 28%);filter:drop-shadow(0 2px 2px rgba(0,0,0,.32))}.crest::after{content:"";position:absolute;top:3px;left:50%;width:14px;height:8px;border-radius:0 0 10px 10px;background:#222;transform:translateX(-50%)}.team-name{font-size:18px;font-weight:900;overflow-wrap:anywhere}.team-side{margin-top:5px;color:var(--muted);font-size:8px;letter-spacing:.13em}'

old_home = '<div class="team"><div class="crest" data-k="homeInitial">H</div><div class="team-name" data-k="home">Home</div><div class="team-side">HOME</div></div>'
new_home = '<div class="team"><div class="crest" data-k="homeJersey" aria-label="Home team shirt"></div><div class="team-name" data-k="home">Home</div><div class="team-side">HOME</div></div>'
old_away = '<div class="team"><div class="crest" data-k="awayInitial">A</div><div class="team-name" data-k="away">Away</div><div class="team-side">AWAY</div></div>'
new_away = '<div class="team"><div class="crest" data-k="awayJersey" aria-label="Away team shirt"></div><div class="team-name" data-k="away">Away</div><div class="team-side">AWAY</div></div>'

old_initial = "    const initial=n=>String(n||'?').trim().charAt(0).toUpperCase();"
new_initial = """    const shirtPalette=['#2563eb','#dc2626','#f59e0b','#16a34a','#7c3aed','#0891b2','#e11d48','#f97316','#4f46e5','#65a30d'];
    function shirtColor(name,avoid=''){
      let hash=0;for(const ch of String(name||''))hash=((hash<<5)-hash)+ch.charCodeAt(0);
      let index=Math.abs(hash)%shirtPalette.length;
      if(shirtPalette[index]===avoid)index=(index+3)%shirtPalette.length;
      return shirtPalette[index];
    }"""

old_render = "      node(root,'home').textContent=home;node(root,'away').textContent=away;node(root,'homeInitial').textContent=initial(home);node(root,'awayInitial').textContent=initial(away);"
new_render = """      node(root,'home').textContent=home;node(root,'away').textContent=away;
      const homeShirt=shirtColor(home),awayShirt=shirtColor(away,homeShirt);
      node(root,'homeJersey').style.setProperty('--shirt',homeShirt);node(root,'awayJersey').style.setProperty('--shirt',awayShirt);
      node(root,'homeJersey').setAttribute('aria-label',`${home} shirt`);node(root,'awayJersey').setAttribute('aria-label',`${away} shirt`);"""

replacements = [
    (old_css, new_css, "jersey CSS"),
    (old_home, new_home, "home jersey markup"),
    (old_away, new_away, "away jersey markup"),
    (old_initial, new_initial, "shirt palette"),
    (old_render, new_render, "jersey rendering"),
]

for old, new, label in replacements:
    if new in text:
        continue
    if old not in text:
        raise SystemExit(f"Could not find {label} target")
    text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Applied compact team jersey icons")
