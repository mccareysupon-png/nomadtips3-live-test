# BALL46 Prediction Vote Card — Production SUCCESS

ตรวจล่าสุด24 ตุลาคม2026 เวลา16:58 น. (Asia/Bangkok) บนเว็บไซต์จริงทั้ง ball46.com และ www.ball46.com

## ผลงาน

- เปลี่ยน Live Match Outlook เป็น Prediction Vote Card ใบเดียว ตาม V5 Borderless พื้นไล่เฉดและเงานุ่ม ไม่มีกรอบซ้อน
- สร้างเสื้อฟุตบอล3D ใหม่ทั้งหมด6สี: เขียว น้ำเงิน แดง ขาว ดำ ม่วง พื้นหลังโปร่งใส ไม่มีสปอนเซอร์/โลโก้ ขนาดPNG1254×1254 และWebP384×384เท่ากัน ใช้ภาพชุดใหม่เป็นต้นทางทั้งหมด
- สีเสื้อเหย้า/เยือนต่างกันและคงเดิมตามfixtureId ไม่เปลี่ยนเมื่อรีเฟรช
- โหวต1/X/2เก็บจริงในSQLite Durable Objects แยกจากEngine เปลี่ยนตัวเลือกแล้วไม่เพิ่มยอดสุทธิ มีsigned browser identity, HttpOnly/Secure cookie, same-origin guard และrate limiting
- จำนวน/เปอร์เซ็นต์Audienceอ่านจากรายการโหวตที่บันทึกจริง ไม่มีseed/mock votes ถ้า0โหวตแสดง0และเปอร์เซ็นต์—
- Form Model · Last5แยกจากAudience และตรวจแหล่งข้อมูล ทีม เวลา รายการซ้ำและสถานะจบเกมก่อนคำนวณ **ปัจจุบันแสดงUnavailable** เพราะProduction boardไม่มีverified last-five history และHUBไม่มีteam-history endpoint ห้ามนำSignal Ledgerหรือสกอร์สดมาแทนประวัติ5นัด ข้อนี้ตรงกับfallbackที่Issue367อนุญาต

## Production และ Commit

