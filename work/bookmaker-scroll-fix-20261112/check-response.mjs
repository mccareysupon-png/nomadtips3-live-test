export function responseJSON(r,path){
 const meta={path,status:r.status,contentType:r.headers?.['content-type']||'',cfMitigated:r.headers?.['cf-mitigated']||null,cfRay:r.headers?.['cf-ray']||null};
 const text=r.body.toString(),challenge=meta.cfMitigated==='challenge'||(/text\/html/i.test(meta.contentType)&&text.includes('challenge-platform')&&text.includes('Just a moment'));
 if(challenge)throw Object.assign(Error('CLOUDFLARE_CHALLENGE:'+path),{code:'CLOUDFLARE_CHALLENGE',meta});
 if(!/\bapplication\/(?:[\w.+-]+\+)?json\b/i.test(meta.contentType))throw Object.assign(Error('EXPECTED_JSON:'+path),{code:'EXPECTED_JSON',meta});
 try{return JSON.parse(text)}catch{throw Object.assign(Error('INVALID_JSON:'+path),{code:'INVALID_JSON',meta})}
}
