import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { codexHome } from './paths.js';
import { readAuthIdentity } from './auth.js';
import type { AccountStatus, WeeklyInitPlan } from './types.js';

interface RpcMessage {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

interface ModelListEntry {
  id?: string;
  model?: string;
  hidden?: boolean;
  isDefault?: boolean;
  defaultReasoningEffort?: string;
  supportedReasoningEfforts?: Array<{ reasoningEffort?: string }>;
}

interface RateWindow {
  usedPercent?: number;
  windowDurationMins?: number;
  resetsAt?: number;
}

interface WeeklyObservation extends AccountStatus {
  observedAt: number;
}

const WEEKLY_PROBE_DELAY_MS = 2_000;
const WEEKLY_ROLLING_TOLERANCE_SECONDS = 3;
const MINIMAL_USAGE_PROMPT = 'Reply with OK only. Do not inspect files or use tools.';
const DEFAULT_MINIMAL_REASONING_EFFORT = 'low';
const SAFE_CLI_VALUE = /^[a-zA-Z0-9._-]+$/;

// Keep this local ranking in sync with OpenAI's published Codex credit rate card.
// Runtime selection never fetches a pricing page; it only lists models available to the account.
const KNOWN_MODEL_INPUT_CREDITS = new Map<string, number>([
  ['gpt-5.6-luna', 5],
  ['gpt-5.4-mini', 18.75],
  ['gpt-5.6-terra', 50],
  ['gpt-5.4', 62.5],
  ['gpt-5.5', 125],
  ['gpt-5.6-sol', 125],
]);

const REASONING_EFFORT_ORDER = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const;

export function ensureCodexInstalled(): void {
  const command = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(command, ['codex'], { stdio: 'ignore' });
  if (result.status !== 0) throw new Error('OpenAI Codex CLI was not found in PATH.');
}

export async function loginWithCodex(): Promise<Buffer> {
  ensureCodexInstalled();
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-login-'));
  const tempAuth = path.join(tempHome, 'auth.json');

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('codex', ['login'], {
        env: { ...process.env, CODEX_HOME: tempHome },
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`codex login exited with code ${code}`))));
      child.on('error', reject);
    });
    const auth = await fs.readFile(tempAuth);
    if (!readAuthIdentity(auth)) {
      throw new Error('Codex login completed, but the returned account identity could not be verified.');
    }
    return auth;
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
}

function readWeeklyStatus(
  account: Record<string, unknown>,
  limitsMessage: RpcMessage,
): WeeklyObservation {
  const limitsResult = (limitsMessage.result ?? {}) as Record<string, unknown>;

  let limits = limitsResult.rateLimits as Record<string, unknown> | undefined;
  const byId = limitsResult.rateLimitsByLimitId as Record<string, Record<string, unknown>> | undefined;
  if (byId?.codex) limits = byId.codex;

  const windows = [limits?.primary, limits?.secondary]
    .filter((value): value is RateWindow => typeof value === 'object' && value !== null)
    .filter((value) => typeof value.windowDurationMins === 'number');

  const weekly = windows
    .filter((value) => (value.windowDurationMins ?? 0) >= 10_000)
    .sort((a, b) => (b.windowDurationMins ?? 0) - (a.windowDurationMins ?? 0))[0];

  const used = weekly?.usedPercent;

  return {
    email: typeof account.email === 'string' ? account.email : undefined,
    plan: typeof account.planType === 'string' ? account.planType : undefined,
    weekLeft: typeof used === 'number' ? Math.max(0, Math.min(100, Math.round(100 - used))) : undefined,
    weekUsedPercent: typeof used === 'number' ? used : undefined,
    weekWindowDurationMins: weekly?.windowDurationMins,
    weekReset: typeof weekly?.resetsAt === 'number' ? weekly.resetsAt : undefined,
    weekStarted: typeof used === 'number' && used > 0 ? true : undefined,
    observedAt: Date.now() / 1000,
  };
}

