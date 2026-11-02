# Motagua — CD Marathon: แพตช์รายการซ้ำที่ค้าง AWAITING

ขอบเขต: ระเบียน `203745645-ft_ah-mvyiwfq7` เพียงรายการเดียว และการป้องกันรอบสแกนที่ทำงานซ้อนกัน ไม่มีการแก้สูตร Signal หรือสูตร Settlement

ผลทดสอบล่าสุด: ผ่าน 30 รายการ (VM 24, workerd 6) ที่ [Actions 41411682559](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41411682559) ไม่มีการ Upload Worker, Deploy, เปลี่ยน Traffic หรือแก้ข้อมูล Production รายงานละเอียดอยู่ใน `evidence/` บนเครื่อง และ `repair-audit/` บนสาขาทดสอบ

## หลักฐานจาก Production

- Engine: `nomadtips3-engine-343`, version `1f2336fa-7b45-4a23-a23c-06d01a92330d`, deployment `ede913e3-6c9d-403d-9fba-c8494922e46d`
- Main module: `index-bulk-recovery.js`, SHA256 `1008c06d4ab705f904b49408fd4e5c347478afae633a499147f3106dfffd2b69`
- Website: version `224cac7e-11fe-4549-a462-8f2f0e3ef25f`, deployment `72ff0133-fe30-4a5c-8e7b-f78eb8dfaf6e`
- เก็บสถานะ Bindings, compatibility, schedules และ Website deployment ใน `repair-audit/preflight.json` บนสาขาทดสอบ
- ระเบียนที่ตัดแล้ว: `203745645-ft_ah-mvyiwh1q`, SETTLED / PUSH, entry และ final 2–0, ตัดผลแล้วเวลา 08:09:58.458 น. วันที่ 2 พ.ย. 2569
- ระเบียนค้าง: `203745645-ft_ah-mvyiwfq7`, PENDING, บันทึกก่อนอีกระเบียน 1,711 ms; รายละเอียดราคาและหลักฐานเหตุการณ์ที่เปรียบเทียบตรงกัน

ตัวเลขและเวอร์ชันข้างต้นเป็นหลักฐาน ณ เวลาตรวจ ต้องอ่านสถานะจริงอีกครั้งก่อน Deploy

## สาเหตุ

1. Ledger ใช้ createdAt และ ID เป็นกุญแจ จึงเก็บสองระเบียนของเหตุการณ์เดียวกันแยกกัน
2. การกระทบยอดและการตรวจผลจบวนเฉพาะ Working Signals; ระเบียนที่หลุดจาก Working Signals แต่ยังอยู่ใน Ledger จึงไม่ถูกอัปเดตต่อ
3. เส้นทาง POST /scan เรียก scan โดยตรง ขณะที่ scanIfDue มีตัวล็อกของตนเอง จึงมีช่องให้สแกนซ้อนกันได้ แพตช์ปิดช่องนี้ แต่หลักฐานที่มีไม่ใช่ log ยืนยันว่าการซ้อนรอบคือเหตุการณ์ต้นกำเนิดครั้งนั้นแน่นอน

การแก้ข้อความ AWAITING เป็น PUSH บนหน้าจออย่างเดียวไม่แก้ระเบียนซ้ำ และการตัด PUSH ให้ทั้งสองระเบียนจะเพิ่มยอดผลตัดสินผิด

## สิ่งที่เตรียมแก้

- ใช้ promise ร่วมกันครอบ subclass scan ทุกเส้นทาง โดยคง parent scan และฟังก์ชันตรวจจับ/ตัดผลเดิมทุกตัวอักษร
- จัดคิวเฉพาะการเขียน Ledger เพื่อป้องกันการอ่านและเขียนตัวนับทับกัน
- ย้ายระเบียนค้างที่ยืนยันว่าซ้ำออกจาก active Ledger ไปเก็บเต็มระเบียนใน journal พร้อม SHA256 และ before/after counters ภายใน transaction เดียว
- ลด ledgerTotal และ pending อย่างละหนึ่ง ไม่เพิ่ม PUSH ไม่เขียนระเบียน canonical
- เก็บ alias ป้องกันระเบียน ID เดิมถูกนำเข้าซ้ำ; ตรวจ alias เฉพาะเมื่อมี ID เป้าหมาย ไม่เพิ่มการอ่านสำหรับ Signal ทั่วไป
- เงื่อนไขต้องตรง ID เวลา สถานะ settledAt และรายละเอียดเหตุการณ์ทั้งหมด หากไม่ตรงให้ไม่เปลี่ยนข้อมูล
- คำสั่งแก้มีอายุ 30 นาทีจากการสร้างแพตช์สด ใช้รอบสแกนปกติที่มีอยู่ ไม่มีการสั่ง /scan เพิ่ม
- เพิ่มเพียงสถานะอ่านอย่างเดียวใน /ledger-health ไม่เพิ่ม API แก้ข้อมูลแบบสาธารณะ ไม่เปลี่ยนการยืนยันตัวตน

