import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { readAuthIdentity, assertSameAuthIdentity } from '../dist/auth.js';
import { atomicWriteFile, withFileLock } from '../dist/storage.js';
import { inferWeekStarted, isConfirmedUnstarted, mapWithConcurrency } from '../dist/accounts.js';
import { readResetCreditStatus, selectMinimalModel } from '../dist/codex.js';
import {
  formatTerminalFrame,
  isExpiringSoon,
} from '../dist/terminal.js';

const execFileAsync = promisify(execFile);

test('CLI version matches the package version', async () => {
  const packageJson = JSON.parse(await fs.readFile(path.resolve('package.json'), 'utf8'));
  const { stdout } = await execFileAsync(process.execPath, [path.resolve('dist/cli.js'), '--version']);
  assert.equal(stdout.trim(), packageJson.version);
});

test('interactive terminal frames use rows instead of array separators', () => {
  const frame = formatTerminalFrame('<clear>', ['Codex Shift', 'Select weekly windows', '', 'NAME\nprofile']);
  assert.equal(frame, '<clear>Codex Shift\r\nSelect weekly windows\r\n\r\nNAME\r\nprofile\r\n');
  assert.equal(frame.includes('Shift,Select'), false);
});

test('reset-credit expiry warning includes the 48-hour boundary', () => {
  const now = 1_000_000;
  assert.equal(isExpiringSoon(now + (48 * 60 * 60), now), true);
  assert.equal(isExpiringSoon(now + (48 * 60 * 60) + 1, now), false);
  assert.equal(isExpiringSoon(now - 1, now), false);
});

test('usage-limit reset credits preserve count and expiry detail boundaries', () => {
  assert.deepEqual(readResetCreditStatus({ rateLimitResetCredits: { availableCount: 0, credits: [] } }), {
    resetCreditsAvailable: 0,
  });
  assert.deepEqual(readResetCreditStatus({ rateLimitResetCredits: { availableCount: 2, credits: null } }), {
    resetCreditsAvailable: 2,
    resetCreditsExpiryState: 'unavailable',
  });
  assert.deepEqual(readResetCreditStatus({
    rateLimitResetCredits: {
      availableCount: 2,
      credits: [{ expiresAt: 200 }, { expiresAt: 100 }],
    },
  }), {
    resetCreditsAvailable: 2,
    resetCreditsNextExpiry: 100,
    resetCreditsExpiryState: 'known',
  });
  assert.deepEqual(readResetCreditStatus({
    rateLimitResetCredits: { availableCount: 2, credits: [{ expiresAt: 200 }] },
  }), {
    resetCreditsAvailable: 2,
    resetCreditsNextExpiry: 200,
    resetCreditsExpiryState: 'partial',
  });
  assert.deepEqual(readResetCreditStatus({
    rateLimitResetCredits: { availableCount: 1, credits: [{ expiresAt: null }] },
  }), {
    resetCreditsAvailable: 1,
    resetCreditsExpiryState: 'no-expiry',
  });
  assert.deepEqual(readResetCreditStatus({}), {});
  assert.deepEqual(readResetCreditStatus({ rateLimitResetCredits: { availableCount: -1 } }), {});
});

function auth(accountId, refresh = 'token') {
  return JSON.stringify({ tokens: { account_id: accountId, refresh_token: refresh } });
}

test('auth identity allows token refreshes but rejects a different account', () => {
  assert.equal(readAuthIdentity(auth('account-a')), 'account:account-a');
  assert.doesNotThrow(() => assertSameAuthIdentity(auth('account-a', 'old'), auth('account-a', 'new'), 'personal'));
  assert.throws(
    () => assertSameAuthIdentity(auth('account-b'), auth('account-a'), 'personal'),
    /was not overwritten/,
  );
  assert.throws(() => assertSameAuthIdentity('{}', auth('account-a'), 'personal'), /could not verify/);
});

test('atomic writes replace complete files and the process lock serializes actions', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-storage-test-'));
  const target = path.join(directory, 'auth.json');
  const lock = path.join(directory, '.lock');
  try {
    await atomicWriteFile(target, 'first', 0o600);
    await atomicWriteFile(target, 'second', 0o600);
    assert.equal(await fs.readFile(target, 'utf8'), 'second');

    const events = [];
    let releaseFirst;
    const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
    const first = withFileLock(lock, async () => {
      events.push('first:start');
      await firstGate;
      events.push('first:end');
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = withFileLock(lock, async () => events.push('second'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.deepEqual(events, ['first:start']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first:start', 'first:end', 'second']);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('only a current explicit probe can make an init-week target', () => {
  assert.equal(isConfirmedUnstarted({ weekStarted: false }), true);
  assert.equal(isConfirmedUnstarted({ weekStarted: true }), false);
  assert.equal(isConfirmedUnstarted({}), false);

  const cached = { weekStarted: false, weekUsedPercent: 0, weekReset: 1000, updatedAt: new Date(0).toISOString() };
  const inferred = inferWeekStarted(cached, { weekUsedPercent: 0, weekReset: 2000 }, new Date(1000));
  assert.equal(inferred, false);
  assert.equal(isConfirmedUnstarted({ weekStarted: undefined }), false);
});

test('bounded concurrency preserves order and limits active work', async () => {
  let active = 0;
  let maximum = 0;
  const result = await mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });
  assert.deepEqual(result, [0, 2, 4, 6, 8, 10]);
  assert.equal(maximum, 2);
});

test('minimal model selection freezes the lowest priced visible model and effort', () => {
  const selection = selectMinimalModel([
    {
      model: 'gpt-5.6-sol',
      isDefault: true,
      defaultReasoningEffort: 'medium',
      supportedReasoningEfforts: [{ reasoningEffort: 'low' }, { reasoningEffort: 'medium' }],
    },
    {
      model: 'gpt-5.6-luna',
      supportedReasoningEfforts: [{ reasoningEffort: 'minimal' }, { reasoningEffort: 'low' }],
    },
  ]);
  assert.deepEqual(selection, {
    model: 'gpt-5.6-luna',
    reasoningEffort: 'minimal',
    modelSource: 'known-ranked',
  });
});
