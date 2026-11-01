export class MemoryStorage{
 constructor(){this.data=new Map();this.alarmAt=null;this.queue=Promise.resolve();}
 async get(k){return structuredClone(this.data.get(k));}async put(k,v){this.data.set(k,structuredClone(v));}async delete(k){this.data.delete(k);}async getAlarm(){return this.alarmAt;}async setAlarm(n){this.alarmAt=n;}
 async transaction(fn){const work=this.queue.then(()=>fn(this));this.queue=work.catch(()=>{});return work;}
}
export const ctx=s=>({storage:s,blockConcurrencyWhile:fn=>fn()});
export function quotaFixture(at){return{source:'account-coordinator-v1',coverage:'all-workers-and-keys',accountId:'test-account',coordinated:true,at,expiresAt:at+9000,windowResetAt:at+60000,available:30};}
export async function seedQuota(s,at){await s.put('bulkLiveV1AccountQuota',quotaFixture(at));await s.put('bulkLiveV1Telemetry',{startedAt:at,requestTimes:[],response429:0,backoffUntil:0,strikes:0,provider:{limit:40,remaining:30,resetAt:at+60000,at}});}
