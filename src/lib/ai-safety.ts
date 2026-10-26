/** Model output is untrusted plain text; reject markup, secret material and control characters. */
export function safeModelText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 16000
    && !/<[^>]*>|-----BEGIN|(?:sk-|AIza)[A-Za-z0-9_-]{20,}|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);
}
