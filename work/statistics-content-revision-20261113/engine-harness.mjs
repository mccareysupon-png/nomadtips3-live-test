// Local Miniflare ONLY. No routes, secrets or Production DO namespace.
import {Nomad343Engine} from './qa/engine-candidate.js';
import {Nomad343Engine as OriginalEngine} from '../engine-memory-diagnosis-20261113/source/nomadtips3-engine-343.js';
export class TestEngine extends Nomad343Engine{
 async scanIfDue(){throw Error('PROVIDER_SCAN_FORBIDDEN')}
 async fetch(request){const u=new URL(request.url);
  if(u.pathname==='/__qa/import'&&request.method==='POST')return Response.json(await this.upsertLedgerRows(await request.json()));
  if(u.pathname==='/__qa/legacy'&&request.method==='GET')return Response.json(await OriginalEngine.prototype.statisticsLedgerResponse.call(this,u.searchParams.get('cursor'),u.searchParams.get('paged')==='1'||u.searchParams.has('cursor')));
  return super.fetch(request);
 }
}
export default{fetch(request,env){return env.LEDGER.get(env.LEDGER.idFromName('isolated-recorded-ledger')).fetch(request)}};
