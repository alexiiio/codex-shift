/**
 * Build a complete interactive frame with explicit CRLF line endings.
 * Raw terminal mode does not consistently translate LF back to column zero.
 */
export function formatTerminalFrame(clearSequence: string, lines: string[]): string {
  const body = lines.join('\n').replace(/\r?\n/g, '\r\n');
  return `${clearSequence}${body}\r\n`;
}

export function isExpiringSoon(timestamp: number, nowSeconds = Date.now() / 1000): boolean {
  const remainingSeconds = timestamp - nowSeconds;
  return remainingSeconds >= 0 && remainingSeconds <= 48 * 60 * 60;
}
