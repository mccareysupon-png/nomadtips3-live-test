# NOMAD LIVE 3.42 — STEP 2 SOURCE AUDIT

Status: SOURCE AUDIT + GOALOO STATS SUPPLEMENT TEST COMPLETE · CLEAN BRANCH ONLY · MAIN/PRODUCTION UNCHANGED

ขอบเขต: OVER / UNDER / 1X2 โดยยึดคำสั่งว่า TotalCorner ใช้เป็นสายเหตุการณ์เท่านั้น, API-Football ไม่กลับเข้าระบบ และ Goaloo ใช้เสริมเฉพาะสถิติที่ขาด

## สายข้อมูลที่ล็อกสำหรับ clean rebuild

| ข้อมูล | Source | ผล |
| --- | --- | --- |
| นาที / สกอร์ | TotalCorner V3 | ใช้เป็นตัวตนและเหตุการณ์หลัก |
| Attack | TotalCorner V3 | ใช้ |
| Dangerous Attack | TotalCorner V3 | ใช้ |
| Corner | TotalCorner V3 | ใช้ |
| Shot on Target | Goaloo `detailIn.js` code 5 | ใช้เมื่อจับคู่แข่งขันผ่าน guard |
| Shot Off | Goaloo `detailIn.js` code 8 | ใช้เฉพาะเมื่อ code 8 = Total Shots - SOT ของทั้ง HOME/AWAY |
| การครอบครองบอล % | Goaloo `detailIn.js` code 11 | ใช้เฉพาะคู่ HOME+AWAY รวม 98–102% |
| ราคา 1X2 | Market Engine / Nowgoal `/markets` | ใช้ |
| เส้น + ราคา OVER/UNDER | Market Engine / Nowgoal `/markets` | ใช้ |

TotalCorner V3 ปัจจุบันยังส่ง `sot/off = null` เพราะ worker ของเราไม่ได้ดึง detail; ไม่ใช้ TotalCorner detail ต่อ เนื่องจากหน้าสถิติติด Cloudflare และตามคำสั่งให้ถือว่าเส้นนั้นใช้งานไม่ได้

## Goaloo supplement contract

Goaloo ตัวใหม่เป็น `STATS_ONLY` เท่านั้น: อ่าน live identity จาก `bf_us.js`/`bf_us1.js` และสถิติจาก `detailIn.js`. ไม่รับราคา, ไม่รับ events, ไม่ทำ settlement และไม่เปลี่ยน TotalCorner event rail

การจับคู่ TotalCorner → Goaloo เป็น fail-closed:

1. HOME ต้องตรงกับ HOME และ AWAY ต้องตรงกับ AWAY; ไม่ยอมกลับด้าน
2. ตรวจชื่อทีมแบบ normalize พร้อม alias จำกัด เช่น `Utd` = `United`; ไม่ลด guard เพื่อไล่ coverage
3. ถ้าสกอร์มีทั้งสอง source ต้องตรงกันเป๊ะ
4. ตอนสร้าง mapping ครั้งแรก นาทีต่างได้ไม่เกิน 5 นาที
5. ถ้ามี candidate ใกล้กันจนแยกไม่ชัดให้ `AMBIGUOUS` และไม่เติมสถิติ
6. เมื่อจับได้แล้ว lock `TotalCorner matchId → Goaloo sourceMatchId` ใน session; ห้ามสลับ Goaloo match กลางเกม
7. mapping ที่ lock แล้วต้องตรวจชื่อ/สกอร์/นาทีซ้ำ ถ้าหลุดให้หยุดรับ stats แทนการ remap
8. ค่าใดไม่มีหรือ validation ไม่ผ่านให้คง `null`; UNDER ห้ามตีความ null เป็น 0

## ผลทดสอบล่าสุด

- parser + matcher tests: 10/10 PASS
- isolated Goaloo stats Worker: deploy + `/health` + `/feed` PASS
- live Goaloo feed รอบทดสอบ: 94 คู่
- TotalCorner V3 รอบเดียวกัน: 27 คู่
- strict cross-source match: 1 คู่ผ่าน, 0 ambiguous, 26 unmatched
- คู่ที่ผ่านจริง: `Hong Kong FC vs Lee Man FC`, TotalCorner ID `200608773` → Goaloo ID `3049317`, นาที 45 ตรงกัน, สกอร์ 0-1 ตรงกัน

Coverage รอบนี้ต่ำแต่ guard ไม่จับคู่ผิดเพื่อบังคับให้ครบ; คู่ที่ไม่ยืนยันได้จะไม่มี Goaloo stats และ fail closed ตามกติกา

## กติกาหลัง STEP 2

- TotalCorner = EVENT rail เท่านั้นสำหรับข้อมูลสดที่ใช้ในเงื่อนไข: minute, score, Attack, Dangerous Attack, Corner และ history ของเหตุการณ์เหล่านี้
- Goaloo = SUPPLEMENT STATS rail เฉพาะ SOT / Shot Off / Possession
- Nowgoal `/markets` = PRICE rail สำหรับ 1X2 / OVER-UNDER
- API-Football = ไม่ใช้
- main / Production ยังไม่ถูกแตะ; Goaloo supplement อยู่บน `work/342-settings-clean-rebuild` และ test Worker เท่านั้น

## STEP 2 RESULT

Source gap ของ SOT / Shot Off / Possession ถูกปิดในระดับ TEST ด้วย Goaloo และมี strict match guard แล้ว พร้อมเข้าสู่ STEP 3 เพื่อ lock Data Contract โดยยังคง fail closed เมื่อ cross-source mapping ไม่ผ่าน
