(()=>{
  const shortLabel=label=>({
    'Attack Strength':'Attack',
    'Shot Volume':'Shot Vol.',
    'Shots on Target':'SOT',
    'Recent Form':'Form',
    'Home / Away Form':'H/A Form',
    'Defense Stability':'Defense',
    'Conversion Rate':'Conversion'
  }[label]||label);

  const numberFrom=text=>{
    const value=parseFloat(String(text||'').replace('%','').trim());
    return Number.isFinite(value)?Math.max(0,Math.min(100,value)):null;
  };

  function makeBar(side,value){
    const slot=document.createElement('div');
    slot.className='vertical-bar-slot';

    const number=document.createElement('span');
    number.className=`vertical-value ${side}`;
    number.textContent=`${value}%`;
    number.style.bottom=`calc(${value}% + 5px)`;

    const bar=document.createElement('span');
    bar.className=`vertical-bar ${side}`;
    bar.style.height=`${value}%`;

    slot.append(number,bar);
    return slot;
  }

  function upgrade(list){
    if(list.classList.contains('vertical-ready')) return;
    const rows=[...list.querySelectorAll(':scope > .compare-row')];
    if(!rows.length) return;

    const chart=document.createElement('div');
    chart.className='vertical-comparison';
    chart.setAttribute('role','img');
    chart.setAttribute('aria-label','Team comparison metrics shown as paired vertical percentage bars');

    let usable=0;
    rows.forEach(row=>{
      const labelText=row.querySelector('.compare-label')?.textContent?.trim()||'Metric';
      const values=[...row.querySelectorAll('.bar-num')].map(el=>numberFrom(el.textContent));
      const home=values[0];
      const away=values[1];
      if(home===null||away===null) return;

      const metric=document.createElement('div');
      metric.className='vertical-metric';
      metric.title=`${labelText}: Home ${home}% · Away ${away}%`;

      const bars=document.createElement('div');
      bars.className='vertical-bars';
      bars.append(makeBar('home',home),makeBar('away',away));

      const label=document.createElement('div');
      label.className='vertical-label';
      label.textContent=shortLabel(labelText);

      metric.append(bars,label);
      chart.append(metric);
      usable++;
    });

    if(!usable) return;
    list.append(chart);
    list.classList.add('vertical-ready');
  }

  function scan(){
    document.querySelectorAll('.comparison-list').forEach(upgrade);
  }

  const root=document.getElementById('predictionList');
  if(!root) return;
  scan();
  const observer=new MutationObserver(scan);
  observer.observe(root,{childList:true,subtree:true});
})();
