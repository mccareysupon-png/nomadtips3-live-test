# BALL46 5USD latency review and isolated control design

ตรวจแบบอ่านอย่างเดียววันที่ 2 พฤศจิกายน 2569; เก็บ Snapshot คู่ Chainat Hornbill U21 (N) — Port FC U21 เวลาไทย 16:00:18–16:02:08 น. หลักฐาน Actions: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/41417078311

## ผลตรวจที่ยืนยันได้

- Website active `224cac7e-11fe-4549-a462-8f2f0e3ef25f`; HUB `98ea43ab-f40c-4de5-82e3-b0387dffd672`; Engine `02e09215-02b1-47fb-b1cf-9423f50c7ce9`; Full Market `3a53ee1a-467c-4a20-9f50-ba749e8adab4`. อ่านเวอร์ชันจริงก่อนตรวจ และยืนยันทั้งสี่เวอร์ชันเท่าเดิมหลังจบ ไม่มี Deploy หรือเปลี่ยนความถี่ในงานนี้
- Bulk ตั้ง 30 วินาที; สังเกตการเปลี่ยน Snapshot สี่ช่วง 36.672 / 30.522 / 30.358 / 30.301 วินาที มัธยฐาน 30.44 วินาที ชุดสังเกตยาวประมาณ 114 วินาที ไม่ใช่สถิติทั้งวันหรือช่วงคนใช้หนาแน่น
- Fixture `203807295`: Chainat Hornbill U21 — Port FC U21 อยู่ใน HUB จริง; สกอร์ 0–1 ตลอดช่วงที่ตรวจ นาที 29 → 31 ไม่มี timestamp ของเวลาที่ provider รับประตู จึงยังวัด event delay ของคู่นี้ไม่ได้
- Engine มี `MIN_SCAN_GAP_MS=60000` สำหรับ scanIfDue และ Cron ทุกหนึ่งนาที; Cron มีเส้นทาง scan ตรงแยกต่างหาก จึงห้ามตีความว่า 60 วินาทีเป็น lag จริงทุกคำขอหรือเป็นตัวหน่วงบังคับทุกเส้นทาง
- HUB `fetchTodayAndLive` รอหน้า Today ตามลำดับ (สูงสุดสี่หน้า) ก่อนเรียก Live และใช้ refreshPromise ร่วมกัน จึงมีเส้นทางที่ Live ต้องรอ Today. ระยะที่เกิดกับคู่นี้จริงยังไม่ได้แยกวัด แต่เป็นจุดควรประเมินการดึง/เผยแพร่ Live ก่อนโดยคงจำนวนคำขอเดิม แทนเพิ่มความถี่อย่างเดียว
- Frontend บางโมดูลมี cache 10 / 15 วินาที; history 20 วินาที, Full Odds client cache 45 วินาที ค่าพวกนี้เป็นชนิดข้อมูลคนละอย่าง ห้ามบวกทุกตัวเป็น delay ของสกอร์โดยตรง
- Full Market health ที่อ่านเพิ่มเติม: mode fast, cache 45 วินาที, เพดาน local 10 calls/min, observed callsLast60s 6. providerMeta บันทึก HTTP 200, limit 40, remaining 32 เวลาไทย 16:40:42; reset 16:41:00 น. เป็นเพียงภาพหน้าต่างเวลาหนึ่ง ไม่ใช่ประวัติครบหรือหลักฐานว่าเหลืองบเท่านี้ตอนเปิดหน้านี้

## ประวัติ API และสิ่งที่ยังวัดไม่ได้

อ่าน Workers Observability แบบ dry query ได้ ตัวอย่าง 200 log events ต่อ Worker สำหรับ HUB / Engine / Full Market ภายในช่วงย้อนหลัง 24 ชั่วโมง ระบบตอบข้อมูลแบบ adaptive sampling จึงไม่ใช่ 200 คำขอทั้งหมดหรือยอดทั้งวัน และ invocation ที่อ่าน cache ไม่ใช่คำขอออกไป 5USD

