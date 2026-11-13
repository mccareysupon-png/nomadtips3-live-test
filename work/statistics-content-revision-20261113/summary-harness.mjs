// Local Miniflare ONLY. Test reset accelerates clocks, never deployed.
import {StatisticsSummary} from './summary-service.mjs';
export class TestSummary extends StatisticsSummary{
 async fetch(request){if(new URL(request.url).pathname==='/__qa/check'){this.checkedAt=0;this.store.minBuildIntervalMs=0;return Response.json({ok:true})}return super.fetch(request)}
}
export default{fetch(request,env){return env.SUMMARY.get(env.SUMMARY.idFromName(new URL(request.url).hostname==='cold.local.test'?'isolated-cold-summary':'isolated-summary')).fetch(request)}};
