import type { AccountStatus } from './types.js';
export declare function ensureCodexInstalled(): void;
export declare function loginWithCodex(): Promise<void>;
export declare function queryAccountFromAuth(authPath: string): Promise<AccountStatus>;
