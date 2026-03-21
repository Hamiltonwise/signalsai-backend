const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const ENV_FILE = path.join(DIR, '.env');
const SANDBOX_FILE = path.join(DIR, '.env.sandbox');
const LIVE_FILE = path.join(DIR, '.env.live');
const ACTIVE_FILE = path.join(DIR, '.env.active');

function getActiveEnv() {
  try {
    return fs.readFileSync(ACTIVE_FILE, 'utf-8').trim();
  } catch {
    return 'live';
  }
}

function getDbHost(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const match = content.match(/^DB_HOST=(.+)$/m);
  return match ? match[1] : 'unknown';
}

const current = getActiveEnv();

if (current === 'live') {
  // Switch to sandbox
  fs.renameSync(ENV_FILE, LIVE_FILE);
  fs.renameSync(SANDBOX_FILE, ENV_FILE);
  fs.writeFileSync(ACTIVE_FILE, 'sandbox');

  const dbHost = getDbHost(ENV_FILE);
  console.log('\n  Switched to SANDBOX environment');
  console.log(`  DB → ${dbHost}`);
  console.log('  Redis → local (127.0.0.1)');
  console.log('  Stripe → test keys');
  console.log('  N8N → webhook-test\n');

} else if (current === 'sandbox') {
  // Switch to live
  fs.renameSync(ENV_FILE, SANDBOX_FILE);
  fs.renameSync(LIVE_FILE, ENV_FILE);
  fs.writeFileSync(ACTIVE_FILE, 'live');

  const dbHost = getDbHost(ENV_FILE);
  console.log('\n  Switched to LIVE environment');
  console.log(`  DB → ${dbHost}`);
  console.log('  Redis → ElastiCache (TLS)');
  console.log('  Stripe → live keys');
  console.log('  N8N → production webhook\n');

} else {
  console.error(`Unknown active env: "${current}". Expected "live" or "sandbox".`);
  process.exit(1);
}
