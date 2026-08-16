from pathlib import Path

p = Path('index.html')
s = p.read_text()

if 'HISTORICAL OUTCOME TREND' not in s:
    css_old = '.page-btn.active{background:#302d1d;color:var(--yellow)}.page-btn:disabled{opacity:.35;cursor:default}.share-grid'
    css_new = '.page-btn.active{background:#302d1d;color:var(--yellow)}.page-btn:disabled{opacity:.35;cursor:default}.trend-card{margin:13px 0 16px;padding:15px 16px;border-radius:18px;background:linear-gradient(135deg,#0c0c0c,#171717 62%,#242424);box-shadow:0 12px 34px #0006}.trend-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.trend-title{font-size:10px;font-weight:950;letter-spacing:.02em}.trend-sub{margin-top:3px;color:#747474;font-size:8px;line-height:1.4}.trend-legend{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap}.trend-key{display:flex;align-items:center;gap:5px;color:#898989;font-size:7px;font-weight:900}.trend-line{width:18px;height:2px;border-radius:2px}.trend-line.win{background:var(--green)}.trend-line.loss{background:var(--red)}.trend-line.draw{background:#aaa}.trend-wrap{position:relative;width:100%;height:250px;min-height:190px}.trend-wrap canvas{display:block;width:100%;height:100%}.trend-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:7px;color:#696969;font-size:7px;font-weight:800}.trend-summary{display:flex;gap:12px;flex-wrap:wrap}.share-grid'
    if css_old not in s:
        raise SystemExit('trend CSS insertion point not found')
    s = s.replace(css_old, css_new, 1)

    mob_old = '.pager-buttons{width:100%}.bottom{height:66px}'
    mob_new = '.pager-buttons{width:100%}.trend-card{padding:13px}.trend-head{flex-direction:column}.trend-legend{justify-content:flex-start}.trend-wrap{height:210px}.bottom{height:66px}'
    if mob_old not in s:
        raise SystemExit('mobile CSS insertion point not found')
    s = s.replace(mob_old, mob_new, 1)

    tiny_old = '.markets{grid-template-columns:1fr 1fr}.share-actions'
    tiny_new = '.markets{grid-template-columns:1fr 1fr}.trend-wrap{height:190px}.trend-foot{align-items:flex-start;flex-direction:column}.share-actions'
    if tiny_old not in s:
        raise SystemExit('small mobile CSS insertion point not found')
    s = s.replace(tiny_old, tiny_new, 1)

    html_old = '''  <div class="stats"><div class="stat"><label>Settled</label><strong id="stTotal">0</strong></div><div class="stat"><label>Win</label><strong id="stWin" class="green">0</strong></div><div class="stat"><label>Loss</label><strong id="stLoss" class="red">0</strong></div><div class="stat"><label>Push</label><strong id="stPush" class="gray">0</strong></div><div class="stat"><label>Win rate</label><strong id="stRate">—</strong></div><div class="stat"><label>Avg odds</label><strong id="stOdds">—</strong></div></div>
  <div id="marketBreakdown" class="sub"></div>'''
    html_new = '''  <div class="stats"><div class="stat"><label>Settled</label><strong id="stTotal">0</strong></div><div class="stat"><label>Win</label><strong id="stWin" class="green">0</strong></div><div class="stat"><label>Loss</label><strong id="stLoss" class="red">0</strong></div><div class="stat"><label>Push</label><strong id="stPush" class="gray">0</strong></div><div class="stat"><label>Win rate</label><strong id="stRate">—</strong></div><div class="stat"><label>Avg odds</label><strong id="stOdds">—</strong></div></div>
  <div class="trend-card"><div class="trend-head"><div><div class="trend-title">HISTORICAL OUTCOME TREND</div><div class="trend-sub">Core selected-side match outcomes · cumulative history · full data retained while labels automatically compress</div></div><div class="trend-legend"><span class="trend-key"><i class="trend-line win"></i>WIN</span><span class="trend-key"><i class="trend-line loss"></i>LOSS</span><span class="trend-key"><i class="trend-line draw"></i>DRAW</span></div></div><div class="trend-wrap"><canvas id="outcomeChart" aria-label="Historical Win Loss Draw trend chart"></canvas></div><div class="trend-foot"><div id="trendRange">WAITING FOR SETTLED RESULTS</div><div id="trendSummary" class="trend-summary"></div></div></div>
  <div id="marketBreakdown" class="sub"></div>'''
    if html_old not in s:
        raise SystemExit('statistics HTML insertion point not found')
    s = s.replace(html_old, html_new, 1)

    nav_old = "document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav button,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.view).classList.add('active');scrollTo({top:0,behavior:'smooth'})});"
    nav_new = "document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.nav button,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$('#'+b.dataset.view).classList.add('active');if(b.dataset.view==='stats')requestAnimationFrame(drawOutcomeChart);scrollTo({top:0,behavior:'smooth'})});"
    if nav_old not in s:
        raise SystemExit('navigation insertion point not found')
    s = s.replace(nav_old, nav_new, 1)

    weighted = "function weightedStats(rows){const settled=rows.filter(r=>String(r.x.status||'PENDING')!=='PENDING'),wins=settled.filter(r=>r.x.status==='WIN').length,loss=settled.filter(r=>r.x.status==='LOSS').length,push=settled.filter(r=>r.x.status==='PUSH').length,hw=settled.filter(r=>r.x.status==='HALF_WIN').length,hl=settled.filter(r=>r.x.status==='HALF_LOSS').length,den=wins+loss+.5*(hw+hl),rate=den?((wins+.5*hw)/den*100):null,od=settled.map(r=>num(r.x.odds)).filter(x=>x!=null);return {settled,wins,loss,push,hw,hl,rate,avg:od.length?od.reduce((a,b)=>a+b,0)/od.length:null}}\n"
    chart = r'''function coreOutcome(m){const r=matchResult(m);if(!r)return null;if(r==='DRAW')return 'DRAW';const side=String(m.pickSide||'').toUpperCase();return side&&r===side?'WIN':'LOSS'}
function outcomeChartData(){const seen=new Set(),rows=[];for(const set of allSets())for(const m of set.matches||[]){const outcome=coreOutcome(m);if(!outcome)continue;const key=String(m.fixtureId||`${m.home}|${m.away}|${m.kickoffUtc}`);if(seen.has(key))continue;seen.add(key);rows.push({m,set,outcome,time:new Date(m.settledAtUtc||m.kickoffUtc||set.generatedAtUtc||0).getTime()||0})}rows.sort((a,b)=>a.time-b.time);let win=0,loss=0,draw=0;return rows.map((r,i)=>{if(r.outcome==='WIN')win++;else if(r.outcome==='LOSS')loss++;else draw++;return {i:i+1,win,loss,draw,outcome:r.outcome,m:r.m,time:r.time}})}
function drawOutcomeChart(){const canvas=$('#outcomeChart');if(!canvas)return;const data=outcomeChartData(),wrap=canvas.parentElement,rect=wrap.getBoundingClientRect(),cssW=Math.max(280,Math.round(rect.width)),cssH=Math.max(180,Math.round(rect.height)),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,cssW,cssH);const pad={l:34,r:12,t:12,b:25},w=cssW-pad.l-pad.r,h=cssH-pad.t-pad.b;if(!data.length){c.fillStyle='#737373';c.font='700 10px Arial';c.textAlign='center';c.fillText('WAITING FOR SETTLED RESULTS',cssW/2,cssH/2);$('#trendRange').textContent='WAITING FOR SETTLED RESULTS';$('#trendSummary').innerHTML='';return}const last=data[data.length-1],maxY=Math.max(1,last.win,last.loss,last.draw),nice=maxY<=5?5:Math.ceil(maxY/5)*5,x=i=>pad.l+(data.length===1?w/2:(i/(data.length-1))*w),y=v=>pad.t+h-(v/nice)*h;c.lineWidth=1;c.strokeStyle='#2a2a2a';c.fillStyle='#707070';c.font='600 8px Arial';c.textAlign='right';c.textBaseline='middle';const yTicks=5;for(let j=0;j<=yTicks;j++){const v=Math.round(nice*j/yTicks),yy=y(v);c.beginPath();c.moveTo(pad.l,yy+.5);c.lineTo(cssW-pad.r,yy+.5);c.stroke();c.fillText(String(v),pad.l-7,yy)}const desired=cssW<480?4:cssW<800?6:8,step=Math.max(1,Math.ceil(data.length/desired));c.textAlign='center';c.textBaseline='top';for(let i=0;i<data.length;i+=step){const xx=x(i);c.fillText(String(i+1),xx,pad.t+h+7)}if((data.length-1)%step!==0)c.fillText(String(data.length),x(data.length-1),pad.t+h+7);const series=[['win','#39d76c'],['loss','#ff626d'],['draw','#aaa']];for(const [key,color] of series){c.beginPath();c.lineWidth=1.45;c.lineJoin='round';c.lineCap='round';c.strokeStyle=color;data.forEach((d,i)=>{const xx=x(i),yy=y(d[key]);i?c.lineTo(xx,yy):c.moveTo(xx,yy)});c.stroke();if(data.length<=45){c.fillStyle=color;for(let i=0;i<data.length;i++){c.beginPath();c.arc(x(i),y(data[i][key]),1.7,0,Math.PI*2);c.fill()}}}const firstDate=data[0].time?fd(new Date(data[0].time)):'—',lastDate=last.time?fd(new Date(last.time)):'—';$('#trendRange').textContent=`${data.length} SETTLED PICKS · ${firstDate} → ${lastDate}`;$('#trendSummary').innerHTML=`<span class="green">WIN ${last.win}</span><span class="red">LOSS ${last.loss}</span><span class="gray">DRAW ${last.draw}</span>`}
'''
    if weighted not in s:
        raise SystemExit('statistics JS insertion point not found')
    s = s.replace(weighted, weighted + chart, 1)

    rs = "function renderStats(){const filters=['ALL','1X2','AH','BTTS','OU','DC','OE'];"
    if rs not in s:
        raise SystemExit('renderStats insertion point not found')
    s = s.replace(rs, "function renderStats(){drawOutcomeChart();const filters=['ALL','1X2','AH','BTTS','OU','DC','OE'];", 1)

    load = 'load();setInterval(load,60000);'
    resize = "let chartResizeRaf=0;window.addEventListener('resize',()=>{cancelAnimationFrame(chartResizeRaf);chartResizeRaf=requestAnimationFrame(drawOutcomeChart)});\nload();setInterval(load,60000);"
    if load not in s:
        raise SystemExit('load insertion point not found')
    s = s.replace(load, resize, 1)
    p.write_text(s)
else:
    print('Trend chart already present')

sp = Path('.github/workflows/prematch-ui-smoke.yml')
smoke = sp.read_text()
old = "required=['const PAGE_SIZE=20','picksPagerTop','statsPagerTop','shareTodayPagerTop','shareResultPagerTop','selected-text','coreSelectionClass']"
new = "required=['const PAGE_SIZE=20','picksPagerTop','statsPagerTop','shareTodayPagerTop','shareResultPagerTop','selected-text','coreSelectionClass','outcomeChart','drawOutcomeChart','coreOutcome','HISTORICAL OUTCOME TREND']"
if old in smoke:
    sp.write_text(smoke.replace(old, new, 1))
