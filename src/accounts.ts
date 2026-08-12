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
} from './paths.js';
import type { AccountMeta, AccountProfile } from './types.js';

const NAME_RE = /^[a-zA-Z0-9._-]+$/;

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
  await fs.mkdir(codexHome, { recursive: true });
  await fs.mkdir(accountsDir, { recursive: true });
}

export async function getCurrentProfile(): Promise<string | null> {
  if (!(await exists(currentProfilePath))) return null;
  const value = (await fs.readFile(currentProfilePath, 'utf8')).trim();
  return value || null;
}

export async function saveCurrentAs(name: string): Promise<void> {
  validateName(name);
  await ensureStorage();
  if (!(await exists(currentAuthPath))) {
    throw new Error(`Codex auth file not found: ${currentAuthPath}. Run \`codex login\` first.`);
  }
  await fs.mkdir(profileDir(name), { recursive: true });
  await fs.copyFile(currentAuthPath, profileAuthPath(name));
  if (process.platform !== 'win32') await fs.chmod(profileAuthPath(name), 0o600);
  await fs.writeFile(currentProfilePath, `${name}\n`, 'utf8');
}

export async function switchTo(name: string): Promise<void> {
  validateName(name);
  await ensureStorage();
  const source = profileAuthPath(name);
  if (!(await exists(source))) throw new Error(`Profile '${name}' does not exist.`);

  const current = await getCurrentProfile();
  if (current && (await exists(currentAuthPath))) {
    await fs.mkdir(profileDir(current), { recursive: true });
    await fs.copyFile(currentAuthPath, profileAuthPath(current));
  }

  await fs.copyFile(source, currentAuthPath);
  if (process.platform !== 'win32') await fs.chmod(currentAuthPath, 0o600);
  await fs.writeFile(currentProfilePath, `${name}\n`, 'utf8');
}

export async function removeProfile(name: string): Promise<void> {
  validateName(name);
  const current = await getCurrentProfile();
  if (current === name) throw new Error('Cannot remove the current profile. Switch to another profile first.');
  await fs.rm(profileDir(name), { recursive: true, force: true });
}

export async function writeMeta(name: string, meta: AccountMeta): Promise<void> {
  await fs.mkdir(profileDir(name), { recursive: true });
  await fs.writeFile(profileMetaPath(name), JSON.stringify(meta, null, 2) + '\n', 'utf8');
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

    let meta: AccountMeta | undefined;
    try {
      meta = JSON.parse(await fs.readFile(profileMetaPath(entry.name), 'utf8')) as AccountMeta;
    } catch {
      // Metadata is optional and may not exist yet.
    }

    profiles.push({ name: entry.name, isCurrent: entry.name === current, meta });
  }

  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
