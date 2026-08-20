/**
 * Build a complete interactive frame with explicit CRLF line endings.
 * Raw terminal mode does not consistently translate LF back to column zero.
 */
export declare function formatTerminalFrame(clearSequence: string, lines: string[]): string;
