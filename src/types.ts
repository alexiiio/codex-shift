export interface AccountMeta {
  email?: string;
  plan?: string;
  weekLeft?: number;
  weekUsedPercent?: number;
  weekWindowDurationMins?: number;
  weekReset?: number;
  weekStarted?: boolean;
  resetCreditsAvailable?: number;
  resetCreditsNextExpiry?: number;
  resetCreditsExpiryState?: ResetCreditsExpiryState;
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
  resetCreditsAvailable?: number;
  resetCreditsNextExpiry?: number;
  resetCreditsExpiryState?: ResetCreditsExpiryState;
}

export type ResetCreditsExpiryState = 'known' | 'no-expiry' | 'partial' | 'unavailable';

export interface WeeklyInitPlan {
  name: string;
  account?: string;
  model?: string;
  reasoningEffort: string;
  modelSource: 'known-ranked' | 'account-default' | 'cli-default';
}
