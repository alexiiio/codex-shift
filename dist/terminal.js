/**
 * Build a complete interactive frame with explicit CRLF line endings.
 * Raw terminal mode does not consistently translate LF back to column zero.
 */
export function formatTerminalFrame(clearSequence, lines) {
    const body = lines.join('\n').replace(/\r?\n/g, '\r\n');
    return `${clearSequence}${body}\r\n`;
}
//# sourceMappingURL=terminal.js.map