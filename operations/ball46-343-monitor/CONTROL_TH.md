# BALL46 API Control Center — แผนเชื่อมข้อมูลจริง (สาขาทดสอบเท่านั้น)

## ขอบเขต
- โค้ดชุดนี้เป็น **แกนตรวจสอบค่าจูนแบบแยกอิสระ** ไม่มี network calls, credentials, Cloudflare bindings, deploy commands หรือคำสั่งเขียน Production
- ทดสอบด้วย `node --test operations/ball46-343-monitor/control-core.test.mjs`
- HTML เดิมเป็นตัวจำลองแยกต่างหาก ยังไม่เชื่อมแกนนี้หรือข้อมูลจริง
- `plan().canApply` เป็น `false` เสมอ ไม่มีคำสั่งควบคุม Worker

## สิ่งที่ตรวจพบจากโค้ดมอนิเตอร์เดิม
- Cloudflare GraphQL: Worker invocations/errors/subrequests ในหน้าต่าง 20 นาที (ไม่ใช่จำนวน 5USD requests)
- HUB health: `control.liveRefreshSeconds`, `estimatedBulkRequestsPerMinute` และข้อมูล error บางส่วน
- Shadow 3.41: `rate.live.usedLast60s`
- **ยังไม่มี** per-job upstream request count ที่เชื่อถือได้, 429 รวมจริง, headers โควตา, ตัวสั่งจูน production ที่พิสูจน์ได้

## สัญญาการเชื่อมต่อในอนาคต (ยังไม่ใช้งาน)
1. Adapter อ่านอย่างเดียวต้องรับข้อมูลพร้อม UTC timestamp และสถานะ freshness; ถ้าไม่มี ให้แสดง UNKNOWN ห้ามใช้ตัวเลขจำลองแทน
2. สร้าง telemetry ฝั่ง HUB/Full Market ที่นับเฉพาะ upstream 5USD requests แยก job id และ request id แบบไม่เก็บ key, odds, member data
3. ระบุ shared calls เพื่อไม่นับคำขอซ้ำ และระบุงาน Signal ที่ประมวลผลภายใน
4. ออกแบบ controller ให้มี global budget, atomic coordination, safe minimum interval, backoff เมื่อ 429, audit, authentication, dry-run, rollback และ FT priority
5. ทดสอบ staging ที่ใช้ mock provider และ simulated 429 ก่อนพิจารณาเชื่อม Worker จริง; การแก้ Worker Production ต้องขออนุมัติใหม่

**ข้อห้าม:** ห้ามนำ config JSON จาก UI ไปสั่งปรับ Cloudflare โดยตรง ห้าม deploy หรือแก้ Engine 3.43, settlement, member, production.
