export interface AccountMeta {
  email?: string;
  plan?: string;
  weekLeft?: number;
  weekReset?: number;
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
  weekReset?: number;
}
