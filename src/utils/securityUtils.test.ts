import { describe, expect, it } from 'vitest';
import {
  generateSecureInviteCode,
  isSafeHttpUrl,
  isValidInviteCodeFormat,
  sanitizeHttpUrl
} from './securityUtils';

describe('securityUtils', () => {
  it('allows valid http and https URLs and blocks javascript/data XSS URLs', () => {
    expect(isSafeHttpUrl('https://www.dhb.de/training')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:5173/test')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('  JAVASCRIPT:alert(document.cookie) ')).toBe(false);
    expect(isSafeHttpUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHttpUrl('')).toBe(false);
    expect(isSafeHttpUrl(undefined)).toBe(false);

    expect(sanitizeHttpUrl('https://youtube.com/watch?v=123')).toBe(
      'https://youtube.com/watch?v=123'
    );
    expect(sanitizeHttpUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('generates cryptographically strong 10-hex-character invite codes', () => {
    const code1 = generateSecureInviteCode('TSV Handball Musterstadt');
    const code2 = generateSecureInviteCode('TSV Handball Musterstadt');

    expect(code1).toMatch(/^TSVH-[0-9A-F]{10}$/);
    expect(code2).toMatch(/^TSVH-[0-9A-F]{10}$/);
    expect(code1).not.toBe(code2);
    expect(isValidInviteCodeFormat(code1)).toBe(true);
  });

  it('validates invite code format properly', () => {
    expect(isValidInviteCodeFormat('SGH-2026')).toBe(true);
    expect(isValidInviteCodeFormat('TSVH-9F3A7C2E1B')).toBe(true);
    expect(isValidInviteCodeFormat('invalid')).toBe(false);
    expect(isValidInviteCodeFormat('')).toBe(false);
  });
});
