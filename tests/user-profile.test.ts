import { expect, it } from 'vitest';
import { clientUser, PUBLIC_USER_COLUMNS } from '@/lib/user-profile';

it('allowlists client profile responses and keeps new columns private', () => {
  expect(clientUser({ id: 'user', email: 'self@example.test', username: 'reader', pin_hash: 'hash', password_hash: 'hash', totp_secret: 'secret', recovery_codes: ['secret'], google_id: 'private', future_secret: 'private' }))
    .toEqual({ id: 'user', email: 'self@example.test', username: 'reader' });
  expect(clientUser(null)).toBeNull();
});

it('never requests private fields for public profiles', () => {
  const fields = PUBLIC_USER_COLUMNS.split(',');
  for (const field of ['email', 'pin_hash', 'password_hash', 'totp_secret', 'recovery_codes', 'google_id', 'telegram_id']) {
    expect(fields).not.toContain(field);
  }
});
