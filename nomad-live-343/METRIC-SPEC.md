# NOMAD ENGINE 3.43 — 5USD ONE STOP ATTACK — METRIC SPEC

สถานะ: Settings Skeleton V1

## หลักฐาน 6 ตัว

| Metric | หน่วยใน Settings | วิธีคำนวณเข้า Gate |
|---|---|---|
| Shot on Target | ครั้ง | cumulative ล่าสุด - cumulative ต้น Rolling Window |
| Shot off Target | ครั้ง | cumulative ล่าสุด - cumulative ต้น Rolling Window |
| Corner | ครั้ง | cumulative ล่าสุด - cumulative ต้น Rolling Window |
| Dangerous Attack | % | Delta ฝั่งนี้ / (Delta Home + Delta Away) × 100 |
| Attack | % | Delta ฝั่งนี้ / (Delta Home + Delta Away) × 100 |
| Ball Possession | % | ใช้เปอร์เซ็นต์ล่าสุดจาก provider ไม่ทำ Delta |

## กฎ null

- ค่า provider หาย = `null`
- ห้ามแปลง `null` เป็น `0`
- Rolling history ไม่พอ = metric นั้นยังไม่พร้อม
- Dangerous Attack / Attack ถ้า Delta รวมสองฝั่ง = 0 ให้คืน `null`

## สูตร Rolling

`delta = max(0, current - previous)`

`homeSharePct = homeDelta / (homeDelta + awayDelta) * 100`

`awaySharePct = 100 - homeSharePct`

## ตลาด

- OVER: evidence ใช้ `>=`
- UNDER: evidence ใช้ `<=`
- 1X2: evidence ใช้ `>=`
- Asian Handicap: evidence ใช้ `>=`

ทุกตลาดใช้ metric contract เดียวกัน เพื่อลดการตีความไม่ตรงกันระหว่าง engine

## Source target

- Live fixture / score / minute: 5DollarFootballAPI
- Evidence stats: 5DollarFootballAPI
- Odds / line: Bet365 data delivered by 5DollarFootballAPI

จุดที่ยังต้องรอ vendor ยืนยันก่อน wire engine จริง:
1. `status=live&include=stats&per_page=500` ได้ทุก live fixture + inline stats ใน 1 request ตามที่คุยหรือไม่
2. stats payload จริงมี Attack / Dangerous Attack / SOT / SOFF / Possession ครบตาม coverage หรือไม่
3. Corner, live score, minute/status field จริงใน payload
4. update cadence / latency
5. `include=events,stats` + live 500 ยังนับ 1 request หรือไม่

ห้ามนำ Settings V1 นี้ไปเชื่อม endpoint ของ 3.41 หรือ 3.42 โดยตรง