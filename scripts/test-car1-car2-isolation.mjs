import fs from 'node:fs';

const syncSource = fs.readFileSync('test-system/selected-odds-sync.js', 'utf8');
const statsSyncSource = fs.readFileSync('test-system/stats/official-final-sync.js', 'utf8');
const liveTestWorkflow = fs.readFileSync('.github/workflows/resolve-live-test-request.yml', 'utf8');
const testSelection = JSON.parse(fs.readFileSync('test-system/data/selected-live-matches.json', 'utf8'));
const testResults = JSON.parse(fs.readFileSync('test-system/data/result-feed.json', 'utf8'));
const productionRules = JSON.parse(fs.readFileSync('config/nomad-auto-rules.json', 'utf8'));

const fail = message => {
  throw new Error(`Car 1 / Car 2 isolation failed: ${message}`);
};

if (syncSource.includes("new URL('../selected-live-matches.json'")) fail('Machine 2 still reads the Production selection file');
if (syncSource.includes("new URL('../result-feed.json'")) fail('Machine 2 still reads the Production result feed');
if (!syncSource.includes("new URL('./data/selected-live-matches.json'")) fail('Machine 2 test selection path is missing');
if (!syncSource.includes("new URL('./data/result-feed.json'")) fail('Machine 2 test result path is missing');
if (!syncSource.includes("EXPECTED_ENVIRONMENT = 'TEST_ONLY'")) fail('Machine 2 environment guard is missing');
if (statsSyncSource.includes("new URL('../../result-feed.json'")) fail('Machine 2 statistics still read the Production result feed');
if (!statsSyncSource.includes("new URL('../data/result-feed.json'")) fail('Machine 2 statistics result path is missing');
if (testSelection.environment !== 'TEST_ONLY') fail('Machine 2 payload is not TEST_ONLY');
if (testResults.environment !== 'TEST_ONLY') fail('Machine 2 result payload is not TEST_ONLY');
const machineTwoParked =
  liveTestWorkflow.includes('MACHINE 2 PARKED') &&
  /if:\s*\$\{\{\s*false\s*\}\}/.test(liveTestWorkflow);

if (liveTestWorkflow.includes("config_path=Path('selected-live-matches.json')")) fail('Machine 2 live-test workflow can still write the Production selection file');
if (machineTwoParked) {
  if (/^\s*schedule:/m.test(liveTestWorkflow)) fail('Parked Machine 2 must not have a schedule trigger');
  if (/^\s*push:/m.test(liveTestWorkflow)) fail('Parked Machine 2 must not have a push trigger');
} else if (!liveTestWorkflow.includes("config_path=Path('test-system/data/selected-live-matches.json')")) {
  fail('Active Machine 2 live-test output path is missing');
}
if (Number(productionRules.minimum_main_odds) !== 1.7) fail('Production minimum odds must remain 1.70');
if (Number(productionRules.minimum_confidence) !== 58) fail('Production minimum confidence must remain 58%');

console.log(JSON.stringify({
  status: 'CAR_1_CAR_2_ISOLATED',
  production: {minimumMainOdds: 1.7, minimumConfidence: 58},
  machineTwo: machineTwoParked ? 'PARKED' : 'TEST_ONLY',
  testSelection: 'test-system/data/selected-live-matches.json',
}));
