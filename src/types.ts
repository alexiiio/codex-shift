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
