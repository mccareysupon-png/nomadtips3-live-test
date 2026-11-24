export const B46_OU_ALLTIME_DEFAULT_V2='B46_OU_ALLTIME_DEFAULT_V2';
export function patchOuDefaultAlltimeClient(client){
 if(typeof client!=='string'||!client.includes('B46_OU_ALL_ACCOUNTS_OVERVIEW_V1'))throw Error('OVERVIEW_V1_NOT_INSTALLED');
 if(client.includes(B46_OU_ALLTIME_DEFAULT_V2))throw Error('OU_ALLTIME_ALREADY_INSTALLED');
 const from='    const previousMode=mode;\n    if(!previousMode){window.scrollTo(0,0);}';
 const to=`    const previousMode=mode;
    // B46_OU_ALLTIME_DEFAULT_V2: use the same accounting span as
    // CUMULATIVE UNITS when entering O/U; explicit direct Today links are honored.
    if(modeNext==='ou'&&previousMode!=='ou'){
      const query=new URLSearchParams(location.search);
      const directOu=query.get('b46pm')==='ou';
      const requested=query.get('b46pmPeriod');
      if(!(directOu&&(requested==='today'||requested==='all')))statsPeriod='all';
    }
    if(!previousMode){window.scrollTo(0,0);}`;
 const count=client.split(from).length-1;
 if(count!==1)throw Error('OU_SHOW_ROUTER_ANCHOR_DRIFT_'+count);
 return client.replace(from,to);
}
export function patchOuDefaultAlltimeWorker(worker){
 const pattern=/var prematchClientScript = ("(?:\\.|[^"\\])*");/;
 const found=worker.match(pattern);
 if(!found)throw Error('NATIVE_CLIENT_NOT_FOUND');
 const client=patchOuDefaultAlltimeClient(JSON.parse(found[1]));
 return {worker:worker.replace(found[0],'var prematchClientScript = '+JSON.stringify(client)+';'),client};
}