function inferStartedFromProbe(first: WeeklyObservation, second: WeeklyObservation): boolean | undefined {
  if ((second.weekUsedPercent ?? 0) > 0) return true;
  if (
    first.weekReset === undefined
    || second.weekReset === undefined
    || first.weekUsedPercent === undefined
    || second.weekUsedPercent === undefined
    || first.weekWindowDurationMins === undefined
    || second.weekWindowDurationMins === undefined
  ) return undefined;

  const elapsed = second.observedAt - first.observedAt;
  const resetShift = second.weekReset - first.weekReset;
  if (elapsed < 1) return undefined;

  // An unused weekly window currently reports a reset that advances with observation time.
  const firstRemaining = first.weekReset - first.observedAt;
  const secondRemaining = second.weekReset - second.observedAt;
  const firstDuration = first.weekWindowDurationMins * 60;
  const secondDuration = second.weekWindowDurationMins * 60;
  if (
    Math.abs(firstRemaining - firstDuration) <= WEEKLY_ROLLING_TOLERANCE_SECONDS
    && Math.abs(secondRemaining - secondDuration) <= WEEKLY_ROLLING_TOLERANCE_SECONDS
  ) return false;
  if (resetShift === 0) return true;
  if (Math.abs(resetShift - elapsed) <= WEEKLY_ROLLING_TOLERANCE_SECONDS) return false;
  return undefined;
}

async function withAppServer<T>(
  tempHome: string,
  action: (request: (method: string, params?: object) => Promise<RpcMessage>) => Promise<T>,
): Promise<T> {
  ensureCodexInstalled();

  const child = spawn('codex', ['app-server', '--stdio'], {
    env: { ...process.env, CODEX_HOME: tempHome },
    stdio: ['pipe', 'pipe', 'ignore'],
    shell: process.platform === 'win32',
  });

  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map<number, { resolve: (msg: RpcMessage) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  let nextRequestId = 1;
  let processError: Error | undefined;

  const rejectPending = (error: Error): void => {
    processError = error;
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    pending.clear();
  };

  child.on('error', (error) => rejectPending(error));
  child.stdin.on('error', (error) => rejectPending(error));
  child.on('exit', (code, signal) => {
    rejectPending(new Error(`Codex app-server exited before completing the request (${signal ?? code ?? 'unknown'}).`));
  });

  rl.on('line', (line) => {
    let message: RpcMessage;
    try {
      message = JSON.parse(line) as RpcMessage;
    } catch {
      return;
    }
    if (typeof message.id !== 'number') return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message ?? 'Codex app-server request failed.'));
    else waiter.resolve(message);
  });

  const request = (method: string, params?: object): Promise<RpcMessage> => {
    if (processError) return Promise.reject(processError);
    const id = nextRequestId;
    nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, 15_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(
        `${JSON.stringify({ method, id, ...(params ? { params } : {}) })}\n`,
        (error) => {
          if (!error) return;
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        },
      );
    });
  };

  try {
    await request('initialize', {
      clientInfo: { name: 'codex-shift', title: 'Codex Shift', version: '0.2.1' },
    });
    child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
    return await action(request);
  } finally {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Codex app-server stopped.'));
    }
    pending.clear();
    rl.close();
    child.kill();
  }
}

async function queryAppServer(tempHome: string): Promise<WeeklyObservation> {
  return await withAppServer(tempHome, async (request) => {
    const accountMessage = await request('account/read', { refreshToken: false });
    const accountResult = (accountMessage.result ?? {}) as Record<string, unknown>;
    const account = (accountResult.account ?? {}) as Record<string, unknown>;
    return readWeeklyStatus(account, await request('account/rateLimits/read'));
  });
}

function selectLowestReasoningEffort(model: ModelListEntry | undefined): string {
  const supported = new Set(
    (model?.supportedReasoningEfforts ?? [])
      .map((entry) => entry.reasoningEffort)
      .filter((effort): effort is string => typeof effort === 'string'),
  );
  return REASONING_EFFORT_ORDER.find((effort) => supported.has(effort))
    ?? model?.defaultReasoningEffort
    ?? DEFAULT_MINIMAL_REASONING_EFFORT;
}

export function selectMinimalModel(models: ModelListEntry[]): Omit<WeeklyInitPlan, 'name' | 'account'> {
  const visibleModels = models.filter((model) => model.hidden !== true && typeof model.model === 'string');
  const pricedModels = visibleModels
    .filter((model) => KNOWN_MODEL_INPUT_CREDITS.has(model.model as string))
    .sort((a, b) => (
      KNOWN_MODEL_INPUT_CREDITS.get(a.model as string) as number
      - (KNOWN_MODEL_INPUT_CREDITS.get(b.model as string) as number)
    ));
  const selected = pricedModels[0] ?? visibleModels.find((model) => model.isDefault);

  return {
    model: selected?.model,
    reasoningEffort: selectLowestReasoningEffort(selected),
    modelSource: pricedModels[0] ? 'known-ranked' : selected ? 'account-default' : 'cli-default',
  };
}

