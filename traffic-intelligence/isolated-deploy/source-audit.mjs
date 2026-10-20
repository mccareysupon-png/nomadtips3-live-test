// Read-only discovery. Never log or save tokens, raw IPs, paths or request records.
import {mkdir,writeFile} from 'node:fs/promises';
const token=process.env.CLOUDFLARE_API_TOKEN;
if(!token)throw Error('Missing existing audit credential');
const zone='d491ee30b7a87a6c37e6a4dacf00ae8d';
async function gql(query){
 const r=await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
 const j=await r.json();return {http:r.status,data:j.data,errors:j.errors?.map(e=>({message:String(e.message).replace(/[A-Za-z0-9_-]{32,}/g,'[redacted]'),path:e.path}))};
}
const report={checkedAt:new Date().toISOString(),readOnly:true,rawRecordsSaved:false};
const settings=await gql(`{viewer{zones(filter:{zoneTag:"${zone}"}){settings{httpRequestsAdaptive{enabled availableFields maxPageSize maxDuration notOlderThan} httpRequestsAdaptiveGroups{enabled availableFields maxPageSize maxDuration notOlderThan}}}}}`);
report.settings=settings;
const types=await gql('{__schema{types{name}}}');
const selected=(types.data?.__schema?.types||[]).map(x=>x.name).filter(n=>/^ZoneHttpRequestsAdaptive(?:$|Filter_InputObject$|OrderBy$)/.test(n));
report.schema=[];
for(const name of selected)report.schema.push(await gql(`{__type(name:"${name}"){name fields{name type{kind name ofType{kind name}}} inputFields{name type{kind name ofType{kind name}}} enumValues{name}}}`));
const fields=report.schema.flatMap(x=>x.data?.__type?.fields?.map(f=>f.name)||[]);
if(['clientIP','clientCountryName','datetime','clientRequestHTTPHost','clientRequestPath'].every(x=>fields.includes(x))){
 const end=new Date(Date.now()-180000).toISOString(),start=new Date(Date.parse(end)-86400000).toISOString();
 const names=['clientIP','clientCountryName','datetime','clientRequestHTTPHost','clientRequestPath','sampleInterval','requestSource','userAgent'].filter(x=>fields.includes(x));
 const raw=await gql(`{viewer{zones(filter:{zoneTag:"${zone}"}){httpRequestsAdaptive(limit:10,filter:{datetime_geq:"${start}",datetime_lt:"${end}",clientRequestHTTPHost_in:["ball46.com","www.ball46.com"],requestSource:"eyeball"},orderBy:[datetime_DESC]){${names.join(' ')}}}}}`);
 const rows=raw.data?.viewer?.zones?.[0]?.httpRequestsAdaptive;
 report.dataProbe={http:raw.http,errors:raw.errors,start,end,returned:Array.isArray(rows)?rows.length:null,fields:names,hasIPv4:rows?.some(x=>/^\d+\.\d+\.\d+\.\d+$/.test(x.clientIP)),hasIPv6:rows?.some(x=>x.clientIP?.includes(':')),countries:rows?[...new Set(rows.map(x=>x.clientCountryName))]:null,onlyMainHosts:rows?.every(x=>['ball46.com','www.ball46.com'].includes(x.clientRequestHTTPHost))};
}
await mkdir('source-audit-evidence',{recursive:true});
await writeFile('source-audit-evidence/availability.json',JSON.stringify(report,null,2));
console.log('READ_ONLY_SOURCE_AUDIT',JSON.stringify(report));
