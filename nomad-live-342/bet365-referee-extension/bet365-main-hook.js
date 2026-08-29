(()=>{
'use strict';
if(window.__NOMAD_BET365_SOCKET_HOOK__)return;
window.__NOMAD_BET365_SOCKET_HOOK__=true;
const EVENT='nomad:bet365-raw-frame';
function serializeFrame(value){
  try{
    if(typeof value==='string')return value;
    if(value instanceof ArrayBuffer)return new TextDecoder().decode(new Uint8Array(value));
    if(ArrayBuffer.isView(value))return new TextDecoder().decode(new Uint8Array(value.buffer,value.byteOffset,value.byteLength));
    if(value&&typeof value==='object'&&typeof value.data==='string')return value.data;
    return String(value??'');
  }catch{return '';}
}
function wrap(proto){
  if(!proto||typeof proto.socketDataCallback!=='function')return false;
  const current=proto.socketDataCallback;
  if(current.__nomadBet365Wrapped)return true;
  function wrapper(){
    try{
      let lang=null;
      try{if(window.GamingContext&&window.GamingContext.languageId!=null)lang=window.GamingContext.languageId;}catch{}
      const data=serializeFrame(arguments[0]);
      if(data)window.dispatchEvent(new CustomEvent(EVENT,{detail:JSON.stringify({data,lang,received_at_utc:new Date().toISOString()})}));
    }catch{}
    return current.apply(this,arguments);
  }
  Object.defineProperty(wrapper,'__nomadBet365Wrapped',{value:true});
  try{proto.socketDataCallback=wrapper;return true;}catch{return false;}
}
function hook(){
  try{
    const proto=window.readit?.WebsocketTransportMethod?.prototype;
    if(wrap(proto))return;
  }catch{}
  setTimeout(hook,250);
}
hook();
})();