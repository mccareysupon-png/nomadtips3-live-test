const fullMarketViews=new WeakMap();
function update(expanded,fixture){
 if(!expanded||!fixture)return;
 const host=expanded.querySelector('[data-full-market-card]');if(!host)return;
 expanded._nomadFixture=fixture;
 const id=fixtureId(fixture),info=inspectFixture(fixture);
 let view=fullMarketViews.get(host);
 if(!view||view.id!==id){view={id,active:''};fullMarketViews.set(host,view);host.dataset.shellSig='';host.dataset.panelSig=''}
 if(!info.books.some(b=>b.slug===view.active))view.active='';
 const active=view.active,shellSig=info.books.map(b=>`${b.slug}:${b.found?1:0}`).join('|');
 if(host.dataset.shellSig!==shellSig){const scroll=host.querySelector('[data-fmb-tabs]')?.scrollLeft||0;host.innerHTML=shellHtml(info,active);const tabs=host.querySelector('[data-fmb-tabs]');if(tabs)tabs.scrollLeft=scroll;host.dataset.shellSig=shellSig;host.dataset.panelSig=''}
 host.querySelectorAll('[data-fmb-book]').forEach(button=>{const selected=button.dataset.fmbBook===active;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected))});
 const panel=host.querySelector('[data-fmb-panel]');if(!panel)return;
 if(!active){panel.replaceChildren();panel.hidden=true;host.dataset.panelSig='';return}
 panel.hidden=false;
 const book=info.books.find(b=>b.slug===active),signature=stableString({active,data:book?.data||null});
 if(host.dataset.panelSig!==signature){panel.innerHTML=renderBookHtml(fixture,active,info);host.dataset.panelSig=signature}
}
function chooseBook(button){
 const expanded=button.closest('.match-expanded'),fixture=expanded?._nomadFixture,host=expanded?.querySelector('[data-full-market-card]');if(!fixture||!host)return;
 const view=fullMarketViews.get(host),clicked=String(button.dataset.fmbBook||'');if(!view||!clicked)return;
 view.active=view.active===clicked?'':clicked;update(expanded,fixture);
}