| รายการ | หลักฐาน |
|---|---|
| Repository | [mccareysupon-png/nomadtips3-live-test](https://github.com/mccareysupon-png/nomadtips3-live-test) |
| Branch | codex/ball46-prediction-v6-20261024 |
| Source commit | 325752078750704a66ba039643ca18b383fb0b41 |
| Candidate commit | 79ed3d5cf1da21c34d2b295ee5c142b596d89fb6 |
| Activation commit | 864782fa3e27265bfdfb2903c84a88d58b1b9f2c |
| Production Worker | ball46-production |
| Active version100% | 4c40159f-84a2-400c-80dc-8b13c268c898 |
| Deployment | b0afb14a-3383-48c0-8c2f-23781f89ef32 |
| Activated | 24 Oct2026,14:11:46 ICT |
| Rollback baseline | 718d4481-36b9-438c-8eff-8f9b42a30934 |
| Isolated backend | ball46-prediction-votes-v6, version8f11708f-5fe6-415e-8439-e3b5777c517a |
| Workflow | .github/workflows/ball46-prediction-v6-20261024.yml |

Backend [run40072496198](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40072496198), Candidate [run40072558592](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40072558592), Production [run40073152885](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40073152885) จบSUCCESSทั้งหมด ยืนยันจากcompleted job logsและauthenticated Cloudflare deployment read ไม่ใช่เพียงผลupload

Main SHA256: `278c6945d09a5ae7606ffd5217a3de6df0e14eeb90e316e7907b2ce8608f74cd`

Homepage SHA256: `045fc9c3684c4d2b7f46ba43b1b007976e9d3e8ccfed0f6e7028c3536e2f37db`

## ไฟล์/Component

ต้นฉบับในworkspace: `work/prediction-vote-new-jerseys-20261024/`

- `card.html`, `card.css`, `controller.js`: การ์ด,ธีม,การอ่านคู่ปัจจุบันและUIโหวต
- `core.mjs`: การเลือกสีเสื้อ,การปัดเปอร์เซ็นต์และvalidation/คำนวณForm Model
- `vote-store.mjs`: isolated Worker +VoteIdentity/FixtureVoteStore SQLite classes
- `vote-proxy.mjs`: main-site scoped API guardและservice proxy
- `build/b46-pv6-browser.mjs`, `build/b46-pv6-jerseys.mjs`, `build/b46-pv6-proxy.mjs`, `build/patch.mjs`: scopedWorker additions/patch
- `assets/jersey-{green,blue,red,white,black,purple}-3d-v6.{png,webp}`: ภาพใหม่6สี
- `PROMPTS.md`: ชุดคำสั่งสร้างภาพด้วยbuilt-in image_genและรายละเอียดไฟล์ต้นฉบับ
- `run.mjs`, `workflow.yml`, `vote.test.mjs`: guarded deploymentและtests

Public pathsที่เปลี่ยน: `/`, `/index.html`, `/live-prediction-343.js`; เพิ่ม `/prediction-v6/jersey-*-3d-v6.webp`6ไฟล์, `/api/prediction-vote`, `/api/prediction-vote/health` เท่านั้น

## ผลตรวจ

- Unit tests12/12: actual count rounding,0vote fallback, stable distinct jersey colors, persistence, changing choice, concurrent same-voter requests,111independent SQL records, rate limits, tampered signatures, preview isolation, verified-history gating, origin/body/security guards
- Candidate realAPI: 1→X→2→2, totalสุทธิคง1,อ่านกลับได้,ข้ามoriginถูกปฏิเสธ โหวตทดสอบอยู่ในpreview namespaceทั้งหมด
- Browser: Desktop1920/1440/1366/1024 ×Dark/Light8กรณี; Mobile390/360; componentLight/Dark390/360เพิ่มเติม ไม่ล้น ไม่มีกรอบ ภาพใหม่โหลดครบ ปุ่มมือถือ62px
- Native mobileยังใช้dark-only shellเดิม ไม่เพิ่มตัวสลับธีมหรือเปลี่ยนระบบมือถือทั่วไป Light themeของcomponentตรวจในresponsive visual testแยก
- ตรวจSignal→Statistics→All,รายการStatisticsจริง50แถว,สลับคู่,รีเฟรชแล้วโหวต/สีเสื้อคงอยู่; one card ไม่มีdata-prediction-contentให้rendererเก่าเขียนทับ
- Productionจริง: DesktopDark/Light,Mobile390/360,Console errors0; match row69.046875px, mobile match card142px, Performance99pxคงเดิม
- Completed activation workflowตรวจ96static paths/โดเมน (95HTTP200 +1existing404ที่คงเดิม) และEngine/FullMarket/board/signals/statistics/new vote healthทั้ง2โดเมน
- **SETTLEDเดิม9,353รายการคงเดิมทุกfingerprintที่ตรวจ** ไม่แก้Engine343,Signal rules,odds,Ledger,settlement,Statistics,MemberหรือAPIเดิม
- เก็บ14non-main modulesและ88asset filesเดิมไว้ เพิ่ม3scopedmodulesและservice bindingใหม่เพียง1รายการ All5originalbindingsรวมstagedKVคงเดิม
- Backendไม่มีworkers.dev/preview endpoint ยืนยันจากauthenticated dashboard ส่วนrate limitป้องกันการเปลี่ยนbrowser identityในIPเดียวกันในระดับหนึ่ง; anonymous browser identityไม่ใช่การยืนยันคนไม่ซ้ำ

หลังDeployใหม่Productionเริ่ม0โหวตที่14:13 ICT; ตรวจอีกครั้ง16:56 ICT fixture201637430มีProduction1HOMEvote ขณะที่Previewมี1AWAYvoteแยกกัน ทั้งสองโดเมนProductionคืนcounts/เปอร์เซ็นต์ตรงกัน หลังFTปุ่มปิดตามสถานะจริง ไม่มีQA POSTไปProduction

การตรวจHTTPเพิ่มจากเครื่องlocalด้วยNodeพบHeadersTimeoutระหว่างการอ่าน จึงไม่ใช้ผลนั้นอ้างPASS; completed CI96paths/โดเมนและการเปิดProduction APIจริงในBrowserทั้ง2โดเมนเป็นหลักฐานยืนยันแทน เก็บผลAPIจริงใน `production-browser-api-proof.json`

## ภาพและหลักฐาน

- ก่อนเปลี่ยน: `before-desktop-dark.png`, `before-mobile-list.png`, `before-mobile-detail.png`
- หลังProductionจริง: `production-desktop-dark.png`, `production-desktop-light.png`, `production-mobile-dark.png`, `production-mobile-list.png`
- ชุดเสื้อครบ6สี/Light-Dark responsive: `responsive-mobile-light.png`, `responsive-mobile-dark.png`
- `backend-success.json`, `candidate-success.json`, `activation-success.json`: deployment audit
- `browser-verification.json`, `production-ui.json`, `production-ui-latest.json`, `production-console.json`, `production-browser-api-proof.json`, `production-active-deployments.json`, `production-settings.json`, `backend-private.json`
- `new-jersey-manifest.json`: ขนาด/alpha/hashesของภาพใหม่

Rollbackใช้เฉพาะguarded phaseตาม `ROLLBACK.md` ห้ามทับdeploymentที่ใหม่กว่า ห้ามลบข้อมูลโหวตหรือnamespace

[Registry#366](https://github.com/mccareysupon-png/nomadtips3-live-test/issues/366) อัปเดตแล้ว และ[Issue#367](https://github.com/mccareysupon-png/nomadtips3-live-test/issues/367)ปิดเป็นcompletedพร้อมข้อจำกัดForm Modelที่ระบุชัดเจน
