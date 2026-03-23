import { describe, it, expect } from 'vitest';
import { formatRoleName } from '../NotificationTriggerService';

describe('formatRoleName', () => {
  it('returns Team Member for null input', () => {
    expect(formatRoleName(null)).toEqual({ en: 'Team Member', ar: 'عضو الفريق' });
  });

  it('returns Team Member for undefined input', () => {
    expect(formatRoleName(undefined)).toEqual({ en: 'Team Member', ar: 'عضو الفريق' });
  });

  it('returns Team Member for empty string', () => {
    expect(formatRoleName('')).toEqual({ en: 'Team Member', ar: 'عضو الفريق' });
  });

  // PascalCase (canonical AppRole format)
  it('resolves SuperAdmin in PascalCase', () => {
    expect(formatRoleName('SuperAdmin').en).toBe('Super Administrator');
  });

  // camelCase (legacy format from database)
  it('resolves superAdmin in camelCase', () => {
    expect(formatRoleName('superAdmin').en).toBe('Super Administrator');
  });

  // snake_case (another legacy format)
  it('resolves super_admin in snake_case', () => {
    expect(formatRoleName('super_admin').en).toBe('Super Administrator');
  });

  it('resolves Admin', () => {
    expect(formatRoleName('Admin').en).toBe('Administrator');
  });

  it('resolves Supervisor', () => {
    const result = formatRoleName('Supervisor');
    expect(result.en).toBe('Hub Supervisor');
    expect(result.ar).toBe('مشرف المحور');
  });

  it('resolves DataCollector in camelCase', () => {
    expect(formatRoleName('DataCollector').en).toBe('Data Collector');
  });

  it('resolves data_collector in snake_case', () => {
    expect(formatRoleName('data_collector').en).toBe('Data Collector');
  });

  it('resolves FinancialAdmin', () => {
    expect(formatRoleName('FinancialAdmin').en).toBe('Finance Officer');
  });

  it('resolves the FOM shorthand', () => {
    expect(formatRoleName('fom').en).toBe('Field Operations Manager');
    expect(formatRoleName('FOM').en).toBe('Field Operations Manager');
  });

  it('resolves Field Operation Manager (FOM) — the full AppRole string', () => {
    expect(formatRoleName('Field Operation Manager (FOM)').en).toBe('Field Operations Manager');
  });

  it('returns a formatted fallback for unknown roles', () => {
    const result = formatRoleName('unknown_custom_role');
    expect(result.en).toBe('Unknown Custom Role');
  });

  it('all resolutions return both en and ar strings', () => {
    const roles = ['SuperAdmin', 'Admin', 'Supervisor', 'Coordinator', 'DataCollector', 'Auditor'];
    roles.forEach(role => {
      const result = formatRoleName(role);
      expect(typeof result.en).toBe('string');
      expect(typeof result.ar).toBe('string');
      expect(result.en.length).toBeGreaterThan(0);
      expect(result.ar.length).toBeGreaterThan(0);
    });
  });
});
