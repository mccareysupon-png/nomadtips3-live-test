# BALL46 — Desktop scoreboard viewport fit

สถานะ SUCCESS — ตรวจเว็บไซต์ Production จริงแล้ว

เพิ่มพื้นที่รายการแข่งขันตามความสูงหน้าจอ PC/Laptop โดยไม่เพิ่มขนาดการ์ดแข่งขัน แก้เฉพาะ CSS ของกรอบ live-stage-grid, main-board และเพดานความสูง right-rail ภายใน live panel และ breakpoint min-width:761px สูตร 100dvh ลบระยะบน 18px และล่าง 12px รองรับ resize อัตโนมัติ

- Repository: mccareysupon-png/nomadtips3-live-test
- Baseline Branch: fix/ball46-stats-leagues-nav-20261021
- Original Commit: bba7833aa3bd385adbe2730c8723eacdd1a89ba9
- Branch: codex/ball46-scoreboard-viewport-fit-20261021
- Source Commit: e63ff84c33df11355201ee190fef669382c703d4
- Activation Commit: 09b4e978a549e7547d2d03dbf04e9514efac0d6f
- Worker: ball46-production
- Active Version: d24b4a73-f89c-4f72-80c3-7031539bc51f (100%)
- Deployment: cc02723a-5dbb-4196-9ff2-4a9c05ace206
- Workflow: .github/workflows/ball46-scoreboard-viewport-fit-20261021.yml
- Candidate CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39607635010
- Production CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39608291835

ไฟล์ Production ที่เปลี่ยน: index.js เฉพาะค่าคงที่ __B46_SCOREBAR_TUNE_CSS__ ซึ่งเสิร์ฟ /dashboard-v2-tune.css ไม่มีการแก้ HTML หรือ JavaScript การทำงานเดิม inverse diff ยืนยันว่าโค้ดเดิมทั้งหมดกลับได้ตรง baseline อีก 10 modules คง hash เดิม คง ASSETS ทั้งหมดด้วย keep_assets:true

ผลตรวจ: Desktop 1920×1080,1903×905,1440×900,1366×768,1280×720 ทั้ง Light/Dark และ Mobile 390/360 รวม 12 กรณีผ่าน ช่องว่างล่างลด 140→12px เพิ่มพื้นที่เลื่อน 128px ความสูงการ์ด 69.046875px เท่าเดิม เปรียบเทียบ fixture เดียวกันยืนยันความกว้าง ฟอนต์ padding และระยะห่างคงเดิม Performance card คงเดิม ไม่มี horizontal overflow Mobile layout/styles ตรง baseline

การ์ดขยาย Event Flow และ Full Market ขนาดตรง baseline เฟรมสูง 2674.546875px ไม่ถูกตัด ทดสอบ PageDown เลื่อน boardTop 0→548px โดยการ์ดยังคงเปิด Console error/warn ว่าง ภาพก่อนและหลังอยู่ในโฟลเดอร์นี้

Syntax/build และ tests ผ่าน 10 รายการ Public root+82 paths HTTP200 ตรง hash ที่ตั้งใจ มี optional /color-semantics-stat-entry-20261011.js 404 เดิมคง hash/status เดิม 1 จุด ไม่ใช่ข้อผิดพลาดใหม่ Health 5 endpoints ผ่าน board ไม่ stale ข้อมูล SETTLED เดิม 8828 รายการเทียบฟิลด์ที่ตรวจครบ ไม่แก้ API/Engine/Signal/Ledger/กฎตัดสิน/Member bindings/settings/cron/domains/routes คงเดิมจาก CI ก่อน–หลัง

รอบแรกอัปโหลด candidate แล้วพบ GET version 404 จากการรอ Cloudflare propagation; Production ไม่เปลี่ยนตอนนั้น ตรวจยืนยัน candidate เดิมแล้วใช้ bounded read-only retry ใน runner รอบตรวจและเปิดใช้งานสุดท้ายผ่าน ไม่อัปโหลดทับด้วย source เก่า

Rollback baseline: b8ea6f51-5c57-4dc2-9583-fd6b887dad15 ขั้นตอนใน rollback.json เตรียมไว้และยังไม่เรียกใช้งาน การคืนค่าตรวจ Active ต้องยังเป็นรุ่นของงานนี้ก่อน เพื่อไม่ทับงานจากแชทอื่น
