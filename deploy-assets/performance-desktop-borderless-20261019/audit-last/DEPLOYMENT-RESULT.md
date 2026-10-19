# BALL46 Performance Desktop Borderless

สถานะ **SUCCESS** ตรวจจาก https://ball46.com หลัง Deploy จริง

- Repository: mccareysupon-png/nomadtips3-live-test
- Branch: codex/ball46-performance-desktop-borderless-20261019
- Baseline: dca52246803048de9eabf72616a91edac8298eb2 (work/ball46-mobile-borderless-soft-20261019); Worker version d23bda6c-7015-4e57-9f2e-87e754a667cb
- Source commit: 3302964ce2b0615af7a4e45fdd8f4163b3162566
- Activation commit: 652731ea1eee71bfbd0b258106d857574c16af33
- Cloudflare target: ball46-production; Active 6df28dd8-2fc0-44a6-b8c0-52cf2581281b 100%; deployment dc565633-6804-4297-b4e6-602d05091ea9
- Actions: [Build/Candidate](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39181321632) / [Production](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/39181789485) ทั้งสอง SUCCESS

แก้ Production เพียง index.html โดยเพิ่ม CSS ของ #ball46-daily-performance ภายใน @media(min-width:761px) ใช้ CSS ใหม่ตามที่ผู้ใช้อนุญาตให้ออกแบบใหม่ เก็บ HTML เดิม, inline script7บล็อก (รวม structured JSON), JavaScript และไฟล์อื่น81ใบทุกไบต์

Desktop Light96px →99px; Dark117px →99px ทุกขนาด1920/1440/1366/1024 ไม่มีเส้นขอบ Outline เงาที่เป็นกรอบ เส้นตกแต่งหรือ Glow บน Main/Today/Yesterday/ช่องสถิติ ใช้พื้น Deep Teal ต่างระดับใน Dark และขาวเทาใน Light; WIN RATE เด่นเป็นสีทอง, สถานะมีสีแยก อ่านชัด Contrast ของตัวเลขและป้ายสถิติผ่าน4.5:1 ขึ้นไป

ผ่าน18Tests, Candidate10กรณี และ Production10กรณี ไม่มีข้อความล้น/การทับกัน/Horizontal overflow; Mobile390/360 ค่าสี ฟอนต์ ขนาด ระยะห่าง เส้นขอบ และ computed styles ของ Performance/องค์ประกอบหลักตรง Baseline การ์ด Performance บน Mobile ยังคงซ่อนตามเดิม

ใช้ตัวเลข วันที่ และ LONDON DAY จากระบบเดิม ไม่มีการเปลี่ยนคำนวณหรือAPI ตรวจไฟล์83เส้นทางตรง SHA และAPIหลัก5รายการ healthy; protected settled records8201รายการตรงกัน Settings/Bindings/Cron/Domain/Routesไม่เปลี่ยน Console errors0; warning ที่บันทึกเป็นการข้าม refresh ของ runtime เดิมเมื่อ snapshot สถิติมีการอัปเดตระหว่างอ่าน

Rollback: d23bda6c-7015-4e57-9f2e-87e754a667cb เป็นงาน Mobile Borderless ล่าสุดก่อนแก้ครั้งนี้ ใช้ restore phase ของ Workflow เดียวกันพร้อมตรวจเจ้าของ Active และConfig ก่อนย้อนกลับ

ภาพ [Before Light](./before-desktop-1440-light.png) / [After Light](./production-desktop-1440-light.png) / [Before Dark](./before-desktop-1440-dark.png) / [After Dark](./production-desktop-1440-dark.png) / [Before Mobile390](./before-mobile-390.png) / [After Mobile390](./production-mobile-390.png)

[Registry](./deployment-registry.json) / [UI verification](./production-ui-verification.json) / [Byte and API verification](./production-byte-health-verification.json)
