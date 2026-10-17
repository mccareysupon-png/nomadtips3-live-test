import fs from "node:fs";
import {createHash} from "node:crypto";
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const worker="nomadtips3-engine-343";
const activeVersion="9b363777-64fc-4a48-a10a-0fad822640cb";
const report={scope:"READ_ONLY_PRODUCTION_SCRIPT_FINGERPRINT",at:new Date().toISOString(),worker,
 expectedVersion:activeVersion,operations:["GET_ONLY"],results:[],writes:0,release:"HOLD"};
const root="https://api.cloudflare.com/client/v4/accounts/"+encodeURIComponent(account??"")+"/workers/scripts/"+worker;
const headers={authorization:"Bearer "+(token??"")};
const samples=[
 {kind:"worker-script-current",url:root},
 {kind:"active-version-metadata",url:root+"/versions/"+activeVersion},
 {kind:"script-settings",url:root+"/settings"}
];
for(const sample of samples){
 if(!account||!token){report.results.push({kind:sample.kind,reason:"SECRETS_MISSING"});continue;}
 try{
  const response=await fetch(sample.url,{method:"GET",headers,redirect:"error",signal:AbortSignal.timeout(18000)});
  if(!response.ok){report.results.push({kind:sample.kind,http:response.status,reason:"HTTP_ERROR"});continue;}
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>16_000_000){report.results.push({kind:sample.kind,http:200,reason:"TOO_LARGE"});continue;}
  const ct=response.headers.get("content-type")??"";
  const entry={kind:sample.kind,http:200,contentType:ct,bytes:bytes.length,
   sha256:createHash("sha256").update(bytes).digest("hex")};
  if(sample.kind==="worker-script-current"){
    const s=bytes.toString("utf8");
    const patterns=["PENDING","SETTLED","finalScore","settlementRevision","settlementBasis",
      "kickoffUtc","sourceFixtureId","DurableObject","ctx.storage","transaction",
      "status:'PENDING'","status:\"PENDING\"","sourceIds","hubSnapshot",
      "SETTLEMENT","fivedollar","Goaloo"];
    entry.signatures=Object.fromEntries(patterns.map(w=>[w,s.toLowerCase().includes(w.toLowerCase())]));
  }else {
    try {
      const j=JSON.parse(bytes.toString("utf8"));
      if(sample.kind==="active-version-metadata"){
        entry.success=j.success??null;
        entry.resultKeys=Object.keys(j.result??{}).slice(0,25);
        entry.versionId=j.result?.id??j.result?.version_id??null;
        entry.createdOn=j.result?.created_on??null;
      }else{
        entry.success=j.success??null;
        const bindings=j.result?.bindings??[];
        entry.bindingTypes=Array.isArray(bindings)?bindings.map(x=>x.type).filter(Boolean):[];
        entry.resultKeys=Object.keys(j.result??{}).filter(k=>k!=="bindings").slice(0,25);
      }
    }catch{entry.jsonParse="NOT_JSON"}
  }
  report.results.push(entry);
 }catch(e){report.results.push({kind:sample.kind,reason:String(e?.message??e).slice(0,120)})}
}
fs.writeFileSync("engine343-active-source-audit.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report));
