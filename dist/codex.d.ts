import type { AccountStatus, WeeklyInitPlan } from './types.js';
interface ModelListEntry {
    id?: string;
    model?: string;
    hidden?: boolean;
    isDefault?: boolean;
    defaultReasoningEffort?: string;
    supportedReasoningEfforts?: Array<{
        reasoningEffort?: string;
    }>;
}
export declare function ensureCodexInstalled(): void;
export declare function loginWithCodex(): Promise<Buffer>;
export declare function selectMinimalModel(models: ModelListEntry[]): Omit<WeeklyInitPlan, 'name' | 'account'>;
export declare function planWeeklyWindowFromAuth(authPath: string): Promise<Omit<WeeklyInitPlan, 'name' | 'account'>>;
export declare function queryAccountFromAuth(authPath: string): Promise<AccountStatus>;
export declare function probeAccountFromAuth(authPath: string): Promise<AccountStatus>;
export declare function triggerWeeklyWindowFromAuth(authPath: string, selection: Omit<WeeklyInitPlan, 'name' | 'account'>): Promise<Buffer>;
export {};
