const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};

export default {
  async fetch(){
    return new Response(JSON.stringify({ok:false,status:'disabled'}),{status:410,headers});
  }
};
