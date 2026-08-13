import type { AccountMeta, AccountProfile, AccountStatus } from './types.js';
export interface WeeklyWindowInspection {
    profiles: AccountProfile[];
    targets: AccountProfile[];
    unknown: AccountProfile[];
}
export declare function validateName(name: string): void;
export declare function ensureStorage(): Promise<void>;
export declare function getCurrentProfile(): Promise<string | null>;
export declare function saveCurrentAs(name: string): Promise<void>;
export declare function loginProfile(name: string): Promise<void>;
export declare function switchTo(name: string): Promise<void>;
export declare function removeProfile(name: string): Promise<void>;
export declare function writeMeta(name: string, meta: AccountMeta): Promise<void>;
export declare function inferWeekStarted(previous: AccountMeta | undefined, status: AccountStatus, observedAt: Date): boolean | undefined;
export declare function refreshProfileMeta(name: string, forcedWeekStarted?: boolean): Promise<AccountMeta>;
export declare function refreshAllProfiles(): Promise<AccountProfile[]>;
export declare function listProfiles(): Promise<AccountProfile[]>;
export declare function inspectWeeklyWindows(): Promise<WeeklyWindowInspection>;
export declare function initializeWeeklyWindow(name: string): Promise<AccountMeta>;
