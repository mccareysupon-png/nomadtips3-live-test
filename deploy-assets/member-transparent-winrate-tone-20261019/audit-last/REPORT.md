# BALL46 Production — MEMBER transparency and WIN RATE colors

สถานะ: SUCCESS ตรวจเว็บไซต์ Production จริงแล้ว

- Production: https://ball46.com
- Repository: mccareysupon-png/nomadtips3-live-test
- Source baseline: fix/ball46-global-loading-orbit-20261019 / 7a399cc4204049767b91737792f56c0bf8f7898e
- Branch: codex/ball46-member-transparent-winrate-tone-20261019
- Source Commit: 238edd4bfcc0b3db69bf26afa752ca7fafe71b70
- Activation Commit: d298168f012f18821f1dd12ebb8293821f705695
- Worker: ball46-production
- Active Version: 82a493c8-2ed5-486d-91c4-3bc0e841ddce
- Deployment: 2f9d8a15-ecaa-4e39-943c-8a5af3f10de0
- Candidate CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39227311921
- Production CI: https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39227657593

แก้เฉพาะ index.html ในชุด ASSETS และ text module assets/index.html: พื้นหลังป้าย 1,011 ในเมนู MEMBER โปร่งใสทั้ง Light/Dark; WIN RATE ของ TODAY/YESTERDAY ใช้สีเขียวเมื่อมากกว่า 50% สีแดงเมื่อน้อยกว่า 50% เท่ากับ 50% คงสีส้ม ค่าไม่พร้อมคงรูปแบบเดิม ใช้เปอร์เซ็นต์จาก rate(b) เดิม ไม่แก้สูตร ตัวหาร ข้อมูล API หรือการตัดสิน

สี Desktop: Light เขียว #087952 แดง #cf2525; Dark เขียว #4ade80 แดง #fb7185 ใช้ token เดิมของ WIN/LOSS; AVG ODDS คงสีส้ม จำนวน MEMBER คงดำใน Light และขาวใน Dark ขนาด/ตำแหน่ง/ลิงก์คงเดิม

จุดโค้ด: b46-member-gold-1011, b46-member-badge-light-20261017, b46-daily-performance-runtime (paintRate / rateTone / การเรียกจาก paint), b46-performance-desktop-borderless-20261019 (CSS ภายใน min-width:761px)

ทดสอบผ่าน 19 รายการ รวม threshold >50/<50/=50/ข้อมูลไม่พร้อม และเปลี่ยนสถานะสีทุกรอบ paint; inverse diff ยืนยันส่วนอื่น byte เดิม; Worker runtime reapplication คง patch; Build/syntax และ CI ผ่าน ไม่มี Console warning/error ในหน้าทดสอบและ Production

Desktop 1920/1440/1366/1024 ทั้งสองธีมผ่าน ความสูง Performance 99 → 99px ไม่มี horizontal overflow สีและขนาดสถิติเดิมคงเดิม; Mobile 390/360 เทียบ baseline ผ่าน Mobile Green Noir มีพฤติกรรมบังคับธีมมืดเดิมอยู่แล้ว และการ์ด Performance ถูกซ่อนเดิม ไม่มีการเปลี่ยนหน้าตามือถือ

ตรวจ root + 82 public assets รวม 83 เส้นทาง HTTP200 ตรง SHA ที่ตั้งใจ API health 5 จุดผ่าน board ไม่ stale; ข้อมูล SETTLED เดิม 8250 รายการและฟิลด์ที่ป้องกันไว้คงเดิม bindings/settings/schedules/domain/routes คงเดิม รวม Loading Orbit จากอีกแชท ไม่มีการแตะ Member site, engines, API, ledger, rules, cron หรือ datafeed

Production ขณะตรวจ WIN RATE ทั้งสองค่ามากกว่า 50% จึงปรากฏสีเขียวจริง กรณีต่ำกว่า 50% / เท่ากับ 50% ตรวจด้วย isolated UI adapter tests ไม่สร้างข้อมูลจำลองลง Production

Rollback: 0ab88ef1-e3bc-4e7d-9908-4366cc85bb8b พร้อมโมดูลและสินทรัพย์ครบ 82 ไฟล์ (rollback.json) ต้องตรวจ Active ยังเป็น 82a493c8-2ed5-486d-91c4-3bc0e841ddce และ config ยังตรงก่อน restore; หากมี deployment จากอีกแชทให้หยุด ไม่ทับงานนั้น ไม่ได้เรียก rollback ในงานนี้

ภาพก่อน/หลังและผล JSON อยู่ในโฟลเดอร์เดียวกับรายงานนี้
