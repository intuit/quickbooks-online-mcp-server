import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type ConfirmAction = 'void' | 'delete';

export interface ConfirmTarget {
  entity: string;
  id: string;
  syncToken: string;
  action: ConfirmAction;
}

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'used' | 'changed';

export const CONFIRMATION_TTL_MS = 600_000;

let key = randomBytes(32);
// nonce -> expiry (ms). Pruned once expired, since expired codes are rejected anyway.
const usedNonces = new Map<string, number>();

const sign = (payload: string): Buffer => createHmac('sha256', key).update(payload).digest();

export function issueConfirmationCode(t: ConfirmTarget, now: number = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({
      entity: t.entity,
      id: t.id,
      syncToken: t.syncToken,
      action: t.action,
      exp: now + CONFIRMATION_TTL_MS,
      nonce: randomBytes(16).toString('hex'),
    }),
  ).toString('base64url');
  return `${payload}.${sign(payload).toString('base64url')}`;
}

export function verifyConfirmationCode(
  code: string,
  t: ConfirmTarget,
  now: number = Date.now(),
): VerifyResult {
  const parts = code.split('.');
  if (parts.length !== 2) return 'invalid';
  const [payload, sig] = parts;
  const given = Buffer.from(sig, 'base64url');
  const expected = sign(payload);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'invalid';

  const p = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
    entity: string;
    id: string;
    syncToken: string;
    action: string;
    exp: number;
    nonce: string;
  };
  if (p.entity !== t.entity || p.id !== t.id || p.action !== t.action) return 'invalid';
  if (now > p.exp) return 'expired';
  if (usedNonces.has(p.nonce)) return 'used';
  if (p.syncToken !== t.syncToken) return 'changed';

  for (const [nonce, exp] of usedNonces) {
    if (now > exp) usedNonces.delete(nonce);
  }
  usedNonces.set(p.nonce, p.exp);
  return 'ok';
}

/** Tests only: simulates a process restart (new key, no consumed nonces). */
export function _resetConfirmationState(): void {
  key = randomBytes(32);
  usedNonces.clear();
}
