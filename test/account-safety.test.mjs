import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cliPath = path.resolve('dist/cli.js');

function auth(accountId, refresh) {
  return `${JSON.stringify({ tokens: { account_id: accountId, refresh_token: refresh } }, null, 2)}\n`;
}

async function fixture(activeAccount) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-account-test-'));
  const codexHome = path.join(home, '.codex');
  const accounts = path.join(home, '.codex-accounts');
  await fs.mkdir(path.join(accounts, 'personal'), { recursive: true });
  await fs.mkdir(path.join(accounts, 'work'), { recursive: true });
  await fs.mkdir(codexHome, { recursive: true });
  await fs.writeFile(path.join(accounts, '.current'), 'personal\n');
  await fs.writeFile(path.join(accounts, 'personal', 'auth.json'), auth('a', 'saved-a'));
  await fs.writeFile(path.join(accounts, 'work', 'auth.json'), auth('b', 'saved-b'));
  await fs.writeFile(path.join(codexHome, 'auth.json'), auth(activeAccount, 'active'));
  return { home, codexHome, accounts };
}

async function runUse(paths) {
  return await execFileAsync(process.execPath, [cliPath, 'use', 'work'], {
    env: {
      ...process.env,
      HOME: paths.home,
      USERPROFILE: paths.home,
      CODEX_HOME: paths.codexHome,
    },
  });
}

test('external login mismatch never overwrites the profile marked current', async () => {
  const paths = await fixture('external');
  const originalProfile = await fs.readFile(path.join(paths.accounts, 'personal', 'auth.json'), 'utf8');
  const originalActive = await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8');
  try {
    await assert.rejects(runUse(paths), /different account/);
    assert.equal(await fs.readFile(path.join(paths.accounts, 'personal', 'auth.json'), 'utf8'), originalProfile);
    assert.equal(await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8'), originalActive);
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'personal\n');
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('same-account token refresh is saved before switching profiles', async () => {
  const paths = await fixture('a');
  try {
    await runUse(paths);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(paths.accounts, 'personal', 'auth.json'), 'utf8')).tokens.refresh_token,
      'active',
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8')).tokens.account_id,
      'b',
    );
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'work\n');
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('an interrupted switch repairs the current marker from the active identity', async () => {
  const paths = await fixture('b');
  try {
    await fs.writeFile(path.join(paths.accounts, '.pending-auth.json'), auth('b', 'staged-b'));
    await fs.writeFile(path.join(paths.accounts, '.pending-current'), 'work\n');
    const result = await execFileAsync(process.execPath, [cliPath, 'current'], {
      env: {
        ...process.env,
        HOME: paths.home,
        USERPROFILE: paths.home,
        CODEX_HOME: paths.codexHome,
      },
    });
    assert.equal(result.stdout.trim(), 'work');
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'work\n');
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-current')));
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-auth.json')));
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});
