# BALL46 member promotion — local visual preview only
Preview: http://127.0.0.1:8826/?status=live
Production is not modified by this preview.

Placement: one card above Featured Match in the desktop right rail; one card above Featured Match in the mobile match Summary. The existing mobile Stats clone does not receive another promotion.

Copy:
- BALL46 MEMBER
- MATCHDAY. UPGRADED.
- Go beyond the score.
- Explore membership

The copy describes a membership experience without unsupported feature, price, result or earnings claims.
Destination is the existing BALL46 member pricing page: https://member.ball46.com/pricing
The entire card is a link, opening in a separate tab.

Design: original supplied photograph, model at right, deep emerald fade at left, white heading and soft lime accent/CTA. No border; restrained shadow and 14px corners.
Light mode: mint-white fade, evergreen headline/accent and green CTA with white text. The card follows the existing saved BALL46 theme choice, including mobile layouts that force the surrounding page dark. Desktop/mobile light palettes and switching back to dark were visually verified; there are no storage writes.
Height: desktop 156px, mobile 160px.
Only the letters in UPGRADED move 2.5px with staggered timing. The automatic sequence ends within 1.5 seconds; hover/focus can replay it. The image does not animate. Reduced-motion preference disables letter motion.

Graphic asset: original user PNG copied without pixel edits or regeneration. SHA256 dbb1ef14850bc290ba4af4ab26f61b4efa45fdefb98482daef5ce36887f89f73. Current original size is 2,357,935 bytes; this prototype keeps the original intact. Production image encoding is not part of this local-only preview.

No fetch, polling, subscription, payment, Engine or Signal logic is introduced by the component. It only reads the existing nomad343_dashboard_theme_v1 preference; it never writes storage. The local harness supplies clearly marked fictional fixtures and intercepts API paths; it never calls 5USD.
Existing website styles/scripts are read from Production for layout context. The component files and photograph remain local.

References consulted:
- https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion
- https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html

The previously approved 5s live-display task was already deployed and verified before this design work started. Its Production version is 79966896-1609-4df8-976b-f29438a5d9be; this member promotion is not included in that deployment.


