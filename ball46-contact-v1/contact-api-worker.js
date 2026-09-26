const DEFAULT_ALLOWED_ORIGINS=['https://ball46.com','https://www.ball46.com'];
const TOPICS=new Set(['general','live-data','statistics','technical','partnership','other']);

const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const clean=(value,max)=>String(value??'').replace(/\0/g,'').trim().slice(0,max);
const escapeHtml=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&value.length<=160;

function allowedOrigins(env){
  const configured=clean(env.CONTACT_ALLOWED_ORIGINS,1000);
  return configured?configured.split(',').map(x=>x.trim()).filter(Boolean):DEFAULT_ALLOWED_ORIGINS;
}

function cors(origin,env){
  const allowed=allowedOrigins(env);
  return allowed.includes(origin)?{'access-control-allow-origin':origin,'vary':'Origin','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'}:{};
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname!=='/api/contact')return new Response('Not Found',{status:404});

    const origin=request.headers.get('origin')||'';
    const headers=cors(origin,env);
    if(origin&&!headers['access-control-allow-origin'])return json({ok:false,error:'ORIGIN_NOT_ALLOWED'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405,{...headers,allow:'POST, OPTIONS'});
    if(!env.RESEND_API_KEY)return json({ok:false,error:'CONTACT_NOT_CONFIGURED'},503,headers);

    const type=(request.headers.get('content-type')||'').toLowerCase();
    if(!type.includes('application/json'))return json({ok:false,error:'JSON_REQUIRED'},415,headers);
    const length=Number(request.headers.get('content-length')||0);
    if(length>18000)return json({ok:false,error:'PAYLOAD_TOO_LARGE'},413,headers);

    let body;
    try{body=await request.json()}catch{return json({ok:false,error:'INVALID_JSON'},400,headers)}

    const name=clean(body.name,80);
    const email=clean(body.email,160).toLowerCase();
    const topic=clean(body.topic,40);
    const subject=clean(body.subject,140).replace(/[\r\n]+/g,' ');
    const message=clean(body.message,5000);
    const honeypot=clean(body.company_website,200);
    const startedAt=Number(body.started_at||0);
    const age=Date.now()-startedAt;

    // Quietly accept obvious bots so they do not learn the trap.
    if(honeypot)return json({ok:true},200,headers);
    if(!Number.isFinite(age)||age<1800||age>86400000)return json({ok:false,error:'FORM_SESSION_INVALID'},400,headers);
    if(name.length<2||!validEmail(email)||!TOPICS.has(topic)||subject.length<3||message.length<10)return json({ok:false,error:'VALIDATION_FAILED'},400,headers);

    const topicLabel={general:'General enquiry','live-data':'Live score / live data',statistics:'Statistics',technical:'Technical issue',partnership:'Partnership / business',other:'Other'}[topic]||'Other';
    const safeName=escapeHtml(name),safeEmail=escapeHtml(email),safeSubject=escapeHtml(subject),safeMessage=escapeHtml(message).replace(/\n/g,'<br>'),safeTopic=escapeHtml(topicLabel);
    const from=clean(env.CONTACT_FROM,200)||'Ball46 Contact <contact@nomadtips3.com>';
    const to=clean(env.CONTACT_TO,200)||'jay@ball46.com';
    const mailSubject=`[Ball46 Contact] ${subject}`.slice(0,190);
    const html=`<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#101828;background:#f8fafc;padding:24px"><table cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e4e7ec"><tr><td style="padding:24px"><p style="font-size:12px;line-height:18px;color:#16803c;font-weight:700;margin:0 0 8px">BALL46 CONTACT</p><h1 style="font-size:22px;line-height:30px;color:#101828;margin:0 0 22px">${safeSubject}</h1><p style="font-size:14px;line-height:22px;color:#475467;margin:0 0 8px"><strong>From:</strong> ${safeName} &lt;${safeEmail}&gt;</p><p style="font-size:14px;line-height:22px;color:#475467;margin:0 0 22px"><strong>Topic:</strong> ${safeTopic}</p><hr style="border:0;border-top:1px solid #e4e7ec;margin:0 0 22px"><p style="font-size:15px;line-height:24px;color:#101828;margin:0">${safeMessage}</p></td></tr></table></td></tr></table></body></html>`;
    const text=`Ball46 Contact\n\nFrom: ${name} <${email}>\nTopic: ${topicLabel}\nSubject: ${subject}\n\n${message}`;

    let resend;
    try{
      resend=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from,to:[to],reply_to:email,subject:mailSubject,html,text})});
    }catch{return json({ok:false,error:'DELIVERY_UNAVAILABLE'},502,headers)}

    if(!resend.ok){
      // Deliberately do not return Resend's body to the public client.
      console.error('Ball46 contact delivery failed',resend.status);
      return json({ok:false,error:'DELIVERY_FAILED'},502,headers);
    }
    return json({ok:true},200,headers);
  }
};
