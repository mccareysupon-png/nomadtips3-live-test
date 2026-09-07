(()=>{
  'use strict';

  const toRoman=value=>{
    const number=Math.trunc(Number(value));
    if(!Number.isFinite(number)||number<=0)return '—';
    if(number>3999)return String(number);
    const pairs=[
      [1000,'M'],[900,'CM'],[500,'D'],[400,'CD'],[100,'C'],[90,'XC'],
      [50,'L'],[40,'XL'],[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']
    ];
    let rest=number;
    let roman='';
    for(const [amount,glyph] of pairs){
      while(rest>=amount){roman+=glyph;rest-=amount;}
    }
    return roman;
  };

  const label=document.getElementById('heroLabel');
  const count=document.getElementById('pickCount');
  const small=document.getElementById('heroSmall');
  if(!label||!count||!small)return;

  label.textContent='SIRIUS DECREE';
  small.textContent='VERDICTS BESTOWED';

  const romanize=()=>{
    const raw=count.textContent.trim();
    if(/^\d+$/.test(raw))count.textContent=toRoman(raw);
  };

  romanize();
  const observer=new MutationObserver(romanize);
  observer.observe(count,{childList:true,characterData:true,subtree:true});
})();
