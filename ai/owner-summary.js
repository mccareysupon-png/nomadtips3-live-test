(() => {
  'use strict';

  const AI_KEY = 'nomadtips3.ai-learning-lab.v1';
  const $ = selector => document.querySelector(selector);

  function readState(){
    try { return JSON.parse(localStorage.getItem(AI_KEY) || 'null'); }
    catch { return null; }
  }

  function pct(value){
    return Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(0)}%` : '—';
  }

  function meaningfulAbc(snapshot){
    const score = Number(snapshot?.abcScore);
    if (Number.isFinite(score) && Math.abs(score) > 0.0001) return true;
    const text = String(snapshot?.abcResult || snapshot?.commonOpponentsResult || '').trim().toUpperCase();
    if (!text || text === '—' || text.includes('LIMITED') || text.includes('NO RELIABLE')) return false;
    return true;
  }

  function valueZoneSummary(state){
    const perf = state?.report?.performanceByOddsZone?.value || {};
    const total = Number(perf.total || 0);
    const wins = Number(perf.wins || 0);
    const losses = Number(perf.losses || 0);
    const winRate = Number.isFinite(Number(perf.winRate)) ? Number(perf.winRate) : null;
    const highOddsWeight = Number(state?.weights?.highOdds || 0);

    if (!total) return {text:'ยังไม่มีผล', detail:'รอคู่ Odds 2.00+ จบก่อน', cls:'neutral', short:'ยังไม่มีผล'};
    if (total < 3) return {text:'ยังตัวอย่างน้อย', detail:`${wins}W / ${losses}L · ${pct(winRate)}`, cls:'warn', short:'ยังข้อมูลน้อย'};
    if (winRate !== null && winRate >= .55 && highOddsWeight > 0) return {text:'แนวโน้มดีขึ้น', detail:`${wins}W / ${losses}L · ${pct(winRate)}`, cls:'good', short:'แนวโน้มดีขึ้น'};
    if (winRate !== null && winRate >= .55) return {text:'กำลังทำได้ดี', detail:`${wins}W / ${losses}L · ${pct(winRate)}`, cls:'good', short:'กำลังทำได้ดี'};
    if (winRate !== null && winRate >= .45) return {text:'ยังทรงตัว', detail:`${wins}W / ${losses}L · ${pct(winRate)}`, cls:'neutral', short:'ยังทรงตัว'};
    return {text:'ต้องระวัง', detail:`${wins}W / ${losses}L · ${pct(winRate)}`, cls:'bad', short:'ต้องระวัง'};
  }

  function systemSummary(state){
    const last = state?.remote24h?.lastAutoRunAt || state?.lastAutoRunAt || null;
    const apiCalls = Number(state?.remote24h?.footballApiCallsByCar4 ?? state?.source?.footballApiCallsByCar4 ?? 0);
    if (!last) return {text:'กำลังรอรอบอัตโนมัติ', detail:`Car 4 API เพิ่ม ${apiCalls} ครั้ง`, cls:'warn', short:'กำลังรอรอบอัตโนมัติ'};
    const t = Date.parse(last);
    if (!Number.isFinite(t)) return {text:'กำลังตรวจสถานะ', detail:`Car 4 API เพิ่ม ${apiCalls} ครั้ง`, cls:'warn', short:'กำลังตรวจสถานะ'};
    const ageMin = Math.max(0, (Date.now() - t) / 60000);
    const time = new Intl.DateTimeFormat('th-TH',{hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(t));
    if (ageMin <= 150) return {text:'ปกติ', detail:`Auto 24H ล่าสุด ${time} · API เพิ่ม ${apiCalls}`, cls:'good', short:'สถานะระบบปกติ'};
    if (ageMin <= 360) return {text:'ช้ากว่าปกติ', detail:`รอบล่าสุด ${Math.floor(ageMin)} นาทีที่แล้ว`, cls:'warn', short:'ระบบช้ากว่าปกติ'};
    return {text:'ควรตรวจสอบ', detail:`รอบล่าสุด ${Math.floor(ageMin)} นาทีที่แล้ว`, cls:'bad', short:'ควรตรวจสอบระบบ'};
  }

  function render(){
    const state = readState();
    if (!state) return;

    const snapshots = Object.values(state.snapshots || {});
    const learnedNow = Number(state?.automation?.trainedThisRun || 0);
    const totalLearned = Number(state?.trainingSamples || 0);
    const abcCount = snapshots.filter(meaningfulAbc).length;
    const value = valueZoneSummary(state);
    const system = systemSummary(state);

    const learnText = learnedNow > 0 ? `เรียนเพิ่ม ${learnedNow} คู่` : 'รอบล่าสุดยังไม่เรียนเพิ่ม';
    const abcText = abcCount === 0 ? 'A–B–C ยังข้อมูลไม่พอ' : `A–B–C มีข้อมูล ${abcCount} คู่`;

    const line = $('#ownerSummaryLine');
    if (line) line.textContent = `${learnText} / Odds 2.00+ ${value.short} / ${abcText} / ${system.short}`;

    const learn = $('#ownerLearn');
    const learnDetail = $('#ownerLearnDetail');
    const valueNode = $('#ownerValue');
    const valueDetail = $('#ownerValueDetail');
    const abc = $('#ownerAbc');
    const abcDetail = $('#ownerAbcDetail');
    const sys = $('#ownerSystem');
    const sysDetail = $('#ownerSystemDetail');

    if (learn) learn.textContent = learnedNow > 0 ? `+${learnedNow} คู่` : '0 คู่';
    if (learnDetail) learnDetail.textContent = `สะสมเรียนแล้ว ${totalLearned} คู่`;
    if (valueNode) valueNode.textContent = value.text;
    if (valueDetail) valueDetail.textContent = value.detail;
    if (abc) abc.textContent = abcCount === 0 ? 'ข้อมูลยังไม่พอ' : `มีข้อมูล ${abcCount} คู่`;
    if (abcDetail) abcDetail.textContent = abcCount === 0 ? 'รอ snapshot A–B–C เพิ่ม' : `จาก ${snapshots.length} snapshot`;
    if (sys) sys.textContent = system.text;
    if (sysDetail) sysDetail.textContent = system.detail;

    const boxes = [
      ['#ownerLearnBox', learnedNow > 0 ? 'good' : 'neutral'],
      ['#ownerValueBox', value.cls],
      ['#ownerAbcBox', abcCount > 0 ? 'good' : 'warn'],
      ['#ownerSystemBox', system.cls]
    ];
    boxes.forEach(([selector, cls]) => {
      const node = $(selector);
      if (!node) return;
      node.classList.remove('good','warn','bad','neutral');
      node.classList.add(cls);
    });
  }

  window.addEventListener('storage', event => {
    if (event.key === AI_KEY) render();
  });
  window.addEventListener('load', render);
  window.setInterval(render, 60 * 1000);
  render();
})();
