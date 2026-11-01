# BALL46 crisp monitor rings — verified Production release

Active version: cafa4a1b-23c0-4f10-ae97-23d02eecd3f2
Deployment: c37acd8c-4182-4d1c-a587-9be11d7e5c59
Rollback version: 04e21962-c289-4adf-8ba6-8ebb49d06a62
Source commit: 1403f8de41a99a3eb9a039408e7381af938d3345
Workflow: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41364259474
Verified browser: 2026-11-01T23:55:35.532Z

The approved CSS now uses fixed SVG geometry with linear stroke-dashoffset movement at the same 3.2-second period, removes the arc shadow, and preserves reduced-motion behavior. Ring sizes, colours, percentages, probability calculation and update cadence remain unchanged.

The current Cloudflare runtime was captured before staging. The live monitor stylesheet and script matched the approved source hashes on their actual HTML-referenced URLs. All 36 previous modules were retained except the reversible outer-entrypoint extension; the existing asset bundle was kept and one versioned CSS text module added. Old stylesheet-version URLs remain delegated to the previous runtime.

Verification passed on candidate and Production: desktop dark/light and 390px mobile dark; moving beam, stationary geometry, reduced motion, three original monitor rings, unchanged sample percentages; zero browser exceptions or console errors. Six read-only health/API checks passed on each of ball46.com and www.ball46.com. 12169 previously settled records retained their protected fields. Service versions, bindings, settings and cron remained unchanged apart from version provenance annotations.

The audit browser suppressed only its own Cloudflare RUM writes and prevented provider-bound Full Odds requests. Full Odds was not exercised end-to-end. No production telemetry or provider-request logic was edited. The original 36 preview cases passed across sizes, themes and device-pixel scales.

Only the monitor CSS reference receives a new cache version. To revert, restore traffic to 04e21962-c289-4adf-8ba6-8ebb49d06a62 only while the active version belongs to this release, then verify prior public bytes, configuration, service versions, protected data and health. No data migration or broad cache purge is needed.
