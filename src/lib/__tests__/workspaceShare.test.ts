import { describe, it, expect } from 'vitest';
import { sanitizeShareCode } from '../workspaceShare';

describe('sanitizeShareCode', () => {
  it('returns null for empty input', () => {
    expect(sanitizeShareCode(undefined)).toBeNull();
    expect(sanitizeShareCode('')).toBeNull();
    expect(sanitizeShareCode('   ')).toBeNull();
  });

  it('keeps a normal short code', () => {
    expect(sanitizeShareCode('R226KVHG')).toBe('R226KVHG');
  });

  it('strips WhatsApp wrapping junk from the path segment', () => {
    expect(sanitizeShareCode('R226KVHG/')).toBe('R226KVHG');
    expect(sanitizeShareCode('R226KVHG.')).toBe('R226KVHG');
    expect(sanitizeShareCode('%0AR226KVHG%0A')).toBe('R226KVHG');
  });

  it('rejects codes that are too long to be a share id', () => {
    expect(sanitizeShareCode('a'.repeat(80))).toBeNull();
  });
});
