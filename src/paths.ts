import os from 'node:os';
import path from 'node:path';

export const homeDir = os.homedir();
export const codexHome = process.env.CODEX_HOME || path.join(homeDir, '.codex');
export const accountsDir = path.join(homeDir, '.codex-accounts');
export const currentAuthPath = path.join(codexHome, 'auth.json');
export const currentProfilePath = path.join(accountsDir, '.current');

export function profileDir(name: string): string {
  return path.join(accountsDir, name);
}

export function profileAuthPath(name: string): string {
  return path.join(profileDir(name), 'auth.json');
}

export function profileMetaPath(name: string): string {
  return path.join(profileDir(name), 'meta.json');
}
