const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

function resolveFiles() {
  const active = getActiveEnv();
  if (active === 'live') {
    return { liveFile: ENV_FILE, sandboxFile: SANDBOX_FILE };
  }
  return { liveFile: LIVE_FILE, sandboxFile: ENV_FILE };
}

function findExistingValue(filePath, varName) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const regex = new RegExp(`^${varName}=(.*)$`, 'm');
  const match = content.match(regex);
  return match ? match[1] : null;
}

function upsertVariable(filePath, varName, value) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const regex = new RegExp(`^${varName}=.*$`, 'm');

  if (regex.test(content)) {
    content = content.replace(regex, `${varName}=${value}`);
  } else {
    // Append before the SHARED section if it exists, otherwise at end
    const sharedMarker = '# SHARED';
    const idx = content.indexOf(sharedMarker);
    if (idx !== -1) {
      // Find the separator line above SHARED
      const before = content.substring(0, idx);
      const separatorIdx = before.lastIndexOf('# ====');
      const insertAt = separatorIdx !== -1 ? separatorIdx : idx;
      content =
        content.substring(0, insertAt) +
        `${varName}=${value}\n\n` +
        content.substring(insertAt);
    } else {
      content = content.trimEnd() + `\n${varName}=${value}\n`;
    }
  }

  fs.writeFileSync(filePath, content);
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  const { liveFile, sandboxFile } = resolveFiles();
  const active = getActiveEnv();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const varName = (await ask(rl, '  Variable name: ')).trim();
    if (!varName) {
      console.log('  Aborted — no variable name provided.');
      return;
    }

    // Check for existing values
    const existingLive = findExistingValue(liveFile, varName);
    const existingSandbox = findExistingValue(sandboxFile, varName);
    const exists = existingLive !== null || existingSandbox !== null;

    if (exists) {
      console.log('');
      console.log(`  "${varName}" already exists:`);
      console.log(`    Live:    ${existingLive ?? '(not set)'}`);
      console.log(`    Sandbox: ${existingSandbox ?? '(not set)'}`);
      console.log('');
      const proceed = (await ask(rl, '  Replace? (y/N): ')).trim().toLowerCase();
      if (proceed !== 'y') {
        console.log('  Aborted.');
        return;
      }
      console.log('');
    }

    const liveValue = await ask(rl, '  Live value (empty OK): ');
    const sandboxValue = await ask(rl, '  Sandbox value (empty OK): ');

    upsertVariable(liveFile, varName, liveValue);
    upsertVariable(sandboxFile, varName, sandboxValue);

    console.log('');
    console.log(`  Updated "${varName}" in both env files.`);
    console.log(`    Live:    ${liveValue || '(empty)'}`);
    console.log(`    Sandbox: ${sandboxValue || '(empty)'}`);
    console.log(`  (active env: ${active})`);
    console.log('');
  } finally {
    rl.close();
  }
}

main();
