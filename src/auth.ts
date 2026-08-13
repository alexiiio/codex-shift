type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null ? value as JsonRecord : undefined;
}

function decodeJwtPayload(token: unknown): JsonRecord | undefined {
  if (typeof token !== 'string') return undefined;
  const parts = token.split('.');
  if (parts.length < 2) return undefined;
  try {
    return asRecord(JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')));
  } catch {
    return undefined;
  }
}

export function readAuthIdentity(content: string | Buffer): string | undefined {
  let root: JsonRecord;
  try {
    root = asRecord(JSON.parse(content.toString())) ?? {};
  } catch {
    return undefined;
  }

  const tokens = asRecord(root.tokens);
  const explicit = tokens?.account_id ?? tokens?.accountId ?? root.account_id ?? root.accountId;
  if (typeof explicit === 'string' && explicit.length > 0) return `account:${explicit}`;

  for (const token of [tokens?.id_token, tokens?.access_token, root.id_token, root.access_token]) {
    const payload = decodeJwtPayload(token);
    const auth = asRecord(payload?.['https://api.openai.com/auth']);
    const stable = auth?.chatgpt_account_id ?? auth?.chatgpt_user_id ?? payload?.sub ?? payload?.email;
    if (typeof stable === 'string' && stable.length > 0) return `token:${stable}`;
  }
  return undefined;
}

export function assertSameAuthIdentity(
  activeAuth: string | Buffer,
  savedAuth: string | Buffer,
  profileName: string,
): void {
  const activeIdentity = readAuthIdentity(activeAuth);
  const savedIdentity = readAuthIdentity(savedAuth);
  if (activeIdentity && savedIdentity && activeIdentity === savedIdentity) return;

  const reason = activeIdentity && savedIdentity
    ? 'Codex is logged in to a different account'
    : 'Codex Shift could not verify that both credentials belong to the same account';
  throw new Error(
    `${reason}; profile '${profileName}' was not overwritten. `
    + 'Run `codex-shift save <name>` to explicitly save the active login first.',
  );
}
