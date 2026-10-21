# BALL46 — Crawlable search favicon

สถานะ SUCCESS — ตรวจ Production จริงหลัง Deploy แล้ว

สร้าง PNG 192×192 และ ICO 32/48px จาก inline SVG BALL46 เดิม (ball สีขาว / 46 สีเขียว / พื้นดำ) ไม่ออกแบบแบรนด์ใหม่ เปิดไฟล์จริงได้ใน browser PNG natural192×192 และ ICO natural48×48

- Repository: mccareysupon-png/nomadtips3-live-test
- Branch: codex/ball46-search-favicon-20261021
- Baseline source branch / commit: codex/ball46-seo-english-metadata-20261021 / ec7f0687cba1fa6d3c5505eb5a3d4dac399e74ed
- Source Commit: d52864cf58276fb575fa70947cb5166080a92da1
- Activation Commit: 28b86dacf75feaa3c18b341ed60824191c44c9a0
- Candidate CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39614143088
- Production CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39614520233
- Worker: ball46-production
- Active Version: 5dc795f3-6382-441f-ae3e-d617c63e9c71 — 100%
- Deployment: 6f96184d-9089-4517-9ba5-87e77e127329

ไฟล์ Production ที่แก้: index.js เพิ่ม helper เสิร์ฟภาพ PNG/ICO แบบ bytes จาก main module เฉพาะ GET/HEAD สอง path และเปลี่ยน link rel=icon ภายใน head เฉพาะหน้า /, /index.html, /signal.html, /statistics.html เป็น /favicon-192.png sizes192x192 typeimage/png เนื้อหาอื่นในแต่ละหน้า byte exact และ inverse diff คืนทุกไบต์ Worker เดิมได้ อีก10 modules คง hash เดิม keep_assets:true คง ASSETS ทั้งหมด

ตรวจทั้ง ball46.com และ www.ball46.com: /favicon-192.png และ /favicon.ico จาก404เป็น200 Content-Type image/png และ image/x-icon ถูกต้อง GET bytesตรงhash และ HEAD200ไม่มีbody และContent-Lengthตรงขนาดเมื่อมีheader (ICOผ่านedgeไม่ส่งContent-Length) Cache-Control public,max-age86400 ETagตรงhash ไม่มี X-Robots-Tag ขวาง robots.txt อนุญาต pathภาพ ไอคอน URLคงที่

Syntaxและtests10รายการผ่าน BrowserQA Desktop1366×768 Light/Dark และMobile390/360รวม4กรณีผ่าน geometry/stylesเทียบbaselineคงเดิม metadata Title/Description/JSON-LD/canonical/robotsตรงเดิม ไม่แก้โค้ดหน้าเว็บหรือระบบฟุตบอล Console error/warnว่าง Public root+82pathsเดิมและ2icon paths รวม85 HTTP200ตรงintendedhash มี optional /color-semantics-stat-entry-20261011.js404เดิมคงstatus/hash1จุด Health5endpointsผ่าน boardไม่stale ข้อมูลSETTLEDเดิม 8839 รายการเทียบฟิลด์ที่ตรวจครบ bindings/settings/cron/domains/routesคงเดิม

ไม่แก้ Main logo, Member, API, Engine, Signal, Odds, Ledger, Settlement, Featured V10 หรือขนาดการ์ดแข่งขัน SEOภาษาอังกฤษจากงานก่อนเก็บไว้ครบ

Rollback baseline ed2951df-146e-4768-96a1-c3b97d3a2832 ขั้นตอนใน rollback.json ตรวจ ownership ก่อนคืนtraffic เพื่อไม่ทับงานแชทอื่น ยังไม่เรียกใช้ rollback

ไอคอนเว็บไซต์พร้อมให้ crawlerดาวน์โหลดแล้ว ไม่ใช่หลักฐานว่า Google Searchแสดงโลโก้แล้ว Googleต้องrecrawl/processใหม่และไม่รับประกันการแสดงผลทันที ตาม https://developers.google.com/search/docs/appearance/favicon-in-search ไม่มีการอ้างว่าได้ส่ง URL Inspection request

หมายเหตุ QA: ภาพแรกของการสลับธีมจับระหว่างการอัปเดตสี จึงเก็บ before-initial-cases.json ไว้ และตรวจ Dark ซ้ำกับ immutable baseline ed2951df พร้อม Production หลังสีอัปเดตครบ ผลเปรียบเทียบ4กรณีผ่านโดยไม่เปลี่ยนเกณฑ์ตรวจสีหรือแก้ CSS
