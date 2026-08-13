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

async function runCli(paths, ...args) {
  return await execFileAsync(process.execPath, [cliPath, ...args], {
    env: {
      ...process.env,
      HOME: paths.home,
      USERPROFILE: paths.home,
      CODEX_HOME: paths.codexHome,
      ...paths.env,
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

test('save commits the active login and current marker through the recoverable transaction', async () => {
  const paths = await fixture('external');
  try {
    await runCli(paths, 'save', 'external');
    assert.equal(
      JSON.parse(await fs.readFile(path.join(paths.accounts, 'external', 'auth.json'), 'utf8')).tokens.account_id,
      'external',
    );
    assert.equal(
      JSON.parse(await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8')).tokens.account_id,
      'external',
    );
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'external\n');
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-current')));
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-auth.json')));
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

test('recovery preserves a staged credential without intent for older-version compatibility', async () => {
  const paths = await fixture('a');
  try {
    const orphaned = auth('b', 'orphaned-b');
    await fs.writeFile(path.join(paths.accounts, '.pending-auth.json'), orphaned);
    await assert.rejects(runCli(paths, 'current'), /was preserved at/);
    const recoveredName = (await fs.readdir(paths.accounts)).find((name) => name.startsWith('.pending-auth.json.recovered-'));
    assert.ok(recoveredName);
    assert.equal(await fs.readFile(path.join(paths.accounts, recoveredName), 'utf8'), orphaned);
    const result = await runCli(paths, 'current');
    assert.equal(result.stdout.trim(), 'personal');
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'personal\n');
    assert.equal(JSON.parse(await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8')).tokens.account_id, 'a');
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-auth.json')));
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('recovery preserves all state when the active account conflicts with an interrupted switch', async () => {
  const paths = await fixture('external');
  try {
    const staged = auth('b', 'staged-b');
    const originalPersonal = await fs.readFile(path.join(paths.accounts, 'personal', 'auth.json'), 'utf8');
    const originalWork = await fs.readFile(path.join(paths.accounts, 'work', 'auth.json'), 'utf8');
    const originalActive = await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8');
    await fs.writeFile(path.join(paths.accounts, '.pending-auth.json'), staged);
    await fs.writeFile(path.join(paths.accounts, '.pending-current'), 'work\n');

    await assert.rejects(runCli(paths, 'current'), /could not be recovered safely/);
    assert.equal(await fs.readFile(path.join(paths.accounts, 'personal', 'auth.json'), 'utf8'), originalPersonal);
    assert.equal(await fs.readFile(path.join(paths.accounts, 'work', 'auth.json'), 'utf8'), originalWork);
    assert.equal(await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8'), originalActive);
    assert.equal(await fs.readFile(path.join(paths.accounts, '.pending-auth.json'), 'utf8'), staged);
    assert.equal(await fs.readFile(path.join(paths.accounts, '.pending-current'), 'utf8'), 'work\n');
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('recovery handles a lone transaction marker after the target became active', async () => {
  const paths = await fixture('b');
  try {
    await fs.writeFile(path.join(paths.accounts, '.pending-current'), 'work\n');
    const result = await runCli(paths, 'current');
    assert.equal(result.stdout.trim(), 'work');
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'work\n');
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-current')));
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('recovery preserves staged credentials when the active auth file disappeared', async () => {
  const paths = await fixture('a');
  try {
    await fs.writeFile(path.join(paths.accounts, '.pending-auth.json'), auth('b', 'staged-b'));
    await fs.writeFile(path.join(paths.accounts, '.pending-current'), 'work\n');
    await fs.rm(path.join(paths.codexHome, 'auth.json'));
    const result = await runCli(paths, 'current');
    assert.equal(result.stdout.trim(), 'personal');
    assert.equal(
      JSON.parse(await fs.readFile(path.join(paths.accounts, 'work', 'auth.json'), 'utf8')).tokens.refresh_token,
      'staged-b',
    );
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-current')));
    await assert.rejects(fs.access(path.join(paths.accounts, '.pending-auth.json')));
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('remove requires explicit non-interactive confirmation and reports missing profiles', async () => {
  const paths = await fixture('a');
  try {
    await assert.rejects(runCli(paths, 'remove', 'work'), /Use --yes/);
    await fs.access(path.join(paths.accounts, 'work', 'auth.json'));

    await runCli(paths, 'remove', 'work', '--yes');
    await assert.rejects(fs.access(path.join(paths.accounts, 'work')));
    await assert.rejects(runCli(paths, 'remove', 'missing', '--yes'), /does not exist/);
    await assert.rejects(runCli(paths, 'remove', 'personal', '--yes'), /Cannot remove the current profile/);
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('commands reject extra arguments before performing side effects', async () => {
  const paths = await fixture('a');
  try {
    await assert.rejects(runCli(paths, 'use', 'work', 'extra'), /Usage: codex-shift use <name>/);
    await assert.rejects(runCli(paths, 'switch', 'work', 'extra'), /Usage: codex-shift switch <name>/);
    assert.equal(await fs.readFile(path.join(paths.accounts, '.current'), 'utf8'), 'personal\n');
    assert.equal(JSON.parse(await fs.readFile(path.join(paths.codexHome, 'auth.json'), 'utf8')).tokens.account_id, 'a');
    await assert.rejects(runCli(paths, 'login', 'work', 'extra'), /Usage: codex-shift login <name>/);
    await assert.rejects(runCli(paths, 'save', 'work', 'extra'), /Usage: codex-shift save <name>/);
    await assert.rejects(runCli(paths, 'list', 'extra'), /Usage: codex-shift list/);
    await assert.rejects(runCli(paths, 'current', 'extra'), /Usage: codex-shift current/);
    await assert.rejects(runCli(paths, '--version', 'extra'), /Usage: codex-shift --version/);
    await assert.rejects(runCli(paths, '--help', 'extra'), /Usage: codex-shift --help/);
    await assert.rejects(runCli(paths, 'remove', 'work', '--yes', 'extra'), /Usage: codex-shift remove/);
    await assert.rejects(runCli(paths, 'remove', 'work', '--yes', '--yes'), /Usage: codex-shift remove/);
    await fs.access(path.join(paths.accounts, 'work', 'auth.json'));
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});

test('list exits non-zero when every live refresh fails', async () => {
  const paths = await fixture('a');
  try {
    await assert.rejects(
      runCli({ ...paths, env: { PATH: paths.home } }, 'list'),
      /Account refresh failed for all profiles/,
    );
  } finally {
    await fs.rm(paths.home, { recursive: true, force: true });
  }
});
