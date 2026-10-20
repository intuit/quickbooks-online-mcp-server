import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  CONFIRMATION_TTL_MS,
  _resetConfirmationState,
  issueConfirmationCode,
  verifyConfirmationCode,
} from '../../../src/helpers/confirmation-code.js';

const target = { entity: 'Invoice', id: '42', syncToken: '3', action: 'void' as const };
const NOW = 1_700_000_000_000;

describe('confirmation codes', () => {
  beforeEach(() => _resetConfirmationState());

  it('round trips once, then reports used', () => {
    const code = issueConfirmationCode(target, NOW);
    expect(verifyConfirmationCode(code, target, NOW + 1)).toBe('ok');
    expect(verifyConfirmationCode(code, target, NOW + 2)).toBe('used');
  });

  it('uses the current time by default', () => {
    const code = issueConfirmationCode(target);
    expect(verifyConfirmationCode(code, target)).toBe('ok');
  });

  it('rejects a different id, entity or action', () => {
    const code = issueConfirmationCode(target, NOW);
    expect(verifyConfirmationCode(code, { ...target, id: '43' }, NOW)).toBe('invalid');
    expect(verifyConfirmationCode(code, { ...target, entity: 'Bill' }, NOW)).toBe('invalid');
    expect(verifyConfirmationCode(code, { ...target, action: 'delete' }, NOW)).toBe('invalid');
    expect(verifyConfirmationCode(code, target, NOW)).toBe('ok');
  });

  it('reports changed when the syncToken differs, without consuming', () => {
    const code = issueConfirmationCode(target, NOW);
    expect(verifyConfirmationCode(code, { ...target, syncToken: '4' }, NOW)).toBe('changed');
    expect(verifyConfirmationCode(code, target, NOW)).toBe('ok');
  });

  it('expires after the TTL', () => {
    expect(CONFIRMATION_TTL_MS).toBe(600_000);
    const code = issueConfirmationCode(target, NOW);
    expect(verifyConfirmationCode(code, target, NOW + 600_001)).toBe('expired');
    expect(verifyConfirmationCode(code, target, NOW + 600_000)).toBe('ok');
  });

  it('rejects tampered or garbage codes', () => {
    const code = issueConfirmationCode(target, NOW);
    const [payload, sig] = code.split('.');
    expect(verifyConfirmationCode('garbage', target, NOW)).toBe('invalid');
    expect(verifyConfirmationCode('', target, NOW)).toBe('invalid');
    expect(verifyConfirmationCode('a.b.c', target, NOW)).toBe('invalid');
    expect(verifyConfirmationCode(`${payload}.${sig.slice(0, -2)}`, target, NOW)).toBe('invalid');
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
    expect(verifyConfirmationCode(`${payload}.${flipped}`, target, NOW)).toBe('invalid');
  });

  it('invalidates old codes after a simulated restart', () => {
    const code = issueConfirmationCode(target, NOW);
    _resetConfirmationState();
    expect(verifyConfirmationCode(code, target, NOW)).toBe('invalid');
  });

  it('prunes expired nonces and still rejects them as expired', () => {
    const old = issueConfirmationCode(target, NOW);
    expect(verifyConfirmationCode(old, target, NOW)).toBe('ok');
    const later = NOW + 700_000;
    const fresh = issueConfirmationCode(target, later);
    expect(verifyConfirmationCode(fresh, target, later)).toBe('ok');
    expect(verifyConfirmationCode(old, target, later)).toBe('expired');
    expect(verifyConfirmationCode(fresh, target, later)).toBe('used');
  });

  it('keeps unexpired consumed nonces when pruning', () => {
    const a = issueConfirmationCode(target, NOW);
    const b = issueConfirmationCode(target, NOW + 1);
    expect(verifyConfirmationCode(a, target, NOW)).toBe('ok');
    expect(verifyConfirmationCode(b, target, NOW + 1)).toBe('ok');
    expect(verifyConfirmationCode(a, target, NOW + 2)).toBe('used');
  });
});
