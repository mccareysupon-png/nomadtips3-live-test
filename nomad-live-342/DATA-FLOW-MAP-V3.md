# NOMAD LIVE 3.42 — DATA FLOW MAP V3

สถานะ: **STEP 2 — ล็อกแผนผังสายข้อมูล**

ขอบเขตเอกสารนี้คือหน้าตั้งค่า `nomad-live-342/settings.html` และตัวตรวจจับของหน้า `nomad-live-342/index.html` สำหรับ 3 ตลาด **OVER / UNDER / 1X2** เท่านั้น

> หลักสำคัญ: หน้าตั้งค่าเป็นผู้กำหนดเงื่อนไข ไม่ใช่แหล่งข้อมูลการแข่งขัน ข้อมูลจริงต้องเดินจากผู้จ่ายข้อมูล → ตัวแปลงข้อมูล → ตัวตรวจจับ → เงื่อนไขของแต่ละตลาด

## 1. ผู้จ่ายข้อมูลหลัก

### A. TotalCorner Live Score V3

Worker: `nomad-live-score-feed-v3/src/index.js`

ใช้เป็นแหล่งข้อมูลหลักสำหรับ:

- `matchId`
- ชื่อ Home / Away
- นาทีแข่งขัน
- สกอร์ปัจจุบัน
- Attack
- Dangerous Attack
- Corner
- Snapshot ย้อนหลังของค่าข้างต้น
- Freshness ของ Live Score

Contract ปัจจุบันของ V3 ตั้ง `sot:false`, `off:false` และ Snapshot ส่ง `sot:[null,null]`, `off:[null,null]` ดังนั้น **ห้ามใช้ V3 เป็นแหล่ง Shot on Target หรือ Shot Off**

### B. Market Worker / API-Football Candidate

Worker: `workers/nomadtips3-market-engine/src/index.js`

Endpoint ที่ Browser ใช้จริงสำหรับการสร้าง Signal คือ:

- `/candidate`

Adapter: `workers/nomadtips3-market-engine/src/api-football-candidate.js`

ภายใน `/candidate` ใช้ API-Football ดังนี้:

1. `/fixtures?live=all` — หา fixture ที่ตรงกับคู่จาก TotalCorner
2. `/odds/live?fixture=...` — ราคา 1X2 และ Over/Under พร้อมเส้น
3. `/fixtures/statistics?fixture=...` — Shot on Target, Shot Off, การครอบครองบอล

ดังนั้น **สายสร้าง Signal ปัจจุบันใช้ราคาจาก API-Football `/candidate`** ไม่ใช่ `/markets` ของ Nowgoal

## 2. จุดจับคู่ระหว่าง Live Score กับ Market

ต้นทาง Live Score ส่ง:

`home + away + minute + score`

Browser ส่ง 4 ค่านี้ไป `/candidate`

API-Football Candidate ทำการจับคู่กับ live fixture โดย:

- เทียบชื่อ Home
- เทียบชื่อ Away
- ใช้นาทีช่วยเพิ่มความมั่นใจเมื่อใกล้กัน
- ใช้สกอร์ช่วยเพิ่มความมั่นใจเมื่อเท่ากัน
- ถ้าคู่ที่ดีที่สุดยังไม่มั่นใจพอ หรือใกล้กับอันดับสองเกินไป → ไม่จับคู่

เมื่อจับคู่สำเร็จจึงได้ `fixture.id` ของ API-Football และใช้ ID นี้ดึง Odds + Statistics

**กฎ:** ถ้าจับคู่ fixture ไม่ได้ ห้ามสร้าง Signal

## 3. ตารางจับคู่ Field หน้าตั้งค่า → ข้อมูลจริง

