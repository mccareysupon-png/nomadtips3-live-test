# CAR 3.1 — Source Research

วันที่เริ่มต้น: 2026-08-15

## 1. Alerts.bet — Candidate สำหรับ Public Shadow Collector

หน้า public Live Matches แสดงข้อมูลที่ตรงกับ Core Stats ของ Engine 3 หลายรายการในตารางเดียว ได้แก่:

- Match time / score
- Home / Away
- Possession
- Shots on Target
- Shots off Target
- Total Shots
- Attacks
- Dangerous Attacks
- Corners
- Yellow / Red cards
- 1X2 odds (บางคู่เป็น N/A)

Policy สำหรับ POC:

- ใช้เฉพาะ public page ที่ไม่ต้อง login
- interval เริ่มต้นไม่น้อยกว่า 60 วินาที
- cache response ก่อน parse
- ห้าม bypass auth/CAPTCHA/anti-bot
- ถ้า Terms เปลี่ยนหรือมีข้อห้าม automated extraction ให้ disable adapter ทันที

สถานะ: `POC_CANDIDATE`

## 2. Nowgoal — Research Reference Only

Nowgoal มีข้อมูลสถิติที่ต้องการ เช่น Shots, Shots on Goal, Attacks, Dangerous Attacks, Possession และ Corners แต่ Terms of Use ที่ตรวจพบระบุไม่อนุญาต automated scraping/data scraping

ดังนั้นรถ 3.1 จะ **ไม่สร้าง production scraper สำหรับ Nowgoal** เว้นแต่มีช่องทาง API/permission ที่อนุญาตชัดเจน

สถานะ: `SCRAPING_BLOCKED_BY_TERMS`

## 3. API-Football — Existing Enrichment / Fallback

ใช้ API เดิมเฉพาะเมื่อมีเหตุผล เช่น:

- resolve/verify fixture identity
- เติม AH line / AH odds
- fallback เมื่อเว็บ source ไม่มีข้อมูลสำคัญ
- compare ใน Shadow Test

ต้องเรียกผ่าน shared guard/cache ของ NOMADTIPS3 เมื่อเชื่อมจริง เพื่อหลีกเลี่ยงการสร้างเส้นยิง API ซ้ำ

สถานะ: `APPROVED_EXISTING_SOURCE`

## Source priority รุ่นแรก

1. Public web source ที่ผ่าน source policy
2. Local normalized cache
3. API-Football enrichment เฉพาะ candidate ที่ต้องการข้อมูลเพิ่ม
4. ถ้าข้อมูลไม่พอ -> PASS / UNMATCHED

หลักสำคัญ: ไม่มี source ใดมีสิทธิ์สร้างค่าที่ไม่มีจริง และ provenance ของทุก field ต้องตรวจย้อนกลับได้
