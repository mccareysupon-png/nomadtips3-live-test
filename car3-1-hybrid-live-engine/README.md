# รถคันที่ 3.1 — Hybrid Live Engine

สถานะเริ่มต้น: **SHADOW / RESEARCH ONLY**

โครงการนี้แยกจาก Engine 3 เดิมโดยตั้งใจ ห้ามแก้ logic, config, settlement, signal history หรือ production path ของ Engine 3 จนกว่าจะผ่าน Shadow Test และมีคำสั่งให้เชื่อมจริง

## เป้าหมาย

สร้างเครื่องยนต์ตรวจจับเงื่อนไขบอลสดที่ทำงานคล้าย Engine 3 แต่เปลี่ยนชั้นรับข้อมูลเป็น Hybrid Data Source:

1. ดึง Live Match + Live Stats จากแหล่งเว็บสาธารณะที่อนุญาตให้เข้าถึงได้
2. Normalize ข้อมูลเป็นสัญญากลางของ NOMADTIPS3
3. ใช้ API-Football เดิมเฉพาะข้อมูลที่จำเป็นต้องยืนยัน/เติม เช่น fixture identity, AH line/odds หรือ fallback
4. ประมวลผล minute window, Momentum, Attack Evidence และเงื่อนไขคัดแบบเดียวกับ Engine 3 ใน Shadow Mode
5. แสดงผลใน browser monitor ของรถ 3.1 โดยไม่ส่ง Signal จริงและไม่แตะ LINE/Settlement ของ Engine 3

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
- odds.asian_handicap (optional / API enrichment)
- collectedAt
- sourceFreshnessSeconds
- matchConfidence

## กติกาความปลอดภัยของข้อมูล

- ห้ามเดา fixture ID หรือจับคู่ทีมแบบชื่ออย่างเดียว
- Match resolver ต้องใช้ชื่อทีม + ลีก + เวลาเริ่มแข่ง และบันทึก confidence
- ข้อมูลเว็บกับ API ต้องเก็บ source provenance แยกกัน
- ถ้า match confidence ต่ำหรือข้อมูลสำคัญขาด ให้ `UNMATCHED/PASS` ไม่ฝืนสร้าง candidate
- Scraper ต้อง rate-limit และใช้ cache; ห้าม CAPTCHA bypass, login bypass หรือหลบระบบป้องกันเว็บไซต์
- แหล่งเว็บที่ Terms ห้าม scraping จะไม่ใช้เป็น production scraper

## Phase 0 — เปิดโครงการ (ปัจจุบัน)

- [x] แยก branch จาก main
- [x] สร้าง namespace `car3-1-hybrid-live-engine/`
- [x] ล็อกสถานะ SHADOW
- [x] กำหนด normalized contract
- [x] กำหนด source policy
- [ ] สร้าง source adapter ตัวแรก
- [ ] สร้าง API enrichment adapter
- [ ] สร้าง match resolver
- [ ] สร้าง shadow comparator เทียบกับ Engine 3/API
- [ ] สร้าง browser monitor

## Definition of Done สำหรับ Shadow POC

ก่อนพิจารณาเชื่อมกับ production ต้องมีหลักฐานอย่างน้อยว่า:

- source coverage เพียงพอในช่วงบอลสดจริง
- ค่าสถิติหลักตรง/ใกล้เคียง API ในระดับที่วัดได้
- ความหน่วงของข้อมูลถูกบันทึก
- match resolver ไม่มีการจับคู่ผิดในชุดทดสอบ
- API requests ลดลงจริงเมื่อเทียบกับ Engine 3 full scan แบบเดิม
- source failure แล้ว fallback ได้โดยไม่สร้าง Signal ผิด

รถคันที่ 3.1 จะยังไม่ส่ง Signal จริงจนกว่าจะผ่านเกณฑ์ข้างต้นและได้รับคำสั่งให้เปิดใช้งาน
