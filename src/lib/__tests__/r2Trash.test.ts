import { describe, expect, it } from 'vitest';
import {
  R2_TRASH_PREFIX,
  fromR2TrashKey,
  isR2TrashKey,
  toR2TrashKey,
} from '../r2Storage';

describe('R2 trash key helpers', () => {
  it('parks live keys under trash/', () => {
    expect(toR2TrashKey('Projects/2026-08/report__abcd.pdf')).toBe(
      'trash/Projects/2026-08/report__abcd.pdf',
    );
    expect(isR2TrashKey('trash/Projects/2026-08/report__abcd.pdf')).toBe(true);
  });

  it('is idempotent when the key is already in trash', () => {
    const key = 'trash/Hub/2026-08/notes__x.pdf';
    expect(toR2TrashKey(key)).toBe(key);
  });

  it('restores the original key from trash/', () => {
    expect(fromR2TrashKey('trash/Desktop/file__id.zip')).toBe('Desktop/file__id.zip');
    expect(fromR2TrashKey('Desktop/file__id.zip')).toBe('Desktop/file__id.zip');
  });

  it('uses the trash/ prefix constant', () => {
    expect(R2_TRASH_PREFIX).toBe('trash/');
  });

  it('treats an already-trashed key as a no-op for toR2TrashKey', () => {
    const trashed = toR2TrashKey('a/b.pdf');
    expect(toR2TrashKey(trashed)).toBe(trashed);
    expect(isR2TrashKey(trashed)).toBe(true);
  });
});
