import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { accountsDir, codexHome, currentAuthPath, currentProfilePath, profileAuthPath, profileDir, profileMetaPath, } from './paths.js';
import { loginWithCodex, probeAccountFromAuth, queryAccountFromAuth, triggerWeeklyWindowFromAuth, } from './codex.js';
const NAME_RE = /^[a-zA-Z0-9._-]+$/;
const RESET_SHIFT_TOLERANCE_SECONDS = 5;
export function validateName(name) {
    if (!NAME_RE.test(name)) {
        throw new Error('Profile name may only contain letters, numbers, dot, underscore, and hyphen.');
    }
}
async function exists(file) {
    try {
        await fs.access(file, fsConstants.F_OK);
        return true;
    }
    catch {
        return false;
    }
}
export async function ensureStorage() {
    await fs.mkdir(codexHome, { recursive: true });
    await fs.mkdir(accountsDir, { recursive: true });
}
export async function getCurrentProfile() {
    if (!(await exists(currentProfilePath)))
        return null;
    const value = (await fs.readFile(currentProfilePath, 'utf8')).trim();
    return value || null;
}
async function syncCurrentAuth() {
    const current = await getCurrentProfile();
    if (!current || !(await exists(currentAuthPath)))
        return;
    await fs.mkdir(profileDir(current), { recursive: true });
    await fs.copyFile(currentAuthPath, profileAuthPath(current));
    if (process.platform !== 'win32')
        await fs.chmod(profileAuthPath(current), 0o600);
}
export async function saveCurrentAs(name) {
    validateName(name);
    await ensureStorage();
    if (!(await exists(currentAuthPath))) {
        throw new Error(`Codex auth file not found: ${currentAuthPath}. Run \`codex login\` first.`);
    }
    await fs.mkdir(profileDir(name), { recursive: true });
    await fs.copyFile(currentAuthPath, profileAuthPath(name));
    if (process.platform !== 'win32')
        await fs.chmod(profileAuthPath(name), 0o600);
    await fs.writeFile(currentProfilePath, `${name}\n`, 'utf8');
    await refreshProfileMeta(name).catch(() => undefined);
}
export async function loginProfile(name) {
    validateName(name);
    await ensureStorage();
    await syncCurrentAuth();
    await loginWithCodex();
    await saveCurrentAs(name);
}
export async function switchTo(name) {
    validateName(name);
    await ensureStorage();
    const source = profileAuthPath(name);
    if (!(await exists(source)))
        throw new Error(`Profile '${name}' does not exist.`);
    await syncCurrentAuth();
    await fs.copyFile(source, currentAuthPath);
    if (process.platform !== 'win32')
        await fs.chmod(currentAuthPath, 0o600);
    await fs.writeFile(currentProfilePath, `${name}\n`, 'utf8');
}
export async function removeProfile(name) {
    validateName(name);
    const current = await getCurrentProfile();
    if (current === name)
        throw new Error('Cannot remove the current profile. Switch to another profile first.');
    await fs.rm(profileDir(name), { recursive: true, force: true });
}
export async function writeMeta(name, meta) {
    await fs.mkdir(profileDir(name), { recursive: true });
    await fs.writeFile(profileMetaPath(name), JSON.stringify(meta, null, 2) + '\n', 'utf8');
}
async function readMeta(name) {
    try {
        return JSON.parse(await fs.readFile(profileMetaPath(name), 'utf8'));
    }
    catch {
        return undefined;
    }
}
export function inferWeekStarted(previous, status, observedAt) {
    if (status.weekStarted !== undefined)
        return status.weekStarted;
    if ((status.weekUsedPercent ?? 0) > 0)
        return true;
    if (status.weekReset === undefined || status.weekUsedPercent === undefined)
        return undefined;
    const isUnused = status.weekUsedPercent === 0;
    const previousWasUnused = previous?.weekUsedPercent === 0 || previous?.weekLeft === 100;
    const previousObservedAt = previous?.updatedAt ? Date.parse(previous.updatedAt) / 1000 : Number.NaN;
    if (isUnused && previousWasUnused && previous?.weekReset !== undefined && Number.isFinite(previousObservedAt)) {
        const elapsed = observedAt.getTime() / 1000 - previousObservedAt;
        const resetShift = status.weekReset - previous.weekReset;
        if (elapsed >= 1) {
            if (resetShift === 0)
                return true;
            if (Math.abs(resetShift - elapsed) <= RESET_SHIFT_TOLERANCE_SECONDS)
                return false;
        }
    }
    const now = observedAt.getTime() / 1000;
    if (previous?.weekStarted === true && (previous.weekReset ?? 0) > now)
        return true;
    if (previous?.weekStarted === false && isUnused)
        return false;
    return undefined;
}
async function saveStatus(name, status, forcedWeekStarted) {
    const observedAt = new Date();
    const previous = await readMeta(name);
    const meta = {
        ...status,
        weekStarted: forcedWeekStarted ?? inferWeekStarted(previous, status, observedAt),
        updatedAt: observedAt.toISOString(),
    };
    await writeMeta(name, meta);
    return meta;
}
export async function refreshProfileMeta(name, forcedWeekStarted) {
    validateName(name);
    const auth = profileAuthPath(name);
    if (!(await exists(auth)))
        throw new Error(`Profile '${name}' does not exist.`);
    const status = await queryAccountFromAuth(auth);
    return await saveStatus(name, status, forcedWeekStarted);
}
export async function refreshAllProfiles() {
    const profiles = await listProfiles();
    const refreshed = [];
    for (const profile of profiles) {
        try {
            const meta = await refreshProfileMeta(profile.name);
            refreshed.push({ ...profile, meta });
        }
        catch {
            refreshed.push(profile);
        }
    }
    return refreshed;
}
export async function listProfiles() {
    await ensureStorage();
    const current = await getCurrentProfile();
    const entries = await fs.readdir(accountsDir, { withFileTypes: true });
    const profiles = [];
    for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.'))
            continue;
        const auth = profileAuthPath(entry.name);
        if (!(await exists(auth)))
            continue;
        const meta = await readMeta(entry.name);
        profiles.push({ name: entry.name, isCurrent: entry.name === current, meta });
    }
    return profiles.sort((a, b) => a.name.localeCompare(b.name));
}
export async function inspectWeeklyWindows() {
    await syncCurrentAuth();
    const profiles = await listProfiles();
    const inspected = [];
    const targets = [];
    const unknown = [];
    for (const profile of profiles) {
        let next = profile;
        try {
            const status = await probeAccountFromAuth(profileAuthPath(profile.name));
            const meta = await saveStatus(profile.name, status);
            next = { ...profile, meta };
        }
        catch {
            unknown.push(profile);
            inspected.push(profile);
            continue;
        }
        inspected.push(next);
        if (next.meta?.weekStarted === false)
            targets.push(next);
        else if (next.meta?.weekStarted === undefined)
            unknown.push(next);
    }
    return { profiles: inspected, targets, unknown };
}
export async function initializeWeeklyWindow(name) {
    validateName(name);
    const auth = profileAuthPath(name);
    if (!(await exists(auth)))
        throw new Error(`Profile '${name}' does not exist.`);
    await triggerWeeklyWindowFromAuth(auth);
    try {
        return await refreshProfileMeta(name, true);
    }
    catch {
        const meta = {
            ...(await readMeta(name)),
            weekStarted: true,
            updatedAt: new Date().toISOString(),
        };
        await writeMeta(name, meta);
        return meta;
    }
}
//# sourceMappingURL=accounts.js.map