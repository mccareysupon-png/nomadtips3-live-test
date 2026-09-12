(()=>{
'use strict';
const VERSION='343-language-menu-v1-scaffold';
const STORAGE_KEY='nomad343_language_v1';
const BASE_STANDARD='Football Language Standard 3.43 · English v1';
const LANGUAGES=[
  {code:'en',label:'English',ready:true},
  {code:'es',label:'Español',ready:false},
  {code:'pt-BR',label:'Português (Brasil)',ready:false},
  {code:'fr',label:'Français',ready:false},
  {code:'ar',label:'العربية',ready:false},
  {code:'id',label:'Bahasa Indonesia',ready:false},
  {code:'th',label:'ไทย',ready:false}
];

function safeStoredLanguage(){
  try{
    const saved=localStorage.getItem(STORAGE_KEY);
    const found=LANGUAGES.find(x=>x.code===saved&&x.ready);
    return found?.code||'en';
  }catch{return'en'}
}

function injectStyle(){
  if(document.getElementById('nomad343-language-menu-style'))return;
  const style=document.createElement('style');
  style.id='nomad343-language-menu-style';
  style.textContent=`
    .nomad343-language{display:flex;align-items:center;margin-left:10px;flex:0 0 auto}
    .nomad343-language label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
    .nomad343-language select{width:auto;min-width:112px;height:34px;padding:0 30px 0 10px;border:1px solid rgba(255,255,255,.14);background:#12341f;color:#dfe9e1;font-size:10px;font-weight:800;outline:none;cursor:pointer}
    .nomad343-language select:hover,.nomad343-language select:focus{border-color:#d7c54a;color:#fff}
    .nomad343-language option{background:#101612;color:#eef3ef}
    .nomad343-language option:disabled{color:#68736c}
    @media(max-width:760px){
      .nomad343-language{position:absolute;right:10px;top:50%;transform:translateY(-50%);margin-left:0}
      .nomad343-language select{min-width:94px;max-width:104px;height:30px;padding-left:8px;font-size:9px}
    }
  `;
  document.head.appendChild(style);
}

function mount(){
  const host=document.querySelector('.topbar-inner');
  if(!host||host.querySelector('[data-language-343]'))return;
  injectStyle();
  const wrap=document.createElement('div');
  wrap.className='nomad343-language';
  wrap.dataset.language343='1';
  const label=document.createElement('label');
  label.htmlFor='nomad343-language-select';
  label.textContent='Language';
  const select=document.createElement('select');
  select.id='nomad343-language-select';
  select.setAttribute('aria-label','Language');
  for(const language of LANGUAGES){
    const option=document.createElement('option');
    option.value=language.code;
    option.textContent=language.label;
    option.disabled=!language.ready;
    select.appendChild(option);
  }
  const current=safeStoredLanguage();
  select.value=current;
  document.documentElement.lang=current;
  select.addEventListener('change',()=>{
    const chosen=LANGUAGES.find(x=>x.code===select.value&&x.ready);
    const code=chosen?.code||'en';
    select.value=code;
    document.documentElement.lang=code;
    try{localStorage.setItem(STORAGE_KEY,code)}catch{}
    document.dispatchEvent(new CustomEvent('nomad343:language-change',{detail:{language:code}}));
  });
  wrap.append(label,select);
  host.appendChild(wrap);
  window.NOMAD343_LANGUAGE={version:VERSION,baseStandard:BASE_STANDARD,languages:LANGUAGES.map(x=>({...x})),current:()=>select.value};
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
else mount();
})();
