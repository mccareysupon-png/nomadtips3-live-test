# Event Flow V2 — integration conditions (read-only preflight)
- Check GitHub deployment run 40298791617, verified Worker version 21c1519b-5874-412a-aea7-ebee2e057f46; **live active version must be fetched again at integration time**. The registry issue #366 was stale at time of inspection (still 65c82540).
- Never use an outdated complete Worker export to deploy Event Flow. Preserve the latest Sidebar external scrollbar, Last5 concealment, Vote, Member, stats and other modules.
- Inspect active Worker code (source export or authorized authenticated Cloudflare API) to ground actual Event Flow root, plot SVG/canvas, event icon elements, signal card nodes, responsive CSS and data-to-pixel conversion.
- Do not install candidate CSS directly as it assumes its own B46 class structure; this is a design sketch until actual classes confirmed.
- Integrate layout *around* original plot without recreating event icons, timeline or pressure data, keeping all existing signal connectors unless user directs changes.
- For HOME/AWAY ensure straight SVG line connectors, not paths. O/U anchor at 50% pressure line on the signal's minute, independent of HOME/AWAY curves; O/U top or bottom based on vacant space.
- Validate widths 360, 390, 768, 1366; different event densities, multiple same-minute signals, long names, zoom 200%. If signal cards cannot fit safely, **expand vertical lane or stack**, never clip/overlap or delete them. Never claim 100% overlap-free from geometry-only tests.
- Preview only after confirming active Worker version and DOM. Confirm website across domains and basic API endpoints; capture screenshots and test keyboard/touch. Obtain explicit owner approval for Production after verified Preview.
