const HEADERS={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'GET,OPTIONS',
  'access-control-allow-headers':'content-type'
};

const reply=(data,status=200)=>new Response(JSON.stringify(data,null,2),{status,headers:HEADERS});

export default {
  async fetch(request){
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
    const {pathname}=new URL(request.url);
    if(pathname==='/health')return reply({ok:true,service:'CAR LIVESCORE',status:'STOPPED',scraping:false});
    if(pathname==='/scores')return reply({ok:true,service:'CAR LIVESCORE',status:'STOPPED',scraping:false,matches:[],summary:{total:0,live:0,finished:0,upcoming:0,leagues:0}});
    return reply({ok:false,service:'CAR LIVESCORE',status:'STOPPED',scraping:false},410);
  }
};
