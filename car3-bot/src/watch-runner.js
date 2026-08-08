import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const inboxDir = path.join(projectDir, 'signals', 'inbox');
const processedDir = path.join(projectDir, 'signals', 'processed');
const failedDir = path.join(projectDir, 'signals', 'failed');
const paperRunner = path.join(projectDir, 'src', 'paper-runner.js');

for (const dir of [inboxDir, processedDir, failedDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function stamp() {
  return new Date().toISOString();
}

function moveFile(source, destinationDir) {
  const base = path.basename(source);
  let target = path.join(destinationDir, base);
  if (fs.existsSync(target)) {
    const ext = path.extname(base);
    const name = path.basename(base, ext);
    target = path.join(destinationDir, `${name}-${Date.now()}${ext}`);
  }
  fs.renameSync(source, target);
  return target;
}

function processInbox() {
  const files = fs.readdirSync(inboxDir)
    .filter(name => name.toLowerCase().endsWith('.json'))
    .sort();

  for (const name of files) {
    const source = path.join(inboxDir, name);
    console.log(`[${stamp()}] SIGNAL FOUND: ${name}`);

    const result = spawnSync(process.execPath, [paperRunner, source], {
      cwd: projectDir,
      encoding: 'utf8'
    });

    if (result.status === 0) {
      const moved = moveFile(source, processedDir);
      console.log(`[${stamp()}] PAPER ORDER RECORDED -> ${path.basename(moved)}`);
      if (result.stdout?.trim()) console.log(result.stdout.trim());
    } else {
      const moved = moveFile(source, failedDir);
      console.error(`[${stamp()}] SIGNAL FAILED -> ${path.basename(moved)}`);
      if (result.stderr?.trim()) console.error(result.stderr.trim());
      if (result.stdout?.trim()) console.error(result.stdout.trim());
    }
  }
}

console.log('========================================');
console.log('NOMAD TIPS 3 — CAR 3 PAPER BOT WATCHER');
console.log('MODE: PAPER_ONLY');
console.log('ACTION: WOULD_EXECUTE');
console.log('REAL TRANSACTION: DISABLED');
console.log(`INBOX: ${inboxDir}`);
console.log('Press Ctrl+C to stop.');
console.log('========================================');

processInbox();
const timer = setInterval(processInbox, 2000);

process.on('SIGINT', () => {
  clearInterval(timer);
  console.log('\nCAR 3 watcher stopped.');
  process.exit(0);
});
