(() => {
  'use strict';

  const AI_KEY = 'nomadtips3.ai-learning-lab.v1';
  const REMOTE_URL = './ai-learning-state.json';
  const SYNC_MS = 5 * 60 * 1000;

  const readLocal = () => {
    try { return JSON.parse(localStorage.getItem(AI_KEY) || 'null'); }
    catch { return null; }
  };

  const normalizeRemoteSnapshots = snapshots => {
    const normalized = {};
    Object.values(snapshots || {}).forEach(snapshot => {
      const providerId = String(snapshot?.providerFixtureId || '').trim();
      const key = providerId ? `AUTO-${providerId}` : String(snapshot?.fixtureId || '');
      if (!key) return;
      normalized[key] = {...snapshot, fixtureId:key};
    });
    return normalized;
  };

  async function syncRemoteCar4State() {
    try {
      const response = await fetch(`${REMOTE_URL}?t=${Date.now()}`, {cache:'no-store'});
      if (!response.ok) return;
      const remote = await response.json();
      if (!remote || remote.version !== 'add-k-ai-v0.1') return;

      const local = readLocal() || {};
      const remoteSnapshots = normalizeRemoteSnapshots(remote.snapshots);
      const merged = {
        ...local,
        ...remote,
        snapshots: {...(local.snapshots || {}), ...remoteSnapshots},
        weights: {...(local.weights || {}), ...(remote.weights || {})},
        trainedIds: [...new Set([...(local.trainedIds || []), ...(remote.trainedIds || []).map(id => {
          const snapshot = remote.snapshots?.[id];
          const providerId = String(snapshot?.providerFixtureId || '').trim();
          return providerId ? `AUTO-${providerId}` : id;
        })])],
        logs: [...(remote.logs || []), ...(local.logs || [])]
          .filter((item, index, list) => list.findIndex(other => other.id === item.id) === index)
          .slice(0, 120),
        trainingSamples: Math.max(Number(local.trainingSamples || 0), Number(remote.trainingSamples || 0)),
        remote24h: {
          enabled: true,
          lastAutoRunAt: remote.lastAutoRunAt || null,
          automationVersion: remote.automationVersion || null,
          footballApiCallsByCar4: Number(remote.source?.footballApiCallsByCar4 || 0)
        }
      };

      localStorage.setItem(AI_KEY, JSON.stringify(merged));
      window.dispatchEvent(new StorageEvent('storage', {key:AI_KEY, newValue:JSON.stringify(merged)}));
    } catch (error) {
      console.debug('Car 4 remote 24H state sync pending', error);
    }
  }

  window.__car4RemoteSync = syncRemoteCar4State;
  syncRemoteCar4State();
  window.setInterval(syncRemoteCar4State, SYNC_MS);
})();