| หน้าตั้งค่า | Config key | ผู้จ่ายข้อมูล | Field ก่อนเข้า Engine | การแปลง | Field ที่ Gate ใช้ | ถ้าข้อมูลหาย |
|---|---|---|---|---|---|---|
| นาทีเริ่ม | `minuteFrom` | Settings | ค่า Owner | ไม่แปลง | เทียบกับ `r.m.minute` | ไม่ผ่านช่วงเวลา |
| นาทีจบ | `minuteTo` | Settings | ค่า Owner | ไม่แปลง | เทียบกับ `r.m.minute` | ไม่ผ่านช่วงเวลา |
| ช่วงย้อนหลัง | `rollingWindowMinutes` | Settings | 2–30 นาที | กำหนด Window | ใช้ทั้ง Live Snapshot และ Candidate Stat History | ไม่มีประวัติพอ = หลักฐานไม่พร้อม |
| Shot on Target | `shotOnTarget` | API-Football Statistics | `Shots on Goal` หรือ `Shots on Target` | cumulative ปัจจุบัน - cumulative ก่อนหน้าใน Window | `sideEvidence.shotOnTarget` | `null` = ไม่ผ่านหลักฐานข้อนี้ |
| Shot Off | `shotOff` | API-Football Statistics | `Shots off Goal` หรือ `Shots off Target` | cumulative ปัจจุบัน - cumulative ก่อนหน้าใน Window | `sideEvidence.shotOff` | `null` = ไม่ผ่านหลักฐานข้อนี้ |
| Corner | `corner` | TotalCorner V3 | `event.snapshots[].corner[H,A]` | Snapshot ล่าสุด - Snapshot ต้น Window | `sideEvidence.corner` | `null` = ไม่ผ่าน / Rolling ไม่พร้อม |
| Dangerous Attack % | `dangerousAttackPct` | TotalCorner V3 | `event.snapshots[].dangerous[H,A]` | หา Delta ของ H/A แล้วแบ่งเป็น % รวม 100 | `sideEvidence.dangerousAttackPct` | ผลรวม Delta = 0 หรือหาย → `null` |
| Attack % | `attackPct` | TotalCorner V3 | `event.snapshots[].attacks[H,A]` | หา Delta ของ H/A แล้วแบ่งเป็น % รวม 100 | `sideEvidence.attackPct` | ผลรวม Delta = 0 หรือหาย → `null` |
| การครอบครองบอล % | `possessionPct` | API-Football Statistics | `Ball Possession` | ตัด `%` แล้วแปลงเป็นตัวเลข | `sideEvidence.possessionPct` | `null` = ไม่ผ่านหลักฐานข้อนี้ |
| ต้องการหลักฐานดังกล่าว | `evidenceRequired` | Settings | 1–6 | นับหลักฐาน 6 ตัวที่ผ่าน | `evaluateEvidence()` | ต้องมีจำนวนผ่านถึงค่าที่ตั้ง |
| เส้น Over / Under ตั้งแต่ | `lineMin` | API-Football Live Odds | `market.totals.line` | Parse จาก Over/Under market | `lineOk()` | ไม่มีเส้น = ไม่ผ่าน |
| ราคา odds ตั้งแต่ | `oddsMin` | API-Football Live Odds | 1X2 Home/Away หรือ Totals Over/Under | Decimal odds | `oddsOk()` | ไม่มีราคา/ต่ำกว่าค่า = ไม่ผ่าน |
| Home / Away / Both | `sideMode` | Settings | ค่า Owner | เลือกฝั่งตามตลาด | `marketGate()` | ค่าไม่ถูกต้อง = Settings ไม่ผ่าน Validation |
| ระยะห่างของสกอร์ตอนตรวจจับ | `scoreTrailingMax` | TotalCorner V3 | `r.m.score[H,A]` | คำนวณจำนวนประตูที่ฝั่งเลือกกำลังตามหลัง | 1X2 Gate | สกอร์หาย = ไม่ผ่าน |

## 4. นิยามค่าหลักฐาน 6 ตัว

### 4.1 Shot on Target

ฝั่งจ่าย:

`API-Football /fixtures/statistics`

ชื่อที่ยอมรับ:

- `Shots on Goal`
- `Shots on Target`

ตัวแปลง:

`parseFixtureStatistics()` → `market.statistics.home/away.shotOnTarget`

Browser เก็บประวัติไว้ใน:

`nomad342ApiFootballStatsHistoryV1`

แล้วคำนวณ Delta ตาม `rollingWindowMinutes`

### 4.2 Shot Off

ฝั่งจ่าย:

`API-Football /fixtures/statistics`

ชื่อที่ยอมรับ:

- `Shots off Goal`
- `Shots off Target`

ตัวแปลง:

`parseFixtureStatistics()` → `market.statistics.home/away.shotOff`

Browser คำนวณ Delta เหมือน Shot on Target

### 4.3 Corner

ฝั่งจ่าย:

`TotalCorner V3 event.snapshots[].corner`

Browser เก็บ/รวม Snapshot ใน:

`nomad342FootballHistoryV1`

สูตรต่อฝั่ง:

`Corner ใน Snapshot ล่าสุด - Corner ใน Snapshot ต้นช่วงย้อนหลัง`

