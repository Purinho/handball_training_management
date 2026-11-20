/**
 * Security utilities for URL validation (XSS prevention) and cryptographic invite codes.
 */

export function isSafeHttpUrl(url: string | undefined | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function sanitizeHttpUrl(url: string | undefined | null): string | undefined {
  if (!isSafeHttpUrl(url)) return undefined;
  return url!.trim();
}

/**
 * Generates a cryptographically strong club invite code (e.g. "TSVH-8F4A2C9E1B")
 * using Web Crypto API (crypto.getRandomValues) instead of Math.random().
 */
export function generateSecureInviteCode(clubName: string): string {
  const cleanedPrefix = (clubName || 'CLUB')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4);
  const prefix = cleanedPrefix || 'CLUB';

  const bytes = new Uint8Array(5); // 5 bytes = 10 hex characters (2^40 > 1.09 trillion combinations)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const randomHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return `${prefix}-${randomHex}`;
}

export function isValidInviteCodeFormat(code: string | undefined | null): boolean {
  if (!code || typeof code !== 'string') return false;
  const trimmed = code.trim().toUpperCase();
  // Supports both new 10-char codes (XXXX-1234567890) and existing legacy codes (XXXX-1234)
  return /^[A-Z0-9]{1,8}-[A-Z0-9]{4,16}$/.test(trimmed);
}
