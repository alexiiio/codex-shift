import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import {
  accountsDir,
  codexHome,
  currentAuthPath,
  currentProfilePath,
  profileAuthPath,
  profileDir,
  profileMetaPath,
  pendingProfilePath,
  pendingAuthPath,
} from './paths.js';
import {
  planWeeklyWindowFromAuth,
  loginWithCodex,
  probeAccountFromAuth,
  queryAccountFromAuth,
  triggerWeeklyWindowFromAuth,
} from './codex.js';
import { assertSameAuthIdentity, readAuthIdentity } from './auth.js';
import { atomicWriteFile, withFileLock } from './storage.js';
import type { AccountMeta, AccountProfile, AccountStatus, WeeklyInitPlan } from './types.js';
import { accountsLockPath } from './paths.js';

const NAME_RE = /^[a-zA-Z0-9._-]+$/;
const RESET_SHIFT_TOLERANCE_SECONDS = 5;

export interface WeeklyWindowInspection {
  profiles: AccountProfile[];
  targets: AccountProfile[];
  unknown: AccountProfile[];
}

const REFRESH_CONCURRENCY = 4;

export function validateName(name: string): void {
  if (!NAME_RE.test(name)) {
    throw new Error('Profile name may only contain letters, numbers, dot, underscore, and hyphen.');
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureStorage(): Promise<void> {
  await fs.mkdir(codexHome, { recursive: true, mode: 0o700 });
  await fs.mkdir(accountsDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') await fs.chmod(accountsDir, 0o700);
}

export async function getCurrentProfile(): Promise<string | null> {
  if (!(await exists(currentProfilePath))) return null;
  const value = (await fs.readFile(currentProfilePath, 'utf8')).trim();
  if (!value) return null;
  validateName(value);
  return value;
}

async function syncCurrentAuthUnlocked(): Promise<void> {
  const current = await getCurrentProfile();
  if (!current || !(await exists(currentAuthPath))) return;
  const savedPath = profileAuthPath(current);
  if (!(await exists(savedPath))) {
    throw new Error(`Current profile '${current}' is missing its saved credentials.`);
  }
  const [activeAuth, savedAuth] = await Promise.all([
    fs.readFile(currentAuthPath),
    fs.readFile(savedPath),
  ]);
  assertSameAuthIdentity(activeAuth, savedAuth, current);
  await atomicWriteFile(savedPath, activeAuth, 0o600);
}

async function withAccountsLock<T>(action: () => Promise<T>): Promise<T> {
  await ensureStorage();
  return await withFileLock(accountsLockPath, action);
}

async function commitCurrentProfileUnlocked(name: string, auth: Buffer): Promise<void> {
  await atomicWriteFile(pendingAuthPath, auth, 0o600);
  await atomicWriteFile(pendingProfilePath, `${name}\n`, 0o600);
  await atomicWriteFile(currentAuthPath, auth, 0o600);
  await atomicWriteFile(profileAuthPath(name), auth, 0o600);
  await atomicWriteFile(currentProfilePath, `${name}\n`, 0o600);
  await Promise.all([
    fs.rm(pendingProfilePath, { force: true }),
    fs.rm(pendingAuthPath, { force: true }),
  ]);
}

async function recoverPendingCurrentUnlocked(): Promise<void> {
  if (!(await exists(pendingProfilePath))) {
    await fs.rm(pendingAuthPath, { force: true });
    return;
  }
  const name = (await fs.readFile(pendingProfilePath, 'utf8')).trim();
  validateName(name);
  const [activeAuth, stagedAuth] = await Promise.all([
    fs.readFile(currentAuthPath),
    fs.readFile(pendingAuthPath),
  ]);
  const activeIdentity = readAuthIdentity(activeAuth);
  const stagedIdentity = readAuthIdentity(stagedAuth);
  if (activeIdentity && activeIdentity === stagedIdentity) {
    await atomicWriteFile(profileAuthPath(name), stagedAuth, 0o600);
    await atomicWriteFile(currentProfilePath, `${name}\n`, 0o600);
  } else {
    const previous = await getCurrentProfile();
    const previousAuth = previous ? await fs.readFile(profileAuthPath(previous)) : undefined;
    if (!previousAuth || !activeIdentity || activeIdentity !== readAuthIdentity(previousAuth)) {
      throw new Error('An interrupted account switch could not be recovered safely. No credentials were overwritten.');
    }
  }
  await Promise.all([
    fs.rm(pendingProfilePath, { force: true }),
    fs.rm(pendingAuthPath, { force: true }),
  ]);
}

export async function recoverAccountState(): Promise<void> {
  await withAccountsLock(recoverPendingCurrentUnlocked);
}

export async function saveCurrentAs(name: string): Promise<void> {
  validateName(name);
  await ensureStorage();
  if (!(await exists(currentAuthPath))) {
    throw new Error(`Codex auth file not found: ${currentAuthPath}. Run \`codex login\` first.`);
  }
  await withAccountsLock(async () => {
    await recoverPendingCurrentUnlocked();
    const auth = await fs.readFile(currentAuthPath);
    if (!readAuthIdentity(auth)) {
      throw new Error('The active Codex account identity could not be verified; nothing was saved.');
    }
    await atomicWriteFile(profileAuthPath(name), auth, 0o600);
    await atomicWriteFile(currentProfilePath, `${name}\n`, 0o600);
  });
  await refreshProfileMeta(name).catch(() => undefined);
}

export async function loginProfile(name: string): Promise<void> {
  validateName(name);
  await ensureStorage();
  await withAccountsLock(async () => {
    await recoverPendingCurrentUnlocked();
    await syncCurrentAuthUnlocked();
  });
  const auth = await loginWithCodex();
  await withAccountsLock(async () => {
    // Stage the new credential so an interrupted multi-file commit can be completed or rolled back safely.
    await commitCurrentProfileUnlocked(name, auth);
  });
  await refreshProfileMeta(name).catch(() => undefined);
}

export async function switchTo(name: string): Promise<void> {
  validateName(name);
  await ensureStorage();
  const source = profileAuthPath(name);
  if (!(await exists(source))) throw new Error(`Profile '${name}' does not exist.`);

  await withAccountsLock(async () => {
    await recoverPendingCurrentUnlocked();
    await syncCurrentAuthUnlocked();
    const auth = await fs.readFile(source);
    if (!readAuthIdentity(auth)) throw new Error(`Profile '${name}' has unverifiable credentials.`);
    await commitCurrentProfileUnlocked(name, auth);
  });
}

export async function removeProfile(name: string): Promise<void> {
  validateName(name);
  await withAccountsLock(async () => {
    await recoverPendingCurrentUnlocked();
    const current = await getCurrentProfile();
    if (current === name) throw new Error('Cannot remove the current profile. Switch to another profile first.');
    await fs.rm(profileDir(name), { recursive: true, force: true });
  });
}

async function writeMetaUnlocked(name: string, meta: AccountMeta): Promise<void> {
  await atomicWriteFile(profileMetaPath(name), JSON.stringify(meta, null, 2) + '\n', 0o600);
}

export async function writeMeta(name: string, meta: AccountMeta): Promise<void> {
  await withAccountsLock(async () => {
    if (!(await exists(profileAuthPath(name)))) throw new Error(`Profile '${name}' does not exist.`);
    await writeMetaUnlocked(name, meta);
  });
}

async function readMeta(name: string): Promise<AccountMeta | undefined> {
  try {
    return JSON.parse(await fs.readFile(profileMetaPath(name), 'utf8')) as AccountMeta;
  } catch {
    return undefined;
  }
}

export function inferWeekStarted(
  previous: AccountMeta | undefined,
  status: AccountStatus,
  observedAt: Date,
): boolean | undefined {
  if (status.weekStarted !== undefined) return status.weekStarted;
  if ((status.weekUsedPercent ?? 0) > 0) return true;
  if (status.weekReset === undefined || status.weekUsedPercent === undefined) return undefined;

  const isUnused = status.weekUsedPercent === 0;
  const previousWasUnused = previous?.weekUsedPercent === 0 || previous?.weekLeft === 100;
  const previousObservedAt = previous?.updatedAt ? Date.parse(previous.updatedAt) / 1000 : Number.NaN;
  if (isUnused && previousWasUnused && previous?.weekReset !== undefined && Number.isFinite(previousObservedAt)) {
    const elapsed = observedAt.getTime() / 1000 - previousObservedAt;
    const resetShift = status.weekReset - previous.weekReset;
    if (elapsed >= 1) {
      if (resetShift === 0) return true;
      if (Math.abs(resetShift - elapsed) <= RESET_SHIFT_TOLERANCE_SECONDS) return false;
    }
  }

  const now = observedAt.getTime() / 1000;
  if (previous?.weekStarted === true && (previous.weekReset ?? 0) > now) return true;
  if (previous?.weekStarted === false && isUnused) return false;
  return undefined;
}

export function isConfirmedUnstarted(status: AccountStatus): boolean {
  return status.weekStarted === false;
}

async function saveStatus(
  name: string,
  status: AccountStatus,
  forcedWeekStarted?: boolean,
): Promise<AccountMeta> {
  const observedAt = new Date();
  return await withAccountsLock(async () => {
    if (!(await exists(profileAuthPath(name)))) {
      throw new Error(`Profile '${name}' was removed while its account information was refreshing.`);
    }
    const previous = await readMeta(name);
    const meta: AccountMeta = {
      ...status,
      weekStarted: forcedWeekStarted ?? inferWeekStarted(previous, status, observedAt),
      updatedAt: observedAt.toISOString(),
    };
    await writeMetaUnlocked(name, meta);
    return meta;
  });
}

export async function refreshProfileMeta(name: string, forcedWeekStarted?: boolean): Promise<AccountMeta> {
  validateName(name);
  const auth = profileAuthPath(name);
  if (!(await exists(auth))) throw new Error(`Profile '${name}' does not exist.`);

  const status = await queryAccountFromAuth(auth);
  return await saveStatus(name, status, forcedWeekStarted);
}

export async function refreshAllProfiles(): Promise<AccountProfile[]> {
  const profiles = await listProfiles();
  return await mapWithConcurrency(profiles, REFRESH_CONCURRENCY, async (profile) => {
    try {
      const meta = await refreshProfileMeta(profile.name);
      return { ...profile, meta, dataSource: 'live' as const };
    } catch {
      return {
        ...profile,
        dataSource: profile.meta ? 'cached' as const : 'unavailable' as const,
      };
    }
  });
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  action: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await action(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function listProfiles(): Promise<AccountProfile[]> {
  await ensureStorage();
  const current = await getCurrentProfile();
  const entries = await fs.readdir(accountsDir, { withFileTypes: true });
  const profiles: AccountProfile[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const auth = profileAuthPath(entry.name);
    if (!(await exists(auth))) continue;

    const meta = await readMeta(entry.name);

    profiles.push({
      name: entry.name,
      isCurrent: entry.name === current,
      meta,
      dataSource: meta ? 'cached' : 'unavailable',
    });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

export async function inspectWeeklyWindows(): Promise<WeeklyWindowInspection> {
  await withAccountsLock(async () => {
    await recoverPendingCurrentUnlocked();
    await syncCurrentAuthUnlocked();
  });
  const profiles = await listProfiles();
  const inspected: AccountProfile[] = [];
  const targets: AccountProfile[] = [];
  const unknown: AccountProfile[] = [];

  for (const profile of profiles) {
    let next = profile;
    try {
      const status = await probeAccountFromAuth(profileAuthPath(profile.name));
      const confirmedUnstarted = isConfirmedUnstarted(status);
      const meta = await saveStatus(profile.name, status);
      next = { ...profile, meta };
      if (confirmedUnstarted) targets.push(next);
      else if (status.weekStarted === undefined) unknown.push(next);
    } catch {
      unknown.push(profile);
      inspected.push(profile);
      continue;
    }

    inspected.push(next);
  }

  return { profiles: inspected, targets, unknown };
}

export async function planWeeklyInitialization(profile: AccountProfile): Promise<WeeklyInitPlan> {
  const selection = await planWeeklyWindowFromAuth(profileAuthPath(profile.name));
  return {
    name: profile.name,
    account: profile.meta?.email,
    ...selection,
  };
}

export async function initializeWeeklyWindow(plan: WeeklyInitPlan): Promise<AccountMeta> {
  const { name } = plan;
  validateName(name);
  const auth = profileAuthPath(name);
  if (!(await exists(auth))) throw new Error(`Profile '${name}' does not exist.`);

  return await withAccountsLock(async () => {
    // Re-check inside the process lock so two init-week processes cannot consume the same account twice.
    const latestStatus = await probeAccountFromAuth(auth);
    if (latestStatus.weekStarted !== false) {
      throw new Error('weekly window is no longer confirmed as unstarted; skipped without using quota');
    }

    const originalAuth = await fs.readFile(auth);
    const refreshedAuth = await triggerWeeklyWindowFromAuth(auth, plan);
    assertSameAuthIdentity(refreshedAuth, originalAuth, name);
    let activeLoginChanged = false;
    if ((await getCurrentProfile()) === name) {
      const activeAuth = await fs.readFile(currentAuthPath);
      try {
        assertSameAuthIdentity(activeAuth, originalAuth, name);
      } catch {
        // A native `codex login` may have happened while the selection UI was open; never replace it.
        activeLoginChanged = true;
      }
      if (!activeLoginChanged) await commitCurrentProfileUnlocked(name, refreshedAuth);
    } else {
      await atomicWriteFile(auth, refreshedAuth, 0o600);
    }

    let meta: AccountMeta;
    try {
      const status = await queryAccountFromAuth(auth);
      meta = { ...status, weekStarted: true, updatedAt: new Date().toISOString() };
    } catch {
      meta = {
        ...(await readMeta(name)),
        weekStarted: true,
        updatedAt: new Date().toISOString(),
      };
    }
    await writeMetaUnlocked(name, meta);
    if (activeLoginChanged) {
      throw new Error('weekly window started, but the active Codex login changed externally and was preserved');
    }
    return meta;
  });
}
