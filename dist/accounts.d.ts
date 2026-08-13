import type { AccountMeta, AccountProfile, AccountStatus, WeeklyInitPlan } from './types.js';
export interface WeeklyWindowInspection {
    profiles: AccountProfile[];
    targets: AccountProfile[];
    unknown: AccountProfile[];
}
export declare function validateName(name: string): void;
export declare function ensureStorage(): Promise<void>;
export declare function getCurrentProfile(): Promise<string | null>;
export declare function recoverAccountState(): Promise<void>;
export declare function saveCurrentAs(name: string): Promise<void>;
export declare function loginProfile(name: string): Promise<void>;
export declare function switchTo(name: string): Promise<void>;
export declare function removeProfile(name: string): Promise<void>;
export declare function writeMeta(name: string, meta: AccountMeta): Promise<void>;
export declare function inferWeekStarted(previous: AccountMeta | undefined, status: AccountStatus, observedAt: Date): boolean | undefined;
export declare function isConfirmedUnstarted(status: AccountStatus): boolean;
export declare function refreshProfileMeta(name: string, forcedWeekStarted?: boolean): Promise<AccountMeta>;
export declare function refreshAllProfiles(): Promise<AccountProfile[]>;
export declare function mapWithConcurrency<T, R>(values: T[], concurrency: number, action: (value: T, index: number) => Promise<R>): Promise<R[]>;
export declare function listProfiles(): Promise<AccountProfile[]>;
export declare function inspectWeeklyWindows(): Promise<WeeklyWindowInspection>;
export declare function planWeeklyInitialization(profile: AccountProfile): Promise<WeeklyInitPlan>;
export declare function initializeWeeklyWindow(plan: WeeklyInitPlan): Promise<AccountMeta>;
