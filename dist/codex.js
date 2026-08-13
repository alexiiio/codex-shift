import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { codexHome, currentAuthPath } from './paths.js';
export function ensureCodexInstalled() {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const result = spawnSync(command, ['codex'], { stdio: 'ignore' });
    if (result.status !== 0)
        throw new Error('OpenAI Codex CLI was not found in PATH.');
}
export async function loginWithCodex() {
    ensureCodexInstalled();
    const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-login-'));
    const backupAuth = path.join(backupDir, 'auth.json');
    let hadAuth = false;
    try {
        try {
            await fs.copyFile(currentAuthPath, backupAuth);
            hadAuth = true;
        }
        catch {
            // No previous auth file is fine.
        }
        await fs.rm(currentAuthPath, { force: true });
        await new Promise((resolve, reject) => {
            const child = spawn('codex', ['login'], {
                stdio: 'inherit',
                shell: process.platform === 'win32',
            });
            child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`codex login exited with code ${code}`))));
            child.on('error', reject);
        });
        await fs.access(currentAuthPath);
    }
    catch (error) {
        if (hadAuth)
            await fs.copyFile(backupAuth, currentAuthPath);
        throw error;
    }
    finally {
        await fs.rm(backupDir, { recursive: true, force: true });
    }
}
async function queryAppServer(tempHome) {
    ensureCodexInstalled();
    const child = spawn('codex', ['app-server', '--stdio'], {
        env: { ...process.env, CODEX_HOME: tempHome },
        stdio: ['pipe', 'pipe', 'ignore'],
        shell: process.platform === 'win32',
    });
    const rl = readline.createInterface({ input: child.stdout });
    const pending = new Map();
    rl.on('line', (line) => {
        let message;
        try {
            message = JSON.parse(line);
        }
        catch {
            return;
        }
        if (typeof message.id !== 'number')
            return;
        const waiter = pending.get(message.id);
        if (!waiter)
            return;
        clearTimeout(waiter.timer);
        pending.delete(message.id);
        if (message.error)
            waiter.reject(new Error(message.error.message ?? 'Codex app-server request failed.'));
        else
            waiter.resolve(message);
    });
    const request = (id, method, params) => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`Timed out waiting for ${method}.`));
            }, 15_000);
            pending.set(id, { resolve, reject, timer });
            child.stdin.write(`${JSON.stringify({ method, id, ...(params ? { params } : {}) })}\n`);
        });
    };
    try {
        await request(1, 'initialize', {
            clientInfo: { name: 'codex-shift', title: 'Codex Shift', version: '0.2.0' },
        });
        child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
        const accountMessage = await request(2, 'account/read', { refreshToken: false });
        const limitsMessage = await request(3, 'account/rateLimits/read');
        const accountResult = (accountMessage.result ?? {});
        const account = (accountResult.account ?? {});
        const limitsResult = (limitsMessage.result ?? {});
        let limits = limitsResult.rateLimits;
        const byId = limitsResult.rateLimitsByLimitId;
        if (byId?.codex)
            limits = byId.codex;
        const windows = [limits?.primary, limits?.secondary]
            .filter((value) => typeof value === 'object' && value !== null)
            .filter((value) => typeof value.windowDurationMins === 'number');
        const weekly = windows
            .filter((value) => (value.windowDurationMins ?? 0) >= 10_000)
            .sort((a, b) => (b.windowDurationMins ?? 0) - (a.windowDurationMins ?? 0))[0]
            ?? windows.sort((a, b) => (b.windowDurationMins ?? 0) - (a.windowDurationMins ?? 0))[0];
        const used = weekly?.usedPercent;
        return {
            email: typeof account.email === 'string' ? account.email : undefined,
            plan: typeof account.planType === 'string' ? account.planType : undefined,
            weekLeft: typeof used === 'number' ? Math.max(0, Math.min(100, Math.round(100 - used))) : undefined,
            weekReset: typeof weekly?.resetsAt === 'number' ? weekly.resetsAt : undefined,
        };
    }
    finally {
        for (const waiter of pending.values()) {
            clearTimeout(waiter.timer);
            waiter.reject(new Error('Codex app-server stopped.'));
        }
        pending.clear();
        rl.close();
        child.kill();
    }
}
export async function queryAccountFromAuth(authPath) {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-shift-status-'));
    try {
        await fs.copyFile(authPath, path.join(tempHome, 'auth.json'));
        try {
            await fs.copyFile(path.join(codexHome, 'config.toml'), path.join(tempHome, 'config.toml'));
        }
        catch {
            // Account reads work without a config file; copying it is best-effort.
        }
        return await queryAppServer(tempHome);
    }
    finally {
        await fs.rm(tempHome, { recursive: true, force: true });
    }
}
//# sourceMappingURL=codex.js.map