async function queryMinimalModel(tempHome: string): Promise<Omit<WeeklyInitPlan, 'name' | 'account'>> {
  try {
    return await withAppServer(tempHome, async (request) => {
      const models: ModelListEntry[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;

      do {
        const response = await request('model/list', {
          limit: 100,
          includeHidden: false,
          ...(cursor ? { cursor } : {}),
        });
        const result = (response.result ?? {}) as Record<string, unknown>;
        if (Array.isArray(result.data)) models.push(...result.data as ModelListEntry[]);

        const nextCursor = typeof result.nextCursor === 'string' ? result.nextCursor : undefined;
        if (!nextCursor || seenCursors.has(nextCursor)) break;
        seenCursors.add(nextCursor);
        cursor = nextCursor;
      } while (cursor);

      return selectMinimalModel(models);
    });
  } catch {
    // Older Codex versions may not expose model/list. Omitting --model uses their default.
    return {
      reasoningEffort: DEFAULT_MINIMAL_REASONING_EFFORT,
      modelSource: 'cli-default',
    };
  }
}

export async function planWeeklyWindowFromAuth(authPath: string): Promise<Omit<WeeklyInitPlan, 'name' | 'account'>> {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-model-'));
  try {
    await fs.copyFile(authPath, path.join(tempHome, 'auth.json'));
    return await queryMinimalModel(tempHome);
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
}

export async function queryAccountFromAuth(authPath: string): Promise<AccountStatus> {
  const { observedAt: _observedAt, ...status } = await queryAccount(authPath);
  return status;
}

export async function probeAccountFromAuth(authPath: string): Promise<AccountStatus> {
  const first = await queryAccount(authPath);
  await new Promise((resolve) => setTimeout(resolve, WEEKLY_PROBE_DELAY_MS));
  const second = await queryAccount(authPath);
  const { observedAt: _observedAt, ...status } = second;
  return { ...status, weekStarted: inferStartedFromProbe(first, second) };
}

async function queryAccount(authPath: string): Promise<WeeklyObservation> {
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-status-'));

  try {
    await fs.copyFile(authPath, path.join(tempHome, 'auth.json'));

    try {
      await fs.copyFile(path.join(codexHome, 'config.toml'), path.join(tempHome, 'config.toml'));
    } catch {
      // Account reads work without a config file; copying it is best-effort.
    }

    return await queryAppServer(tempHome);
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
  }
}

export async function triggerWeeklyWindowFromAuth(
  authPath: string,
  selection: Omit<WeeklyInitPlan, 'name' | 'account'>,
): Promise<Buffer> {
  ensureCodexInstalled();

  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-init-home-'));
  const tempWorkDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-init-work-'));
  const tempAuthPath = path.join(tempHome, 'auth.json');

  try {
    await fs.copyFile(authPath, tempAuthPath);
    if (selection.model && !SAFE_CLI_VALUE.test(selection.model)) {
      throw new Error('Codex returned an unsafe model identifier.');
    }
    if (!SAFE_CLI_VALUE.test(selection.reasoningEffort)) {
      throw new Error('Codex returned an unsafe reasoning-effort value.');
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn('codex', [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--ignore-rules',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--color',
        'never',
        ...(selection.model ? ['--model', selection.model] : []),
        '-c',
        `model_reasoning_effort=${JSON.stringify(selection.reasoningEffort)}`,
        MINIMAL_USAGE_PROMPT,
      ], {
        cwd: tempWorkDir,
        env: { ...process.env, CODEX_HOME: tempHome },
        stdio: ['ignore', 'ignore', 'pipe'],
        shell: process.platform === 'win32',
      });

      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new Error('Minimal Codex request timed out.'));
      }, 120_000);

      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-4_000);
      });
      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `Minimal Codex request exited with code ${code}.`));
      });
    });

    return await fs.readFile(tempAuthPath);
  } finally {
    await fs.rm(tempHome, { recursive: true, force: true });
    await fs.rm(tempWorkDir, { recursive: true, force: true });
  }
}
