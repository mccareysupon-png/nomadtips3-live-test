# BALL46 Prediction V8 — Production สำเร็จ

ตรวจเว็บไซต์จริง24 ตุลาคม2026 (Asia/Bangkok) หลังสลับ Production เวลา19:04:54 น.

- Production: https://ball46.com และ https://www.ball46.com
- Worker: `ball46-production` — `3d9e0ad6-6b23-4abe-9981-4c8d3fbd4eda` ใช้งาน100%
- Deployment: `105b997d-69ca-4826-b41a-8f25233cf808`
- Repository: `mccareysupon-png/nomadtips3-live-test`
- Branch: `codex/ball46-prediction-v8-20261024`
- UI/source commit: `a9200f59746a700f154b870b9762c53cdfb9043d`
- Activation commit: `1803b625d0c0e94b2bcd3add5ba23d59b0cbd10c`
- GitHub Actions [40092418717](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40092418717): completed SUCCESS
- Candidate verify [40091911920](https://github.com/mccareysupon-png/nomadtips3-live-test/actions/runs/40091911920): completed SUCCESS

## สิ่งที่ขึ้นเว็บจริง

- ชุดการ์ดโหวต Borderless ที่อนุมัติ: เลือก1/X/2 → Confirm Vote → Vote Saved; เปลี่ยนตัวเลือกด้วย Update Vote และจำหลังรีเฟรช
- COMMUNITY VOTE แสดงจำนวนจริงก่อนครบ20โหวต พร้อม Collecting votes; เมื่อครบ20จึงแสดงเปอร์เซ็นต์จริง ไม่มีการเติมยอด/ปรับเปอร์เซ็นต์จำลอง และระบุ Community opinion, not win probability
- การ์ดโหวตแสดงเฉพาะ HOME/AWAY เสื้ออยู่แนวเดียวกัน
- เสื้อ3Dพื้นหลังโปร่งใสรวม12สี เพิ่มเหลือง ส้ม ฟ้า ชมพู กรมท่า แดงเลือดหมูจากภาพที่สร้างใหม่; สุ่มด้วยfixtureIdแบบคงที่ เหย้า/เยือนสีต่างกัน
- เพิ่มเสื้อใน Featured Match โดยใช้สีเดียวกับการ์ดโหวตสำหรับfixtureเดียวกัน ทั้ง Desktop และรายละเอียดแข่งขันบน Mobile; Featured Match ยังมีชื่อทีมจริง
- Form Model แยกจากโหวตและยังแสดง Unavailable เพราะยังไม่มีประวัติ5นัดที่ยืนยันได้ ไม่เปลี่ยนกฎตรวจข้อมูลเดิม

## ไฟล์และขอบเขต

ไฟล์ในRepositoryอยู่ใต้ `deploy-assets/prediction-v8-20261024/`: `controller.js`, `component-extra.css`, `community-view.mjs`, `build/card.html`, `build/browser.js`, `build/b46-pv8-browser.mjs`, `build/b46-pv8-jerseys.mjs`, `build/patch.mjs`, `build/manifest.json`, `run.mjs`, `threshold.test.mjs`, `boundary.test.mjs`, `browser-proof.json`, `verify-browser.mjs`, `ROLLBACK.md` และworkflow `.github/workflows/ball46-prediction-v8-20261024.yml`.

เปลี่ยนเฉพาะหน้า `/`, `/index.html`, `/live-prediction-343.js` และเพิ่มเส้นทาง `/prediction-v8/jersey-*-3d-v8.webp`6สี ส่วนภาพ6สีเดิมยังใช้เส้นทางV6เดิม ไม่มีการนำหน้าLab,ตัวเลือกทดลอง,Snapshot,Mock Data หรือSQLiteในเครื่องไปขึ้นProduction

## ผลตรวจ

- Build/syntax และ tests10/10 ผ่าน: threshold0/1/19/20, unanimous20, rounding, invalid-data fallback,12สีไม่ซ้ำ/คงเดิม และขอบเขตUI
- Candidate: Desktop1920/1440/1366/1024 ×Dark/Light8กรณี; Mobileจริง390/3602กรณี; ComponentมือถือDark/Lightแยก4กรณี ผ่าน ไม่มีข้อมูลล้น เสื้อโหลดและอยู่แนวเดียวกัน
- Native mobileยังใช้ธีมมืดของระบบเดิม; ไม่เพิ่มตัวสลับธีมหรือเปลี่ยนGlobal CSSของมือถือ ส่วนสีLightของComponentตรวจผ่านในหน้าResponsive read-onlyที่จับจากCandidateจริง
- Preview API และ Browser: ยังไม่ยืนยันยอดไม่เปลี่ยน; ยืนยันแล้วเพิ่ม1; เปลี่ยนตัวเลือกยอดสุทธิคง1; รีเฟรชคงตัวเลือกและสี; ต่ำกว่า20แสดงจำนวน/ซ่อนแท่งเปอร์เซ็นต์ ทุกQA POSTอยู่ในpreview namespace ไม่ได้ส่งQA voteขึ้นProduction
- Signal → Statistics → All ผ่าน; Statisticsแสดง95แถวขณะตรวจ การ์ดโหวตมีใบเดียว ไม่มีตัวเขียนUIเก่าทับ
- Productionจริง: PC Dark/LightและMobile390/360ผ่าน สีFeatured/Voteตรงกัน ตัวเลขจำนวนโหวตจากProductionจริง ไม่มีข้อมูลล้น Console errors0/warnings0
- แถวแข่งขันDesktop69.046875px, การ์ดแข่งขันMobile142px, Performance99px คงเดิม
- Workflowตรวจ113เส้นทางต่อโดเมนตามสถานะและSHAที่กำหนด ครอบคลุมภาพใหม่ทั้งหมดและไฟล์เดิม; baselineรวมเส้นทาง404เดิมกับเส้นทางข้อความtemplateที่ไม่ได้เป็นassetโหลดจริงไว้เพื่อเทียบด้วย ไม่ใช้404เหล่านั้นอ้างว่าassetใหม่ผ่าน
- ตรวจอิสระหลังDeployเพิ่ม30HTTP/API checksผ่านทั้ง2โดเมน Engine/FullMarket/board/signals/statistics/vote healthปกติ
- **SETTLEDเดิม9,375รายการคงเดิม** ตามfingerprintID/ผล/เวลา/ตลาด/ตัวเลือก/เส้น/ราคา/ผลสุดท้าย/แหล่งsettlement
- เก็บ17non-main modulesเดิมเหมือนทุกbyte เปลี่ยนmainwrapperและเพิ่ม2scopedmodules เก็บassets/config/cron/domains/routesและBindingsเดิม6รายการครบ
- เวอร์ชันบริการEngine343,Full Market,HUBและprivate vote backendคงเดิม Backend `ball46-prediction-votes-v6` ยังคง `8f11708f-5fe6-415e-8439-e3b5777c517a` ไม่เปลี่ยนข้อมูลโหวต Cookies หรือNamespaces
- Candidateก่อนหน้ามีWarningsจากโค้ดเดิมเรื่องStatisticsเปลี่ยนระหว่างอ่าน/timeout; บันทึกไว้ตามจริง ไม่แก้โมดูลเหล่านั้น และไม่พบWarningsดังกล่าวในแท็บProductionหลังDeployที่ใช้ตรวจส่งมอบ

## หลักฐาน

ในโฟลเดอร์รายงานนี้: `baseline-active.json`, `baseline-version.json`, `baseline-index.html`, `before-desktop-dark.png`, `candidate-success.json`, `browser-verification.json`, `activation-success.json`, `production-active-deployments.json`, `production-verification.json`, `production-ui.json`, `production-console.json` และภาพ `production-desktop-dark.png`, `production-desktop-light.png`, `production-featured-dark.png`, `production-mobile-featured.png`, `production-mobile-dark.png`.

## Rollback

Baselineปัจจุบันก่อนงานนี้: `4c40159f-84a2-400c-80dc-8b13c268c898` / deployment `b0afb14a-3383-48c0-8c2f-23781f89ef32`.

ใช้phase `restore`ของworkflowV8โดยตรวจว่าเวอร์ชันใช้งานยังเป็นcandidateของงานนี้และconfigไม่เปลี่ยน พร้อมroute auditใหม่ ก่อนสลับกลับ ห้ามทับDeployที่ใหม่กว่า ห้ามลบข้อมูลโหวตหรือย้อนEngine/Signal/Statistics/Member ดู `deploy-assets/prediction-v8-20261024/ROLLBACK.md`.
