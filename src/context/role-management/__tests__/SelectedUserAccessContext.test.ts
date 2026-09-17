import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SelectedUserAccessProvider lifecycle guard', () => {
  it('re-arms the mounted guard after a React StrictMode cleanup', () => {
    const source = readFileSync(
      `${process.cwd()}/src/context/role-management/SelectedUserAccessContext.tsx`,
      'utf8',
    );

    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*mounted\.current = true;\s*return \(\) => \{ mounted\.current = false; \};\s*\}, \[\]\);/,
    );
  });
});