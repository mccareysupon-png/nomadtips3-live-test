const select=selector=>document.querySelector(selector);
const editControls=['#editTop','#editDetails','#uploadButton','#removePhoto','#savePreferences'];
let profile=null;
let busy=false;
let editTrigger=null;
let toastTimer;
const notify=message=>{clearTimeout(toastTimer);select('#toast').textContent=message;toastTimer=setTimeout(()=>{select('#toast').textContent='';},6000);};
const setBusy=value=>{busy=value;for(const selector of editControls){select(selector).disabled=value||!profile;select(selector).setAttribute('aria-busy',String(value));}select('#editForm button[type=submit]').disabled=value||!profile;};
const formatDate=value=>{if(!value)return 'Not available';const date=new Date(value);return Number.isNaN(date.getTime())?'Not available':new Intl.DateTimeFormat(profile?.locale||'en',{dateStyle:'medium',timeZone:profile?.timeZone||'Asia/Bangkok'}).format(date);};
function renderProfile(){
  const name=profile.displayName||'Your profile';
  select('#profileName').textContent=name;
  select('#detailName').textContent=profile.displayName||'Add a display name';
  for(const selector of ['#summaryEmail','#detailEmail','#securityEmail'])select(selector).textContent=profile.email;
  const avatar=select('#avatar');avatar.replaceChildren();avatar.classList.toggle('empty',!profile.avatar&&!profile.displayName);
  avatar.setAttribute('aria-label',name+' profile avatar');
  if(profile.avatar){const image=document.createElement('img');image.src=profile.avatar;image.alt='';avatar.append(image);}else if(profile.displayName){avatar.textContent=profile.displayName.trim().split(/\s+/u).slice(0,2).map(part=>Array.from(part)[0]).join('').toLocaleUpperCase();}
  select('#removePhoto').hidden=!profile.avatar;
  const membership=profile.membership;
  const active=membership.status==='ACTIVE';
  const lifetime=membership.accessType==='LIFETIME';
  const access=active?'Active':'Access unavailable';
  select('#accessBadge').textContent=access;
  select('#summaryPlan').textContent=membership.plan||'BALL46 MEMBER';
  select('#summaryAccess').textContent=lifetime?'Owner access':access;
  select('#detailAccess').textContent=access;
  select('#detailUpdated').textContent=profile.updatedAt?formatDate(profile.updatedAt):'Not updated yet';
  select('#securitySession').textContent='Verified';
  select('#subscriptionStatus').textContent=lifetime?'Not applicable':membership.accessType==='SUBSCRIPTION'?'Verified subscription':'Not connected';
  select('#membershipStatus').textContent=access;
  const renewalLabel=select('#renewalDate').previousElementSibling;
  renewalLabel.textContent=membership.cancelAtPeriodEnd?'Access until':'Next renewal';
  select('#renewalDate').textContent=lifetime?'Not applicable':formatDate(membership.currentPeriodEnd);
  select('#language').value=profile.locale;
  if(!Array.from(select('#timezone').options).some(option=>option.value===profile.timeZone)){
    const option=document.createElement('option');option.value=profile.timeZone;option.textContent=profile.timeZone;select('#timezone').append(option);
  }
  select('#timezone').value=profile.timeZone;
  select('#motion').setAttribute('aria-checked',String(profile.reducedMotion));
  document.documentElement.dataset.reducedMotion=String(profile.reducedMotion);
}
const editable=()=>({version:profile.version,displayName:profile.displayName,avatar:profile.avatar,locale:profile.locale,timeZone:profile.timeZone,reducedMotion:profile.reducedMotion});
const errorText=error=>({PROFILE_CONFLICT:'This profile changed in another tab. Reload the page before saving.',MEMBERSHIP_AUTH_REQUIRED:'Your session or membership could not be verified. Open Signal Center to sign in again.',PROFILE_STORAGE_UNAVAILABLE:'Profile storage is temporarily unavailable. Please try again.',INVALID_NAME:'Enter a display name using 1–60 visible characters.',INVALID_AVATAR:'The photo could not be saved. Choose a different image.'})[error]||'Your changes were not saved. Check your connection and try again.';
async function saveProfile(changes){
  if(busy||!profile)throw Error('PROFILE_BUSY');
  setBusy(true);
  try{
    const response=await fetch('/api/member/profile',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({...editable(),...changes}),signal:AbortSignal.timeout(25000)});
    const data=await response.json();
    if(!response.ok||!data.ok)throw Error(data.error||'SAVE_FAILED');
    profile=data.profile;renderProfile();
    select('#connectionStatus').textContent='';select('#connectionStatus').classList.remove('error');
    notify('Your profile has been saved.');
  }finally{setBusy(false);}
}
const tabs=Array.from(document.querySelectorAll('[role=tab]'));
const activateTab=tab=>{for(const candidate of tabs){const active=candidate===tab;candidate.setAttribute('aria-selected',String(active));candidate.tabIndex=active?0:-1;document.getElementById(candidate.getAttribute('aria-controls')).hidden=!active;}};
for(const [position,tab] of tabs.entries()){
  tab.addEventListener('click',()=>activateTab(tab));
  tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(position+1)%tabs.length;if(event.key==='ArrowLeft')next=(position+tabs.length-1)%tabs.length;if(event.key==='Home')next=0;if(event.key==='End')next=tabs.length-1;if(next!==undefined){event.preventDefault();activateTab(tabs[next]);tabs[next].focus();}});
}
const openEditor=event=>{if(!profile||busy)return;editTrigger=event.currentTarget;select('#nameInput').value=profile.displayName;select('#nameError').textContent='';select('#editDialog').showModal();select('#nameInput').focus();};
select('#editTop').addEventListener('click',openEditor);select('#editDetails').addEventListener('click',openEditor);
select('#cancelEdit').addEventListener('click',()=>{if(!busy)select('#editDialog').close();});
select('#editDialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});
select('#editDialog').addEventListener('close',()=>editTrigger?.focus());
select('#editForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const displayName=select('#nameInput').value.trim().replace(/\s+/gu,' ');
  if(!displayName||Array.from(displayName).length>60||/[\p{Cc}\p{Cf}]/u.test(displayName)){select('#nameError').textContent='Enter a name using 1–60 visible characters.';return;}
  try{await saveProfile({displayName});select('#editDialog').close();}catch(error){select('#nameError').textContent=errorText(error.message);}
});
select('#uploadButton').addEventListener('click',()=>{if(!busy&&profile)select('#photoInput').click();});
select('#photoInput').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file||busy||!profile)return;
  select('#photoError').textContent='';
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>2*1024*1024){select('#photoError').textContent='Choose a JPG, PNG or WebP image no larger than 2 MB.';return;}
  const objectUrl=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=objectUrl;await image.decode();
    if(!image.naturalWidth||image.naturalWidth*image.naturalHeight>24000000)throw Error('INVALID_AVATAR');
    const size=Math.min(image.naturalWidth,image.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    canvas.getContext('2d').drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,512,512);
    const avatar=canvas.toDataURL('image/webp',.82);
    if(avatar.length>260000)throw Error('INVALID_AVATAR');
    await saveProfile({avatar});
  }catch(error){select('#photoError').textContent=errorText(error.message);}finally{URL.revokeObjectURL(objectUrl);}
});
select('#removePhoto').addEventListener('click',async()=>{if(busy||!profile)return;try{await saveProfile({avatar:null});}catch(error){select('#photoError').textContent=errorText(error.message);}});
select('#motion').addEventListener('click',event=>{const control=event.currentTarget;const enabled=control.getAttribute('aria-checked')!=='true';control.setAttribute('aria-checked',String(enabled));document.documentElement.dataset.reducedMotion=String(enabled);});
select('#savePreferences').addEventListener('click',async()=>{if(busy||!profile)return;try{await saveProfile({locale:select('#language').value,timeZone:select('#timezone').value,reducedMotion:select('#motion').getAttribute('aria-checked')==='true'});select('#preferenceStatus').textContent='Your preferences have been saved.';}catch(error){select('#preferenceStatus').textContent=errorText(error.message);}});
async function loadProfile(){
  setBusy(true);
  try{
    const response=await fetch('/api/member/profile',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(25000)});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'LOAD_FAILED');
    profile=data.profile;renderProfile();select('#connectionStatus').textContent='';
  }catch(error){select('#connectionStatus').textContent=error.message==='MEMBERSHIP_AUTH_REQUIRED'?errorText(error.message):'Your profile could not be loaded. Please open Signal Center to check your sign-in, then try again.';select('#connectionStatus').classList.add('error');}
  finally{setBusy(false);}
}
loadProfile();