Bulk fetchJson ไม่เก็บ response rate-limit headers เป็นประวัติกองกลาง ตัวนับ providerRequestCount ใน HUB คือคำขอของ refresh batch ล่าสุด (พบ 1 หรือ 5) ไม่ใช่ rolling-minute total. `estimatedBulkRequestsPerMinute=2` คือ Live Bulk เท่านั้น; Today ในรอบที่เห็นใช้ 4 requests เพิ่มและทำทุก 120 วินาที ต้องรวมส่วนนี้ด้วยเมื่อทำงบ

ข้อมูลจาก providerMeta ของ Full Market ช่วยยืนยัน limit/remaining ในหน้าต่างนั้น แต่ยังไม่ครอบคลุม reservation ของทุก Worker ทุก Key และผู้ใช้อื่นของบัญชี จึงยังไม่มีหลักฐานพอรับรองการเร่งจริงแบบไม่ชนโควตา

เจ้าของรายงานว่าช้ากว่า Goaloo ประมาณสองนาที แต่ยังไม่มีเวลาเปลี่ยนเหตุการณ์เดียวกันจาก Goaloo ที่จับคู่ได้ จึงไม่อ้างว่าการตรวจนี้พิสูจน์หรือหักล้างตัวเลขสองนาทีได้ ไม่มีการเดาสกอร์หรือนาทีจากเวลา kickoff

## แนวทางที่คุ้มค่าและความเสี่ยง

1. ตรวจเส้นทางเผยแพร่สกอร์ก่อน: ประเมินให้ UI เวลา/สกอร์ใช้ cached HUB snapshot ที่มีอยู่ แยกจากการรอ Engine ประเมิน Signal และราคา โดยคง Engine/สูตร/ความถี่เดิม ต้องมี fixture identity และ freshness guard และทดสอบการจับคู่ก่อนเปลี่ยนจริง วิธีนี้ไม่เพิ่ม upstream calls แต่ยังไม่ได้ทำแพตช์ Production
   ประเมิน Live-first ในรอบ Today โดยใช้จำนวนคำขอเดิม พร้อมทดสอบว่ารายการบอลครบ การรวมหน้า/ผลจบ และ Snapshot consistency คงเดิม; ไม่เปลี่ยนลำดับ request ใน Production ภายใต้งานออกแบบนี้
2. ประเมิน Bulk 20 / 15 วินาทีภายใต้งบรวมที่ยืนยันจริง: หนึ่งหน้าต่อรอบเท่ากับ 3 / 4 live calls/min เทียบ 2 ที่ 30s และต้องรวม Today, odds, final recheck, corner history และ Key อื่น ลดเวลารอ HUB เฉลี่ยได้ราว 5 / 7.5 วินาทีภายใต้สมมติฐานเหตุการณ์เกิดสม่ำเสมอและรอบคงที่ ไม่ใช่ลด end-to-end สองนาที
3. ใช้ตัวจัดสรรกลางที่กันงบระบบเดิมก่อน อนุมัติ request แบบ atomic และใช้ rate-limit headers/expiry ที่สด ห้ามเชื่อ browser proof. ตรวจ authentication ฝั่ง Server สำหรับผู้เปลี่ยนค่า และปิด workers.dev ที่อาจข้ามการป้องกัน
4. HTTP 429 ต้องพักร่วมกันตาม Retry-After ทั้งตัวเลขและ HTTP-date; 401/402/403 หยุดรอตรวจ ไม่ retry รัวหรือซื้อแพ็กเกจอัตโนมัติ เอกสารผู้ให้บริการระบุ 429 สำหรับ quota และ 403 สำหรับ insufficient_plan; ไม่พบคำอธิบาย 402 ในหน้า error ของผู้ให้บริการ จึงยังไม่ระบุว่า 402 ของเจ้าของมีต้นทางจากอะไร

