async function connectMemberProfile(){
  const chip=document.querySelector('.member-chip');if(!chip)return;
  chip.setAttribute('role','link');chip.setAttribute('tabindex','0');chip.setAttribute('aria-label','Open your profile and account settings');chip.style.cursor='pointer';
  const openProfile=()=>location.assign('/member?view=profile');
  chip.addEventListener('click',openProfile);
  chip.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openProfile();}});
  try{
    const response=await fetch('/api/member/profile',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(25000)});
    const data=await response.json();if(!response.ok||!data.ok)return;
    const profile=data.profile;
    const name=document.querySelector('#memberName'),avatar=document.querySelector('#memberAvatar');
    if(!name||!avatar)return;
    const sync=()=>{
      if(profile.displayName&&name.textContent!==profile.displayName)name.textContent=profile.displayName;
      if(profile.avatar&&!avatar.querySelector('img')){const image=document.createElement('img');image.src=profile.avatar;image.alt='';image.style.cssText='width:100%;height:100%;object-fit:cover;border-radius:inherit';avatar.replaceChildren(image);}
    };
    sync();const observer=new MutationObserver(sync);observer.observe(name,{childList:true});observer.observe(avatar,{childList:true});
  }catch{}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',connectMemberProfile,{once:true});else connectMemberProfile();
