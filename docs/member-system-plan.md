# NOMADTIPS3 — Member System Plan

สถานะ: DESIGN / NOT IMPLEMENTED
ผู้ใช้ทดสอบคนแรก: Member #0001 (Owner Test Member)

## หลักการ
- ระบบสมาชิกต้องแยกข้อมูลและสิทธิ์ของสมาชิกแต่ละคนอย่างชัดเจน
- หน้า Member ต้องใช้งานเหมือนสมาชิกจริง ไม่แสดงเครื่องมือ Owner/Admin โดยอัตโนมัติ
- ยังไม่ใช้ VPS จนกว่า Owner จะสั่งหรือมีเหตุผลทางเทคนิคที่จำเป็นจริง
- โครงสร้างปัจจุบันให้ใช้ GitHub Pages + Cloudflare Worker + Cloudflare D1 ต่อไปก่อน

## หน้าหลักของสมาชิก

### 1) Member Home / Overview
- สถานะสมาชิก: ACTIVE / EXPIRED / SUSPENDED
- Member ID
- วันที่เริ่มต้น / วันหมดอายุ
- สรุปผลงานส่วนตัว
- สัญญาณล่าสุด
- การแจ้งเตือนล่าสุด

### 2) บอลเต็ง Dashboard
- แสดง Today's Picks / NOMAD SYSTEM
- แสดงคู่ที่สมาชิกได้รับสิทธิ์ดู
- Pick, Odds, Confidence, AH, BTTS, Double Chance เท่าที่ระบบมีข้อมูล
- แสดงผล Correct / Incorrect หลังการแข่งขัน
- เก็บประวัติการเปิดดู/รับสัญญาณแยกตามสมาชิกเมื่อจำเป็น

### 3) บอลสด Dashboard
- แสดง Live Condition / Live Signals ของสมาชิก
- แสดงสกอร์สด, นาที, Momentum, AH, Live Odds และสถานะ Trigger
- ใช้ข้อมูลจากระบบ Auto Live Scanner / Adaptive Polling / Hot Zone Scanner
- แสดงเฉพาะ Signal ที่สมาชิกมีสิทธิ์ได้รับ
- ผลลัพธ์และประวัติ Signal ต้องผูกกับ member_id

## สถิติสมาชิก
สถิติเป็นรายสมาชิก ไม่ใช้สถิติรวมเป็นตัวแทนสมาชิก

ตัวอย่างข้อมูลต่อสมาชิก:
- จำนวน Picks ที่ได้รับ
- Correct / Incorrect
- Accuracy
- Streak
- Live Signals ที่ได้รับ
- ผลของ Live Signals
- ช่วงเวลาใช้งาน
- Notification delivery / read status

หมายเหตุ: สถิติส่วนกลางของระบบสามารถคงอยู่ได้ แต่ Member Dashboard ต้องมี Member-specific statistics แยกออกมา

## Notification รายสมาชิก
- สมาชิกแต่ละคนมีการตั้งค่าการแจ้งเตือนของตนเอง
- เปิด/ปิดแจ้งเตือนบอลเต็ง
- เปิด/ปิดแจ้งเตือนบอลสด
- LINE / ช่องทางอื่นต้องผูกกับ member_id
- เก็บ delivery status, sent_at, read/acknowledged เมื่อระบบรองรับ
- ห้ามส่ง Signal ของสมาชิก A ไปยังสมาชิก B

## Data Model ที่ควรเตรียม

### members
- member_id
- email / login identifier
- role: MEMBER / OWNER / ADMIN
- status
- started_at
- expires_at
- created_at
- last_login_at

### member_preferences
- member_id
- picks_notification_enabled
- live_notification_enabled
- line_enabled
- timezone
- other preferences

### member_pick_history
- member_id
- pick_id
- delivered_at
- result
- viewed_at

### member_live_signals
- member_id
- signal_id
- fixture_id
- delivered_at
- result
- viewed_at

### member_stats
อาจคำนวณจากประวัติจริงแบบ dynamic หรือเก็บ snapshot/cache เพื่อความเร็ว

### member_notification_log
- member_id
- type
- reference_id
- channel
- sent_at
- delivery_status
- read_at

## Security / Access Control
- ทุก API ของ Member ต้องตรวจ session/token ก่อนอ่านข้อมูล
- ทุก query ที่เป็นข้อมูลส่วนบุคคลต้อง filter ด้วย member_id จาก session ฝั่ง server ไม่รับ member_id จากหน้าเว็บแบบเชื่อถือโดยตรง
- Owner/Admin endpoints ต้องแยกจาก Member endpoints
- ห้ามเก็บรหัสผ่านแบบ plain text
- หากทำระบบ login เองให้ใช้ password hash ที่เหมาะสม หรือใช้ OTP / magic link / external auth provider

## Member #0001
- ใช้เป็นบัญชีทดสอบระบบแรก
- สามารถมี role OWNER ในฐานข้อมูลได้ แต่เมื่อเข้า Member UI ให้แสดงสิทธิ์แบบสมาชิกจริง
- ใช้ทดสอบทั้ง Desktop และ Mobile
- ใช้ตรวจ: login, picks, live dashboard, member stats, notifications, expiry และ access control

## Architecture — Phase 1
Frontend: GitHub Pages
Backend/API: Cloudflare Worker
Database: Cloudflare D1
Live data: API-FOOTBALL PRO
Notifications: LINE (ผูกต่อสมาชิกในอนาคต)
VPS: NOT REQUIRED / NOT PLANNED until Owner explicitly approves

## เหตุผลที่ยังไม่ต้องใช้ VPS
- จำนวนสมาชิกช่วงเริ่มต้นยังน้อย
- Worker + D1 รองรับ Member API และข้อมูลแยกสมาชิกได้
- Live scanner มีอยู่แล้วบน Worker
- ลดค่าใช้จ่ายและภาระดูแล server
- ค่อยพิจารณา VPS เมื่อมีงาน long-running, queue หนัก, websocket เฉพาะทาง, bot process ต่อเนื่อง หรือข้อจำกัด Worker ที่พิสูจน์แล้วว่าเป็นคอขวด

## ลำดับการพัฒนาแนะนำ
1. Member authentication / session
2. Member #0001
3. Member Home
4. บอลเต็ง Dashboard
5. บอลสด Dashboard
6. Member-specific Stats
7. Member-specific Notifications
8. Expiry / subscription status
9. ทดสอบ Mobile + Desktop
10. ระบบสมัคร / ชำระเงิน เมื่อระบบ Member เสถียร

## ข้อกำหนดที่ล็อกไว้ตอนนี้
- มี Dashboard บอลเต็ง
- มี Dashboard บอลสด
- แสดงผลใน Dashboard ของประเภทนั้นโดยตรง
- สถิติแยกสมาชิกแต่ละคน
- การแจ้งเตือนแยกสมาชิกแต่ละคน
- Owner เป็นสมาชิกทดสอบคนแรก (#0001)
- ไม่ย้ายหรือฝาก VPS จนกว่าจะได้รับคำสั่งจาก Owner
