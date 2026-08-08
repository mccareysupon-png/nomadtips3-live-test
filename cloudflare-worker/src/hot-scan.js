export async function runHotConditionScan() {
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    refreshSeconds: 60,
    candidates: 0,
    ready: 0,
    newSignals: 0,
    dailySignals: 0,
    paused: true,
    reason: 'Hot burst temporarily paused to prevent duplicate full API scans. Main cron scanner remains active every minute.'
  };
}
