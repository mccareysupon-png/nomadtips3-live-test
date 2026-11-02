import{createTestServer}from'./local-test-server.mjs';
await createTestServer({port:8823,ownerOnly:true});console.log('OWNER_30_ONLY ISOLATED PREVIEW http://127.0.0.1:8823/');