## ไฟล์

- `prepare.mjs`: อ่าน Active Version และ source จริง; ใช้ cursor อ่านสถิติโดยข้าม scanIfDue/sync ไม่ขอข้อมูลจากผู้ให้บริการเพิ่ม
- `build.mjs`: แพตช์ AST เฉพาะจุดและตรวจว่าย้อนการแทนที่แล้วได้ source เดิมตรงทุกตัวอักษร; สร้างโมดูล restore แยก
- `repair-helpers.js`, `repair-methods.js`: ตัวล็อก การเก็บระเบียนซ้ำ journal และการคืนข้อมูล
- `test.mjs`: ตรวจแพตช์กับโมดูลจริงใน VM ที่ห้าม network
- `runtime-worker.mjs`, `runtime-test.mjs`: ทดสอบใน workerd/Miniflare ที่ใช้ Durable Object แยกโดยไม่มี Production bindings; ห้ามนำ test entrypoint ไป Deploy
- `.github/workflows/ball46-ledger-motagua-test-20261102.yml`: ทดสอบเท่านั้น ไม่มีขั้น Upload Worker, Deploy หรือเปลี่ยน Traffic

## เกณฑ์ก่อนใช้จริง

ต้องผ่านทั้ง VM และ workerd tests แล้วอ่าน Engine Active Version / hash และ Website Active Version ใหม่ หากเปลี่ยนหรือ health มี error ให้หยุด ไม่ใช้ main หรือ source เก่าทับ

หากได้รับอนุญาต Deploy: สร้างแพตช์ใหม่จากเวอร์ชันจริงเดิม ตรวจทุกชุดอีกครั้ง ใช้ metadata/modules/bindings/settings ของเวอร์ชันนั้นโดยคง inherited secrets (`version_id: latest`), DO namespace, service bindings, compatibility และ Cron เดิม ห้ามเรียก candidate preview ที่ผูก Production DO เพื่อทดลอง migration ก่อนเปิดใช้งาน

หลังเปิดใช้ ให้รอรอบ Cron เดิม อ่าน /ledger-health และ statistics ผ่าน cursor ต้องพบ journal APPLIED มี archiveRetained และ hash พร้อมทั้งระเบียน canonical PUSH คงเดิม ระเบียนอื่นไม่หาย ไม่แก้ Settlement เดิม และตรวจ Website version ไม่เปลี่ยน

ถ้าไม่มีข้อมูลใหม่เข้าระหว่างดำเนินการ จำนวนที่คาดคือ ledgerTotal 12,491 → 12,490; pending 276 → 275; settled 12,215 เท่าเดิม กรณีมีข้อมูลใหม่ต้องเปรียบเทียบการเปลี่ยนแปลงตาม ID เพิ่มเติม ไม่ฝืนใช้ตัวเลข snapshot เก่า

## Rollback

เมื่อ journal เป็น APPLIED ห้ามเปลี่ยนกลับเฉพาะโค้ดแล้วถือว่าคืนข้อมูลแล้ว ใช้โมดูล restore ที่สร้างจากแพตช์เดียวกันให้รอบสแกนปกติคืน originalRow ที่ตรวจ hash แล้ว เพิ่มตัวนับจากค่าปัจจุบันอย่างละหนึ่ง และตรวจ journal เป็น RESTORED พร้อมระเบียนคืนครบ ก่อนคืน Engine code ไปยัง baseline version หาก canonical หรือ backup เปลี่ยนหรือยืนยันข้อมูลไม่ได้ ให้หยุดและรักษา journal ไว้ ไม่คืน meta snapshot เก่าทับข้อมูลใหม่

การทดสอบจำลองยืนยันเส้นทาง archive/restore ได้ แต่การเปลี่ยนข้อมูล Production และการตรวจผลหลัง Deploy ยังต้องดำเนินการภายใต้การอนุมัติของเจ้าของ

อ้างอิง API transaction และสภาพแวดล้อมทดสอบ: [Cloudflare storage transaction](https://developers.cloudflare.com/durable-objects/api/legacy-kv-storage-api/), [Miniflare](https://developers.cloudflare.com/workers/testing/miniflare/get-started/), [current v4 options adapter](https://github.com/cloudflare/workers-sdk/blob/main/packages/miniflare/src/config/v4-convert.ts)

