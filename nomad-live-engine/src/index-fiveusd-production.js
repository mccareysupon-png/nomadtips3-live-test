import worker,{EngineState as FiveUsdAuthorityEngineState} from './index-fiveusd-test.js';

const JSON_HEADERS={'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:JSON_HEADERS});

export class EngineState extends FiveUsdAuthorityEngineState{
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/feed'&&request.method==='GET'){
      const internal=new URL(request.url);
      internal.pathname='/fiveusd-feed';
      const response=await super.fetch(new Request(internal,request));
      let body=null;
      try{body=await response.clone().json();}catch{return response;}
      return json({
        ...body,
        source:'5DollarFootballAPI',
        sourceOfTruth:true,
        liveOnly:true,
        productionDataSource:true,
      },response.status);
    }
    return super.fetch(request);
  }
}

export default worker;