## หน้าทดลองที่สร้าง

http://127.0.0.1:8820/ — ธีมมรกต PC/มือถือ; แสดงค่าที่ตั้งจริงแยกจากค่าที่เลือกทดลอง, Snapshot age ณ เวลาตรวจ, quota coverage, ตัวเลือก 30/20/15, AUTO SAFE แบบจำลอง, กรณีงบเต็ม/429/402, DEFAULT reset, ประวัติ Snapshot และภาพ provider header ที่ระบุเวลา

ทุกฉากที่ไม่ใช่หลักฐานจริงติดคำว่า “จำลอง”; effective Production ยังคงแสดงฐาน 30s. ชุดทดลองมีเฉพาะ GET ของไฟล์และหลักฐานในเครื่อง ไม่ proxy ไป Production; POST คืน 405, control path คืน 404, CSP connect-src self. การบันทึกเป็นข้อความยืนยันเฉพาะ session ในชุดทดลอง ไม่ทำให้ค่า Production เปลี่ยน

ไฟล์: preview.html / preview.css / preview.mjs / server.mjs / speed-policy.mjs / policy.test.mjs / latency-audit.json / full-market-health.json. อยู่ในสาขา codex/ball46-5usd-latency-control-20261102. พัฒนาเฉพาะชุดทดลอง ไม่มี Merge/Deploy/เปลี่ยน API Key/Cron/Billing

## ทดสอบ

- 20 policy tests ผ่าน: โควตาขาด/หมดอายุ/coverage ไม่ครบ, งบตึง, งบไม่พอให้พัก, 401/402/403, 429 ทั้ง seconds/HTTP-date และไม่มีการยืด cooldown ทุกครั้งที่อ่าน, การคำนวณ 7.5s
- Browser PC และมือถือ 390px: ไม่ล้นแนวนอน; AUTO เลือก 15 ในฉากโควตาจำลองผ่าน; FAST 20 ให้ผลคำนวณ 5s; Save เฉพาะทดลอง; 402/429 ปิด Save; DEFAULT คืน 30; request history ไม่แสดงตัวเลขปลอม; console error list ว่าง
- Local HTTP checks ผ่าน: evidence 10 samples, read-only POST 405, ไม่มี production control proxy, CSP connect-src self

## พบแยกนอกขอบเขต — ไม่แก้

- Full Market มี Cron `1-59/2 * * * *` แต่ log พบ “Handler does not export a scheduled() function” (ตัวอย่างล่าสุดที่อ่านเวลาไทย 15:55:17) ต้องตรวจ scheduled handler / prewarm แยกก่อนอ้างว่ามันทำงานตาม Cron
- Engine มี isolate memory reset ใน log เวลาไทย 15:39:00 ก่อนการ Deploy แพตช์ Ledger ล่าสุด 15:44 น. ข้อมูลนี้ไม่ยืนยันว่า error ยังคงเกิดหรือเกิดจากแพตช์ใหม่ ห้ามเปลี่ยนสูตร/working data เพื่อแก้โดยพลการ

## ความพร้อมและ rollback

พร้อมดูและทดลอง UI; ยังไม่พร้อมเปิดการเร่งจริงจนกว่ามี owner auth และ quota coordinator ครบ พร้อมการวัดเส้นทางสกอร์แบบจับคู่. การย้อนชุดทดลองเพียงปิดหน้าหรือหยุด local server ไม่มี Production state ให้คืน. การ Deploy ในอนาคตต้องอ่าน source/version ล่าสุดอีกครั้งและรักษา Ledger fix กับ UI เดิมทั้งหมด

อ้างอิง: [5USD rate limits](https://5dollarfootballapi.com/docs#rate-limits), [Errors](https://5dollarfootballapi.com/docs/errors), [Provider event capture delay](https://5dollarfootballapi.com/status), [Account usage endpoint](https://5dollarfootballapi.com/docs/status), [Cloudflare query API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/)
