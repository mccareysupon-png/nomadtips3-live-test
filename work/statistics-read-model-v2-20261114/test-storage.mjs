// In-memory simulator of a separately persisted Durable Object KV store.
export class TestDurableStorage{
 constructor(){this.map=new Map();this.reads=0;this.writes=0;this.failAfter=Infinity;this.keyReads=[];}
 async get(key){this.reads++;this.keyReads.push(key);const v=this.map.get(key);return v===undefined?undefined:structuredClone(v);}
 async put(key,value){if(this.writes>=this.failAfter)throw Error('STORAGE_WRITE_TEST_FAULT');this.map.set(key,structuredClone(value));this.writes++;}
 async transaction(callback){
  const old=this.map,thisMap=new Map(old),prior=this.map;this.map=thisMap;
  try{return await callback({get:key=>this.get(key),put:(key,value)=>this.put(key,value)})}
  catch(e){this.map=prior;throw e}
 }
}
