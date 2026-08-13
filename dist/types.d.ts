export interface AccountMeta {
    email?: string;
    plan?: string;
    weekLeft?: number;
    weekUsedPercent?: number;
    weekWindowDurationMins?: number;
    weekReset?: number;
    weekStarted?: boolean;
    updatedAt?: string;
}
export interface AccountProfile {
    name: string;
    isCurrent: boolean;
    meta?: AccountMeta;
    dataSource?: 'live' | 'cached' | 'unavailable';
}
export interface AccountStatus {
    email?: string;
    plan?: string;
    weekLeft?: number;
    weekUsedPercent?: number;
    weekWindowDurationMins?: number;
    weekReset?: number;
    weekStarted?: boolean;
}
export interface WeeklyInitPlan {
    name: string;
    account?: string;
    model?: string;
    reasoningEffort: string;
    modelSource: 'known-ranked' | 'account-default' | 'cli-default';
}
