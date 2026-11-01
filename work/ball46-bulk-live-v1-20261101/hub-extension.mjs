import{BulkState}from'./policy.mjs';import{verifyOwner,errorResponse,controlPath}from'./auth.mjs';
export function extendHub(Previous){return class BulkLiveV1 extends Previous{
 constructor(ctx,env){super(ctx,{...env});this.bulkV1=new BulkState(ctx.storage,env.BULK_QUOTA_ACCOUNT_ID);this.env.__bulkV1=this.bulkV1;}
 async control(){return this.bulkV1.control();}
 async setControl(raw){return this.ctx.blockConcurrencyWhile(async()=>{const c=await this.bulkV1.set(raw);await this.scheduleNext(c);return c;});}
 async scheduleNext(c=null,delay=null){const at=await this.bulkV1.schedule(c||await this.control(),delay);await this.ctx.storage.setAlarm(at);return at;}
 async alarm(){const c=await this.control(),m=await this.meta(),t=await this.bulkV1.telemetry(),at=Date.now(),due=Math.max(Number(m?.liveFetchedAt||0)+c.liveRefreshSeconds*1000,t.backoffUntil||0);if(due>at){await this.scheduleNext(c,due-at);return;}try{await this.refreshLive(true);}catch{}await this.scheduleNext(await this.control());}
 async health(){const h=await super.health();return{...h,bulkLiveV1:await this.bulkV1.status()};}
 async settings(){return{ok:true,...await this.health(),presets:[30,20,15],autoReturnOptions:[0]};}
 async fetch(request){if(controlPath(request)==='/control'){try{await verifyOwner(request,this.env,{internal:true});if(request.method==='GET')return Response.json(await this.settings(),{headers:{'cache-control':'no-store'}});if(request.method!=='PUT')return errorResponse(Object.assign(Error('METHOD_NOT_ALLOWED'),{status:405}));const raw=await request.json().catch(()=>null);return Response.json({ok:true,control:await this.setControl(raw),health:await this.health()},{headers:{'cache-control':'no-store'}});}catch(e){return errorResponse(e);}}return super.fetch(request);}
};}
export function wrapHub(previous){return{...previous,async fetch(request,env,ctx){if(controlPath(request)==='/control'){try{await verifyOwner(request,env,{internal:true});}catch(e){return errorResponse(e);}}return previous.fetch(request,env,ctx);}};}
