import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SelectedUserAccessProvider lifecycle guard', () => {
  const source = readFileSync(
    `${process.cwd()}/src/context/role-management/SelectedUserAccessContext.tsx`,
    'utf8',
  );

  it('re-arms the mounted guard after a React StrictMode cleanup', () => {
    expect(source).toMatch(
      /useEffect\(\(\) => \{\s*mounted\.current = true;\s*return \(\) => \{ mounted\.current = false; \};\s*\}, \[\]\);/,
    );
  });

  it('clears loading for the current load sequence without requiring mounted', () => {
    expect(source).toMatch(
      /if \(sequence === loadSequence\.current\) setLoading\(false\);/,
    );
    expect(source).toMatch(/\}, \[userId, userRole\]\);/);
  });
});