### 4.4 Dangerous Attack %

ฝั่งจ่าย:

`TotalCorner V3 event.snapshots[].dangerous`

สูตร:

`HOME % = HOME Dangerous Delta / (HOME Dangerous Delta + AWAY Dangerous Delta) × 100`

`AWAY % = 100 - HOME %`

ดังนั้นค่าของสองทีมรวมกันเป็น 100% เมื่อมี activity ใน Window

### 4.5 Attack %

ฝั่งจ่าย:

`TotalCorner V3 event.snapshots[].attacks`

สูตร:

`HOME % = HOME Attack Delta / (HOME Attack Delta + AWAY Attack Delta) × 100`

`AWAY % = 100 - HOME %`

ดังนั้นค่าของสองทีมรวมกันเป็น 100% เมื่อมี activity ใน Window

### 4.6 การครอบครองบอล %

ฝั่งจ่าย:

`API-Football /fixtures/statistics → Ball Possession`

ใช้ค่าล่าสุดของแต่ละฝั่งใน Candidate Statistics ไม่ทำ Delta แบบจำนวน Shot

## 5. สายข้อมูลตลาด OVER

หน้าตั้งค่า:

- `shotOnTarget`
- `shotOff`
- `corner`
- `dangerousAttackPct`
- `attackPct`
- `possessionPct`
- `evidenceRequired`
- `lineMin`
- `oddsMin`
- `minuteFrom`
- `minuteTo`
- `rollingWindowMinutes`

Flow:

`TotalCorner Live Match → /candidate → API-Football Fixture Match → Odds + Statistics → rollingFootball + candidateRollingStats → HOME evidence + AWAY evidence → OVER Gate`

การผ่าน:

- หลักฐานทั้ง 6 ใช้ **ตั้งแต่** (`>=`)
- ตรวจ HOME และ AWAY แยกกัน
- ฝั่งใดฝั่งหนึ่งผ่านจำนวนหลักฐานที่กำหนด = OVER ผ่าน
- เส้นต้อง `>= lineMin`
- ราคา Over ต้อง `>= oddsMin`
- นาทีต้องอยู่ในช่วงที่ตั้ง

## 6. สายข้อมูลตลาด UNDER

ใช้ข้อมูล 6 ตัวชุดเดียวกับ OVER แต่การเปรียบเทียบกลับด้าน

การผ่าน:

- หลักฐานทั้ง 6 ใช้ **ไม่เกิน** (`<=`)
- `Home` → HOME ต้องผ่าน
- `Away` → AWAY ต้องผ่าน
- `Both` → HOME และ AWAY ต้องผ่านทั้งคู่
- เส้นต้อง `>= lineMin`
- ราคา Under ต้อง `>= oddsMin`
- นาทีต้องอยู่ในช่วงที่ตั้ง

## 7. สายข้อมูลตลาด 1X2

ใช้ข้อมูล 6 ตัวชุดเดียวกัน

การเลือกฝั่ง:

- `Home` → ตรวจ HOME
- `Away` → ตรวจ AWAY
- `Both` → เปรียบเทียบ Probability ภายในของ HOME กับ AWAY แล้วเลือกฝั่งที่สูงกว่า
- ไม่มี Draw ใน Gate ใหม่

การผ่าน:

- หลักฐานใช้ **ตั้งแต่** (`>=`)
- ฝั่งที่เลือกต้องผ่าน `evidenceRequired`
- ราคา Home/Away ที่เลือกต้อง `>= oddsMin`
- `scoreTrailingMax` ใช้สกอร์จาก TotalCorner ปัจจุบัน
- นาทีต้องอยู่ในช่วงที่ตั้ง

## 8. RUN / SAVE / STOP ไม่ใช่สายข้อมูลฟุตบอล

Storage ของ Settings V3:

- Draft: `nomad342MarketSettingsDraftV3`
- Active: `nomad342MarketSettingsActiveV3`
- RUN state: `nomad342MarketRunV3`

พฤติกรรม:

- SAVE → เก็บ Draft และหยุดตลาดนั้นเพื่อรอ RUN ใหม่
- RUN → Copy ค่าชุดนั้นเป็น Active แล้วเปิดตลาด
- STOP → ปิดการสร้าง Signal ใหม่ของตลาดนั้น

Browser Scanner อ่าน Active + RUN state ก่อนประเมินแต่ละตลาด

## 9. การส่งออกจาก Gate ไป Ledger

Browser ใหม่ใช้:

