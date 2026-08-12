import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { currentAuthPath } from './paths.js';

export function ensureCodexInstalled(): void {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, ['codex'], { stdio: 'ignore' });
  if (result.status !== 0) throw new Error('OpenAI Codex CLI was not found in PATH.');
}

export async function loginWithCodex(): Promise<void> {
  ensureCodexInstalled();
  await fs.rm(currentAuthPath, { force: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn('codex', ['login'], { stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`codex login exited with code ${code}`))));
    child.on('error', reject);
  });
}

export async function queryCurrentAccount(): Promise<never> {
  throw new Error('Structured app-server status integration is planned for the next implementation step.');
}
