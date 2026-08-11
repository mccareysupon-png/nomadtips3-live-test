const apiBase = document.body.dataset.apiBase || '';
const configUrl = `${apiBase}/v2/owner/config`;
const $ = id => document.getElementById(id);

let configVersion = null;

function boolValue(id) {
  return $(id).value === 'true';
}

function numberValue(id, fallback) {
  const value = Number($(id).value);
  return Number.isFinite(value) ? value : fallback;
}

function setAuthorized(authorized) {
  $('saveBtn').disabled = !authorized;
  $('ownerStatus').textContent = authorized ? 'Owner' : 'Locked';
  $('ownerDot').classList.toggle('online', authorized);
}

function fill(config = {}) {
  $('enabled').value = String(config.enabled ?? true);
  $('scoreState').value = (config.score_states || ['ANY'])[0] || 'ANY';
  $('minuteMin').value = config.minute_min ?? 1;
  $('minuteMax').value = config.minute_max ?? 120;
  $('goalGapEnabled').value = String(config.goal_gap_enabled ?? false);
  $('maxGoalGap').value = config.max_goal_gap ?? 99;
  $('statisticsEnabled').value = String(config.statistics_enabled ?? false);
  $('liveOddsEnabled').value = String(config.live_odds_enabled ?? false);
  $('statisticsTtl').value = config.statistics_ttl_seconds ?? 60;
  $('oddsTtl').value = config.live_odds_ttl_seconds ?? 10;
}

function collect() {
  return {
    enabled: boolValue('enabled'),
    statuses: ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE'],
    minute_min: numberValue('minuteMin', 1),
    minute_max: numberValue('minuteMax', 120),
    goal_gap_enabled: boolValue('goalGapEnabled'),
    max_goal_gap: numberValue('maxGoalGap', 99),
    score_states: [$('scoreState').value],
    statistics_enabled: boolValue('statisticsEnabled'),
    live_odds_enabled: boolValue('liveOddsEnabled'),
    statistics_ttl_seconds: numberValue('statisticsTtl', 60),
    live_odds_ttl_seconds: numberValue('oddsTtl', 10)
  };
}

async function loadConfig() {
  $('saveFeedback').textContent = 'Loading owner configuration…';
  try {
    const response = await fetch(configUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);

    const current = data.ownerConfig || { version: 0, config: {} };
    configVersion = current.version || 0;
    fill(current.config || {});
    $('versionText').textContent = `Version ${configVersion}`;
    $('saveFeedback').textContent = 'Owner access confirmed.';
    setAuthorized(true);
  } catch (error) {
    configVersion = null;
    setAuthorized(false);
    $('saveFeedback').textContent = error.message || 'Owner access required.';
  }
}

async function saveConfig() {
  if (configVersion === null) return;
  $('saveBtn').disabled = true;
  $('saveFeedback').textContent = 'Saving…';
  try {
    const response = await fetch(configUrl, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        expectedVersion: configVersion,
        config: collect()
      })
    });
    const data = await response.json();
    if (response.status === 409) throw new Error('Configuration changed. Reload before saving again.');
    if (!response.ok || !data?.ok) throw new Error(data?.error || `HTTP ${response.status}`);

    configVersion = data.ownerConfig?.version ?? configVersion;
    $('versionText').textContent = `Version ${configVersion}`;
    $('saveFeedback').textContent = 'Saved.';
  } catch (error) {
    $('saveFeedback').textContent = error.message || 'Save failed.';
  } finally {
    $('saveBtn').disabled = configVersion === null;
  }
}

$('reloadBtn').addEventListener('click', loadConfig);
$('saveBtn').addEventListener('click', saveConfig);

setAuthorized(false);
loadConfig();
