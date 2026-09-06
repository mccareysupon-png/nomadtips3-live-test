# NOMAD LIVE 3.42 — SOURCE AUDIT / SOT-OFF UPSTREAM RAIL

Status: NOWGOAL SOT/OFF UPSTREAM RAIL CONNECTED IN CLEAN BRANCH · TEST VALIDATED · MAIN/PRODUCTION UNCHANGED

ขอบเขต: ต่อสายข้อมูลที่ขาดให้ 3.42 เฉพาะ `Shot on Target` และ `Shot Off` ก่อน Event Gate/หน้าแสดงผล โดยห้ามเปลี่ยนสาย TotalCorner, ราคา, settlement หรือส่วนอื่น

## สายข้อมูลปัจจุบันของ clean branch

| ข้อมูล | Source | สถานะ |
| --- | --- | --- |
| นาที / สกอร์ | TotalCorner V3 | เจ้าของสายเดิม ไม่แตะ |
| Attack | TotalCorner V3 | เจ้าของสายเดิม ไม่แตะ |
| Dangerous Attack | TotalCorner V3 | เจ้าของสายเดิม ไม่แตะ |
| Corner | TotalCorner V3 | เจ้าของสายเดิม ไม่แตะ |
| Shot on Target | Nowgoal `/match/live-{matchId}` Statistics | ต่อเข้า SOT bridge แล้ว |
| Shot Off | Nowgoal `/match/live-{matchId}` Statistics | ต่อเข้า OFF bridge แล้ว |
| Possession | Nowgoal match detail มีข้อมูลจริง | ตรวจพบ แต่รอบนี้ยังไม่ต่อเข้าระบบ |
| ราคา 1X2 | Market Engine / Nowgoal market rail | สายราคาเดิม ไม่แตะ |
| ราคา OVER/UNDER | Market Engine / Nowgoal market rail | สายราคาเดิม ไม่แตะ |

TotalCorner V3 เดิมยังคง `sot/off = null` ที่ต้น feed ของมันเอง. การเติม SOT/OFF เกิดใน upstream bridge แยกก่อน Event Gate/หน้าแสดงผล จึงสามารถถอด bridge แล้วกลับสภาพเดิมได้ทันที

## Nowgoal upstream source contract

แหล่งตัวตนสดใช้ Nowgoal roster เดิม `/gf/data/bf_en-idn1.js` เพื่อรับ `matchId`, HOME, AWAY, สถานะ และสกอร์ จากนั้นอ่านเฉพาะคู่ที่จับได้จาก `/match/live-{matchId}` และแยก `Shots on Goal` / `Shots off Goal` จากส่วน Statistics

กฎจับคู่เป็น fail-closed:

1. HOME ต้องจับ HOME และ AWAY ต้องจับ AWAY; ไม่กลับด้าน
2. ชื่อทีมต้องผ่าน similarity guard
3. สกอร์ TotalCorner และ Nowgoal ต้องมีครบและตรงกันเป๊ะก่อนขอ detail
4. candidate ใกล้กันเกินกำหนดให้ `AMBIGUOUS` และไม่เติมข้อมูล
5. เมื่อจับได้แล้ว lock `TotalCorner matchId → Nowgoal matchId` ใน session
6. lock ที่ไม่ผ่านชื่อ/สกอร์รอบถัดไปจะหยุดรับข้อมูล ไม่ remap กลางเกม
7. ถ้า Match Detail ไม่มี SOT หรือ OFF จริง ฟิลด์นั้นคง `null`; ห้ามสร้างค่าเอง
8. bridge เติมได้เฉพาะ `event.snapshots[].sot` และ `event.snapshots[].off`
9. `minute`, `score`, `attacks`, `dangerous`, `corner`, market และ settlement ห้ามถูกเขียนทับ

## ผลทดสอบสดล่าสุด

- bridge + parser tests: **12/12 PASS**
- Nowgoal live roster ที่อ่านได้: **118 คู่**
- จ่อ Match Detail สด 5 คู่: **4/5 มี Shots on Goal + Shots off Goal ใช้งานได้**
- หน้า detail ที่ตรวจพบมี Statistics, Possession และข้อมูล shot/timeline ตาม coverage ของแต่ละคู่
- Wrangler isolated bridge dry-run: **PASS**
- guard ตรวจว่า Production / 3.41 path ไม่ถูกแตะ: **PASS**

หนึ่งใน 5 คู่ไม่มี SOT/OFF ในหน้า Statistics รอบนั้น จึงถูกปล่อย `null` ตามกติกา ไม่เดาและไม่ดึงค่าจากส่วน Team Statistics มาใช้แทน

## สถานะ Goaloo

Goaloo stats rail ที่ทดสอบก่อนหน้านี้ยังเก็บไว้เป็นงาน TEST/ประวัติ แต่ **ไม่ใช่ active dependency ของ SOT/OFF bridge v2** หลังยืนยันว่า Nowgoal Match Detail จ่าย SOT/OFF ได้โดยตรง

## แนวทางนำไปใช้กับ 3.41

ยึด contract เดียวกันภายหลัง:

`Nowgoal roster → strict match/lock → Nowgoal match-detail stats → เติมเฉพาะ SOT/OFF → snapshot เดิมของรุ่นนั้น`

ห้ามยกโครงสร้าง 3.42 ไปทับ 3.41; ให้ทำ adapter ตาม snapshot ของ 3.41 และคง rollback เป็นชิ้นเดียว

## CURRENT RESULT

สายต้นทาง SOT/OFF สำหรับ 3.42 ถูกต่อใน `work/342-settings-clean-rebuild` แล้วและผ่านการทดสอบ source/bridge. main/Production ยังไม่ถูกเปลี่ยนแปลง
