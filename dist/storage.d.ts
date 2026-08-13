export declare function atomicWriteFile(target: string, data: string | Buffer, mode?: number): Promise<void>;
export declare function withFileLock<T>(lockPath: string, action: () => Promise<T>): Promise<T>;
