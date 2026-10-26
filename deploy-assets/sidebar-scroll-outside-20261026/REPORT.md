# Verified desktop sidebar external scrollbar — 26 Oct 2026

Production Worker: ball46-production
Version: 21c1519b-5874-412a-aea7-ebee2e057f46 (100%)
Deployment: f695d42a-80f3-4842-aaf7-ed09ed05de44
Activated: 2026-10-26 16:21 ICT
Source: c2a4529f970ab55d7570d8af8d60db0ba13f9555
Activation: b432e2151c3cf19d4cb6de157f7588b4d0f158ad
Branch: codex/ball46-sidebar-scroll-outside-20261026

## Scope
Homepage / and /index.html only. Desktop min-width 761px. Native external scrollbar synchronized with existing sidebar, 2px outside card, 8px track, 8px top/bottom inset. Original gutter compensated with padding; card width 210px, rows 34px, original content positions preserved. No menu children moved or recreated. Media-query cleanup restores original mobile behavior. Resize/league updates supported. Dark and light colors match existing sidebar.

Files: sidebar-scroll.js, sidebar-scroll.css, build/patch.mjs; guarded deploy run.mjs, provenance.json, manifest, request and browser proof.
No source API/data/binding/config changes. Last5 remains concealed and loader absent. Vote, jerseys, Engine343, Signal, Statistics, Member retained.

## Verification
Candidate workflow https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40298456757 SUCCESS.
Activation workflow https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40298791617 SUCCESS.
Browser: desktop default1265 and1024, Mobile390; dark/light; no horizontal overflow; same card/menu geometry; keyboard scroll synchronized. Production scrollTop387 matched track387. Console errors0. Actual Production light/dark screenshots saved locally in outputs/sidebar-scroll-outside-20261026/.
Both ball46.com and www.ball46.com:114 public paths each verified against expected hashes;6 existing APIs each passed.10051 preexisting SETTLED fingerprints preserved. All24 modules retained,23 non-main byte-identical. Bindings/settings/assets/schedules/domains/routes/bound-service versions unchanged.
HTML SHA256:48fabd8a5b1f35ab5847ecf43d09ae6cba80f77a559af6254215c62294b37a67

## Rollback
Immediate baseline65c82540-7c0f-4871-88de-9aaa1d1c73f2, deployment d51508da-2eb9-440e-a4d5-f43a6edb249d.
Use guarded restore only after fresh active ownership/config checks. Restores previous internal scrollbar while keeping Last5 concealed. Never deploy stale main.
