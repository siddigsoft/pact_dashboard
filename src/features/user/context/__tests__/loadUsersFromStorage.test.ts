import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Inline the function under test.
// loadUsersFromStorage is a closure inside UserProvider, so we replicate its
// extracted logic here to keep it testable without mounting the full provider.
// If the implementation in UserContext.tsx changes, update this copy too.
// ---------------------------------------------------------------------------
function loadUsersFromStorage(): any[] {
  const users: any[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('user-')) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const storedUser = JSON.parse(raw);
      if (!storedUser.id) continue;
      users.push({
        id: storedUser.id,
        name: storedUser.name || 'Unknown',
        email: storedUser.email || '',
        role: storedUser.role || 'dataCollector',
        lastActive: storedUser.lastActive || new Date().toISOString(),
        availability: storedUser.availability || 'offline',
        ...storedUser,
      });
    } catch {
      // ignore parse errors
    }
  }
  return users;
}

// ---------------------------------------------------------------------------

describe('loadUsersFromStorage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('returns an empty array when localStorage is empty', () => {
    expect(loadUsersFromStorage()).toEqual([]);
  });

  it('ignores keys that do not start with "user-"', () => {
    localStorage.setItem('PACTCurrentUser', JSON.stringify({ id: 'x', name: 'Eve' }));
    localStorage.setItem('someOtherKey', 'value');
    expect(loadUsersFromStorage()).toHaveLength(0);
  });

  it('loads a single stored user', () => {
    const user = { id: 'u1', name: 'Alice', email: 'alice@example.com', role: 'Coordinator' };
    localStorage.setItem('user-u1', JSON.stringify(user));

    const result = loadUsersFromStorage();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
    expect(result[0].name).toBe('Alice');
    expect(result[0].role).toBe('Coordinator');
  });

  it('loads multiple users', () => {
    localStorage.setItem('user-u1', JSON.stringify({ id: 'u1', name: 'Alice' }));
    localStorage.setItem('user-u2', JSON.stringify({ id: 'u2', name: 'Bob' }));

    const result = loadUsersFromStorage();
    expect(result).toHaveLength(2);
  });

  it('applies default role "dataCollector" when role is missing', () => {
    localStorage.setItem('user-u1', JSON.stringify({ id: 'u1', name: 'No Role' }));

    const result = loadUsersFromStorage();
    expect(result[0].role).toBe('dataCollector');
  });

  it('applies default availability "offline" when missing', () => {
    localStorage.setItem('user-u1', JSON.stringify({ id: 'u1' }));

    const result = loadUsersFromStorage();
    expect(result[0].availability).toBe('offline');
  });

  it('applies default name "Unknown" when name is missing', () => {
    localStorage.setItem('user-u1', JSON.stringify({ id: 'u1' }));

    const result = loadUsersFromStorage();
    expect(result[0].name).toBe('Unknown');
  });

  it('skips entries without an id field', () => {
    localStorage.setItem('user-noid', JSON.stringify({ name: 'Ghost' }));

    expect(loadUsersFromStorage()).toHaveLength(0);
  });

  it('skips entries with invalid JSON silently', () => {
    localStorage.setItem('user-bad', 'not-json{{{');
    localStorage.setItem('user-good', JSON.stringify({ id: 'u2', name: 'Valid' }));

    const result = loadUsersFromStorage();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u2');
  });

  it('stored fields override defaults (spread wins)', () => {
    const user = { id: 'u1', name: 'Named', availability: 'online', role: 'Admin' };
    localStorage.setItem('user-u1', JSON.stringify(user));

    const result = loadUsersFromStorage();
    expect(result[0].availability).toBe('online');
    expect(result[0].role).toBe('Admin');
  });
});
