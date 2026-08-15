# รถคันที่ 3.1 — Hybrid Live Engine

สถานะปัจจุบัน: **SHADOW / RESEARCH ONLY · GOALOO-ONLY SOURCE MODE**

โครงการนี้แยกจาก Engine 3 เดิมโดยตั้งใจ ห้ามแก้ logic, config, settlement, signal history หรือ production path ของ Engine 3 จนกว่าจะผ่าน Shadow Test และมีคำสั่งให้เชื่อมจริง

## เป้าหมาย

สร้างเครื่องยนต์ตรวจจับเงื่อนไขบอลสดที่ทำงานคล้าย Engine 3 แต่มีชั้นข้อมูลและจอวิเคราะห์ที่ละเอียดกว่า โดยสถานะปัจจุบันใช้ Goaloo เป็นแหล่งข้อมูลเดียวในเส้นทำงาน:

1. ดึง Live Match + Live Stats + Odds จาก Goaloo เมื่อ source policy และวิธีเข้าถึงผ่านการตรวจสอบแล้ว
2. Normalize ข้อมูลเป็นสัญญากลางของ NOMADTIPS3
3. เก็บ Snapshot ตามเวลาเพื่อสร้างกราฟ, Momentum, Attack Evidence Delta และ Event/Price Timeline
4. ประมวลผล minute window, Momentum, Attack Evidence และเงื่อนไขคัดที่ยกฐานจาก Engine 3 ใน Shadow Mode
5. แสดงผลใน browser monitor ของรถ 3.1 โดยไม่ส่ง Signal จริงและไม่แตะ LINE/Settlement ของ Engine 3

## Source architecture ปัจจุบัน

ค่าใช้งานถูกล็อกเป็น:

- `PRIMARY = GOALOO`
- `FALLBACK = OFF`
- `BACKUP = OFF`
- `API VERIFY = OFF`
- `CORE STATS = REQUIRE`
- `DATA CONFLICT = PASS`

API-Football และ backup adapter **ไม่ถูกลบ** แต่เป็น dormant module เพื่อให้เปิดใช้ได้ภายหลังหากโครงสร้าง Goaloo เปลี่ยนหรือเจ้าของสั่งเปลี่ยน architecture ใหม่ การ normalize config จะบังคับค่าข้างต้นเพื่อไม่ให้ browser config เก่ากลับมาเปิด API-Football เอง

## ชื่อโครงการ

- Display name: `รถคันที่ 3.1`
- Technical name: `CAR 3.1 HYBRID LIVE ENGINE`
- Branch: `feature/car3-1-hybrid-live-engine`

## Data contract ขั้นต้น

ข้อมูลกลางต่อหนึ่งแมตช์ต้องรองรับอย่างน้อย:

- source
- sourceMatchId
- canonicalMatchId
- league
- country
- kickoffUtc
- minute
- status
- home / away
- score.home / score.away
- stats.possession
- stats.attacks
- stats.dangerous_attacks
- stats.shots
- stats.shots_on_target
- stats.corners
- stats.red_cards
- odds.1x2
- odds.asian_handicap
- odds.over_under
- collectedAt
- sourceFreshnessSeconds
- matchConfidence

## กติกาความปลอดภัยของข้อมูล

- ใช้ Goaloo sourceMatchId เป็น identity หลัก และห้ามสร้าง source ID ปลอม
- ถ้าข้อมูลสำคัญขาด, stale หรือ parse ไม่มั่นใจ ให้ `PASS/WAIT` ไม่ฝืนสร้าง candidate
- Collector ต้อง rate-limit และใช้ cache; ห้าม CAPTCHA bypass, login bypass หรือหลบระบบป้องกันเว็บไซต์
- หากโครงหน้า/โครงข้อมูล Goaloo เปลี่ยน ให้เปลี่ยน adapter/normalizer ตาม source โดยไม่ลดเงื่อนไขคัดเพื่อให้ระบบยังส่งสัญญาณต่อ
- ทุก Snapshot ต้องเก็บ provenance ว่ามาจาก source ไหนและเวลาใด

## สิ่งที่สร้างแล้ว

- [x] แยก branch จาก main
- [x] สร้าง namespace `car3-1-hybrid-live-engine/`
- [x] ล็อกสถานะ SHADOW
- [x] กำหนด normalized contract
- [x] สร้าง Engine 3 base condition config + CAR 3.1 advanced settings
- [x] สร้าง Browser Live Detection dashboard พร้อมกราฟและ decision gates
- [x] สร้างหน้า Settings สำหรับ CAR 3.1
- [x] ล็อก Goaloo-only source mode และปิด API-Football/Fallback/Backup
- [ ] สร้าง Goaloo collector จริง
- [ ] สร้าง Snapshot store
- [ ] สร้าง Goaloo parser/adapter regression tests จากข้อมูลจริง
- [ ] สร้าง Shadow comparator ด้าน coverage/latency/data completeness
- [ ] เชื่อม live data จริงเข้ากับ browser monitor

## Definition of Done สำหรับ Shadow POC

ก่อนพิจารณาเชื่อมกับ production ต้องมีหลักฐานอย่างน้อยว่า:

- Goaloo coverage เพียงพอในช่วงบอลสดจริง
- Score/minute/core stats/odds ถูก parse ได้ต่อเนื่องในลีกที่ทดสอบ
- ความหน่วงและ freshness ถูกบันทึก
- Goaloo sourceMatchId ไม่ชนและไม่เปลี่ยนระหว่างแมตช์
- DOM/data structure เปลี่ยนแล้วระบบ fail-safe เป็น `WAIT/PASS` แทนการสร้าง Signal ผิด
- Collector load และ refresh rate ไม่สร้างภาระเกิน source policy

รถคันที่ 3.1 จะยังไม่ส่ง Signal จริงจนกว่าจะผ่านเกณฑ์ข้างต้นและได้รับคำสั่งให้เปิดใช้งาน
