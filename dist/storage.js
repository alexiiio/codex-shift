import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const LOCK_RETRY_MS = 50;
const LOCK_TIMEOUT_MS = 10_000;
const STALE_LOCK_MS = 30_000;
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
export async function atomicWriteFile(target, data, mode) {
    const directory = path.dirname(target);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32')
        await fs.chmod(directory, 0o700);
    const temporary = path.join(directory, `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`);
    try {
        await fs.writeFile(temporary, data, mode === undefined ? undefined : { mode });
        if (mode !== undefined && process.platform !== 'win32')
            await fs.chmod(temporary, mode);
        await fs.rename(temporary, target);
    }
    finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
    }
}
export async function withFileLock(lockPath, action) {
    const startedAt = Date.now();
    const token = randomUUID();
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    let handle;
    while (true) {
        try {
            handle = await fs.open(lockPath, 'wx', 0o600);
            break;
        }
        catch (error) {
            const code = error.code;
            if (code !== 'EEXIST')
                throw error;
            try {
                const [pidText, ownerToken] = (await fs.readFile(lockPath, 'utf8')).split('\n');
                const stat = await fs.stat(lockPath);
                const pid = Number(pidText);
                let ownerIsDead = false;
                if (ownerToken && Number.isInteger(pid) && pid > 0) {
                    try {
                        process.kill(pid, 0);
                    }
                    catch (pidError) {
                        ownerIsDead = pidError.code === 'ESRCH';
                    }
                }
                if (ownerIsDead && Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
                    // Rename is the compare-and-swap: only one contender can claim this exact stale lock.
                    const stalePath = `${lockPath}.stale.${ownerToken}.${randomUUID()}`;
                    await fs.rename(lockPath, stalePath);
                    await fs.rm(stalePath, { force: true });
                    continue;
                }
            }
            catch (staleError) {
                if (staleError.code === 'ENOENT')
                    continue;
                throw staleError;
            }
            if (Date.now() - startedAt >= LOCK_TIMEOUT_MS) {
                throw new Error(`Another codex-shift process is updating accounts. If no process is running, remove stale lock: ${lockPath}`);
            }
            await delay(LOCK_RETRY_MS);
        }
    }
    try {
        await handle.writeFile(`${process.pid}\n${token}\n${new Date().toISOString()}\n`);
        return await action();
    }
    finally {
        await handle.close();
        const owner = await fs.readFile(lockPath, 'utf8').catch(() => '');
        if (owner.split('\n')[1] === token)
            await fs.rm(lockPath, { force: true });
    }
}
//# sourceMappingURL=storage.js.map