- Session Signal Store: `nomad342ApiFootballPredictionsV2`
- Outbox: `nomad342LedgerOutboxV2`
- Payload: `schemaVersion:3`

Signal ที่ส่งได้มีชนิด:

- `1X2`
- `OVER`
- `UNDER`

แต่ละ Signal พก:

- pick
- line (ถ้ามี)
- odds
- probability
- settings snapshot
- gate evidence ที่ใช้ตัดสิน

Ledger V3 ตรวจซ้ำ:

- ชนิดตลาด
- นาที
- Settings range
- Odds ขั้นต่ำ
- Line ขั้นต่ำ
- หลักฐาน 1–6
- Home/Away/Both
- scoreTrailingMax ของ 1X2
- ห้าม OVER และ UNDER อยู่ใน payload เดียวกัน

## 10. Fail-closed ที่ล็อกไว้ในสายข้อมูล

- API-Football หา fixture ไม่เจอ → ไม่มี Signal
- Odds 1X2 หรือ O/U ไม่ครบ → ไม่มี Candidate
- Statistics HOME/AWAY จับคู่ไม่ได้ → `statistics_incomplete`
- Shot on Target / Shot Off / Possession หาย → ค่านั้นเป็น `null` ไม่ใช่ 0
- TotalCorner Snapshot ไม่พอ → Rolling Football ไม่พร้อม
- Attack/Dangerous/Corner ขาด → Rolling Football ไม่พร้อม
- หลักฐาน `null` → ข้อนั้นไม่ผ่าน
- Odds ต่ำกว่า Settings → ไม่ผ่าน
- Score หายสำหรับ 1X2 → ไม่ผ่าน

## 11. จุดต่อที่ตรวจพบและต้องส่งต่อ STEP 3

รายการต่อไปนี้ **ไม่ใช่สายที่ไม่รู้ต้นทางแล้ว** แต่เป็นจุดที่ STEP 3 ต้อง Normalize/จูนให้เข้าจังหวะเดียวกัน:

1. TotalCorner Rolling ใช้ `match minute` เป็นแกนเวลา แต่ API-Football Shot history ปัจจุบันใช้ `observedAt` เป็น Window จึงต้องตรวจ alignment ตอนจูน
2. API-Football Shot delta ต้องมีอย่างน้อย 2 Statistics samples ก่อนจึงได้ Delta; sample แรกเป็น `null` โดยตั้งใจ
3. Possession ใช้ค่าล่าสุด ไม่ใช่ rolling delta
4. Candidate price path ที่ใช้สร้าง Signal คือ API-Football `/odds/live`; Nowgoal `/markets` ยังเป็นอีกสายและไม่ได้เป็นผู้จ่ายราคาของ Candidate Gate V3
5. TotalCorner history และ Candidate statistics history เก็บฝั่ง Browser; reload ทำให้ Candidate Statistics history เริ่มสร้างใหม่
6. Market Candidate มี `observedAt` แต่ Gate V3 ปัจจุบันยังไม่ได้บังคับ Maximum Price Age; เรื่อง freshness เป็น Safety Gate ขั้นถัดไป
7. Browser Store ปัจจุบันล็อกด้วย `matchId` หลังได้ Signal ชุดแรก ดังนั้นการยอมให้ตลาดอื่นในคู่เดิมยิง Signal ภายหลังต้องตัดสินใน STEP 4 เรื่อง Market Lock โดยเฉพาะ

## 12. สรุป STEP 2

สายข้อมูลทุกหัวข้อบน Settings V3 มีผู้จ่ายและผู้รับที่ระบุได้แล้ว:

- **Minute / Score / Attack / Dangerous Attack / Corner** → TotalCorner Live Score V3
- **Shot on Target / Shot Off / การครอบครองบอล** → API-Football Live Statistics
- **1X2 Odds / O-U Line / O-U Odds** → API-Football Live Odds ผ่าน `/candidate`
- **เงื่อนไข Owner** → Market Settings V3
- **ตัวตัดสิน** → `api-football-candidate-layer.js`
- **ด่านตรวจซ้ำ** → `nomadtips3-342-ledger`
- **ผลจบเกม** → TotalCorner V3 `/finals`

STEP 2 ถือว่า **Mapping Complete** เมื่อใช้เอกสารนี้เป็นสัญญาในการทำ STEP 3 และไม่เปลี่ยนผู้จ่ายข้อมูลโดยไม่แก้ Data Flow Map ก่อน
