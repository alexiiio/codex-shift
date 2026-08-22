/**
 * Build a complete interactive frame with explicit CRLF line endings.
 * Raw terminal mode does not consistently translate LF back to column zero.
 */
export function formatTerminalFrame(clearSequence, lines) {
    const body = lines.join('\n').replace(/\r?\n/g, '\r\n');
    return `${clearSequence}${body}\r\n`;
}
export function isExpiringSoon(timestamp, nowSeconds = Date.now() / 1000) {
    const remainingSeconds = timestamp - nowSeconds;
    return remainingSeconds >= 0 && remainingSeconds <= 48 * 60 * 60;
}
//# sourceMappingURL=terminal.js.map