// Surgical patch of original BALL46 League Flags 3.43 asset; all mappings, markup and CSS preserved.
export const NEW_FLAG=" function flag(code){\n   if(code==='WORLD'||!code)return globe();\n   const img=document.createElement('img');\n   img.className='league-flag';\n   img.alt='';\n   img.setAttribute('aria-hidden','true');\n   img.width=16;\n   img.height=12;\n   img.loading='eager';\n   img.decoding='async';\n   img.referrerPolicy='no-referrer';\n   let fallbackTried=false;\n   img.addEventListener('error',()=>{\n     if(!fallbackTried){\n       fallbackTried=true;\n       img.src=FLAG_FALLBACK+code+'.svg';\n     }else if(img.isConnected)img.replaceWith(globe());\n   });\n   img.src=iconUrl(code);\n   return img;\n }\n";
export const OLD_START=' function flag(code){';
export const OLD_END=' function decorateLine(line){';
export function transformFlagJS(source){
 const find=a=>source.split(a).length-1;
 if(find(OLD_START)!==1||find(OLD_END)!==1)throw Error('FLAG_343_FUNCTION_ANCHOR_DRIFT');
 const i=source.indexOf(OLD_START),j=source.indexOf(OLD_END,i);
 if(!(i>=0&&j>i&&j-i<2000))throw Error('FLAG_343_BODY_POSITION_INVALID');
 const original=source.slice(i,j);
 for(const exact of ["const placeholder=globe();","img.addEventListener('load',()=>{if(placeholder.isConnected)placeholder.replaceWith(img)});","return placeholder;"]){
   if(!original.includes(exact))throw Error('FLAG_343_ORIGINAL_BEHAVIOR_CHANGED: '+exact);
 }
 const result=source.slice(0,i)+NEW_FLAG+source.slice(j);
 if(result.includes('if(placeholder.isConnected)placeholder.replaceWith(img)'))throw Error('FLAG_343_OLD_BLINK_CODE_REMAINS');
 if(result===source)throw Error('FLAG_343_PATCH_NO_OP');
 return result;
}