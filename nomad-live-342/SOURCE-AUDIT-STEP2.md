# NOMAD LIVE 3.42 — STEP 2 SOURCE AUDIT

Status: SOURCE AUDIT COMPLETE · RUNTIME UNCHANGED · CLEAN BRANCH ONLY

ขอบเขต: ตรวจสอบแหล่งข้อมูลเดิม/ปัจจุบันของ NOMAD สำหรับหน้าตั้งค่า OVER / UNDER / 1X2 โดยยึดคำสั่งว่า TotalCorner ใช้เป็นสายเหตุการณ์เท่านั้น และ API-Football ไม่ให้กลับมาเป็นส่วนพึ่งพาของระบบใหม่

## 1) สายข้อมูลที่ยืนยันได้จากระบบ NOMAD ปัจจุบัน

| ข้อมูลที่ Settings ต้องใช้ | สาย NOMAD ปัจจุบัน | Contract/Field | ผลตรวจ |
| --- | --- | --- | --- |
| นาที | TotalCorner Live Score V3 | match.minute | ใช้ได้ |
| สกอร์ | TotalCorner Live Score V3 | match.score | ใช้ได้ |
| Attack | TotalCorner Live Score V3 | event.snapshots[].attacks[HOME,AWAY] | ใช้ได้ |
| Dangerous Attack | TotalCorner Live Score V3 | event.snapshots[].dangerous[HOME,AWAY] | ใช้ได้ |
| Corner | TotalCorner Live Score V3 | event.snapshots[].corner[HOME,AWAY] | ใช้ได้ |
| Shot on Target | — | V3 ส่ง sot:[null,null] | SOURCE GAP |
| Shot Off | — | V3 ส่ง off:[null,null] | SOURCE GAP |
| การครอบครองบอล % | — | V3 ไม่มี field นี้ | SOURCE GAP |
| ราคา 1X2 | Market Engine / Nowgoal | GET /markets → bookmakers[].markets.oneXtwo | ใช้ได้ |
| เส้น + ราคา Over/Under | Market Engine / Nowgoal | GET /markets → bookmakers[].markets.totals | ใช้ได้ |
| ผลจบเกม | TotalCorner Live Score V3 | GET /finals | ใช้ได้ |

TotalCorner V3 ปัจจุบันประกาศ capability ชัดเจนว่า minute / score / attacks / dangerous / corner ใช้ได้ แต่ sot=false, off=false และ detail=false จึงห้ามตีความค่า null เป็น 0 หรือสร้างค่าขึ้นเอง

## 2) ตรวจย้อนหลังของ NOMAD

เครื่องยนต์ NOMAD รุ่นเก่าเคยอ่าน TotalCorner รายคู่ผ่าน /stats และ fallback /live แล้ว parser อ่าน Attack, Dangerous Attack, Shot on Target, Shot Off, Corner และ Possession ได้จริง

อย่างไรก็ตามเส้น detail รุ่นเก่ามีประวัติปัญหา frozen minute / stale / invalid detail และภายหลัง 3.42 เปลี่ยนมาใช้ TotalCorner V3 แบบ resilient โดยตั้ง detail=false เพื่อแยกสายที่เปราะออก ดังนั้นข้อมูลย้อนหลังนี้ใช้เพื่อยืนยันที่มาเดิมเท่านั้น ไม่อนุญาตให้ต่อกลับเข้าระบบใหม่อัตโนมัติ และตามคำสั่งปัจจุบัน TotalCorner ยังคงเป็นสายเหตุการณ์เท่านั้น

## 3) สายราคา

Market Engine ปัจจุบันตั้ง provider เป็น Nowgoal และ /markets รองรับสองตลาดที่ต้องใช้กับงานนี้โดยตรง:

- 1X2: home / draw / away (หน้าตั้งค่าใหม่จะไม่ใช้ Draw เป็นตัวเลือก Signal)
- OVER/UNDER: line / overOdds / underOdds

Nowgoal /markets จึงเป็นสายราคาที่พบว่าระบบปัจจุบันเตรียมไว้สำหรับ 1X2 และ OVER/UNDER ส่วน API-Football /candidate ที่ยังค้างอยู่ใน repository เป็น legacy code และห้ามนำมาเป็น dependency ของ clean rebuild

## 4) แหล่งเก่าที่ตรวจแล้วแต่ไม่เลือกกลับมา

- API-Football: ถูกปลดตามคำสั่ง ไม่ใช้เป็น candidate / statistics / price dependency
- BigBalls/BigBaller: legacy API; ตัวอย่างข้อมูลใน repo เคยคืน HTTP 200 แต่ key live stats หลายตัวเป็น null จึงไม่ใช้
- 5Dollar source8: retired / registry ไม่มี source8 แล้ว
- Flashscore: legacy / active telemetry ไม่ได้รับการยืนยันในระบบปัจจุบัน
- Alerts.bet: เคยอยู่ระดับ POC_CANDIDATE เท่านั้น ไม่ใช่ Production source

## 5) กติกาที่ล็อกหลัง STEP 2

1. TotalCorner = EVENT rail: minute, score, Attack, Dangerous Attack, Corner, history และ Final เท่านั้นในสถาปัตยกรรมใหม่
2. Nowgoal /markets = PRICE rail สำหรับ 1X2 และ OVER/UNDER ตามระบบปัจจุบัน
3. Shot on Target / Shot Off / การครอบครองบอล ยังไม่มี active approved source ใน clean rebuild จึงคงเป็น SOURCE GAP จนกว่าจะตรวจและเลือกแหล่งที่ใช้จริง
4. ข้อมูลหาย = null และ fail closed; โดยเฉพาะ UNDER ห้ามถือ null เป็น 0
5. Attack % และ Dangerous Attack % สามารถคำนวณจาก rolling delta ของ TotalCorner V3 เป็นสัดส่วน HOME/AWAY รวม 100%; ถ้าผลรวมไม่มีค่า/เป็น 0 ให้คืน null
6. การครอบครองบอลต้องมาจากข้อมูลจริงของ source ที่อนุมัติ ห้ามคำนวณแทนจาก Attack
7. ขั้นนี้ไม่เชื่อม RUN เข้ากับ Engine, ไม่แก้ Ledger, ไม่แก้ Worker และไม่แตะ main/Production

## STEP 2 RESULT

Audit เสร็จและพบ blocker ที่ต้องเห็นก่อน STEP 3: Shot on Target / Shot Off / การครอบครองบอล ยังไม่มี active approved source ในเส้น 3.42 ปัจจุบัน การไป STEP 3 แบบแม่นยำต้องเก็บสาม field นี้เป็น SOURCE GAP หรือทำ sub-step ตรวจ source ที่ได้รับอนุญาตให้ครบก่อนล็อก Data Contract
