# BALL46 live clock presentation

Status: **SUCCESS**, verified directly on https://ball46.com

- LIVE clock text uses the existing red theme token. Only the terminal minute apostrophe blinks at1s with opacity; label/numeric minute remain static. Reduced-motion preference retains a static apostrophe.
- rowClockHtml and rowHtml markup only; original clockLabel/minute calculation, live APIs, scores, teams, data logic and all 79 unrelated assets unchanged. HTML adds scoped CSS and updates script cache key; Worker main unchanged.
- 16 unit/upload/cutover/runtime tests pass. Candidate and Production Desktop Light/Dark, mobile360/390/430, Signal, Scheduled and Finished checks pass. Live blink is running; scheduled/FT clocks stay unchanged. Clock typography/geometry and team/score styles match baseline for matched fixtures.
- Source: 304e7b93c9663b35126286637dcc9abcd46a5053; creator run:39104173274. Activation: cb1c5696ccead7f4e4e4329febdf6e87bc2c700b; run:39104533604. Both SUCCESS. Active: df6833ed-7214-472c-b532-c0e874b6a63b, 100%; deployment:a4e8c5b6-188e-43d6-8e25-0295d0063440.
- Public paths: 82 returned HTTP 200 with intended hashes; 5 backend GET checks healthy; protected settled fingerprints:8004. Settings/bindings/Cron/domains/routes unchanged.
- Rollback:f9a9e186-7581-4de3-97c8-376fea69aa19 with ownership/config checks.

[Registry](./deployment-registry.json) · [Desktop](./production-desktop-light.png) · [Mobile](./production-mobile-390.png)
