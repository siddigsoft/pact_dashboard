import { describe, expect, it } from 'vitest';
import {
  groupSiteImages,
  matchesDocumentFilters,
  normalizeSiteLabel,
  type DocumentMetadata,
} from '../workspaceDocuments';

describe('normalizeSiteLabel', () => {
  it('returns null for blank and Unknown Site variants', () => {
    expect(normalizeSiteLabel(null)).toBeNull();
    expect(normalizeSiteLabel('')).toBeNull();
    expect(normalizeSiteLabel('  ')).toBeNull();
    expect(normalizeSiteLabel('Unknown Site')).toBeNull();
    expect(normalizeSiteLabel('unknown site')).toBeNull();
  });

  it('returns trimmed real names', () => {
    expect(normalizeSiteLabel('  Port Sudan Clinic  ')).toBe('Port Sudan Clinic');
  });
});

describe('groupSiteImages', () => {
  it('does not treat literal Unknown Site as a real site when project exists', () => {
    const files: (DocumentMetadata & { id: string; updated_at: string })[] = [
      {
        id: '1',
        document_category: 'site_image',
        site_label: 'Unknown Site',
        project_label: 'Red Sea Hub',
        updated_at: '2026-09-01T00:00:00.000Z',
      },
      {
        id: '2',
        document_category: 'site_image',
        site_label: 'Clinic A',
        project_label: 'Red Sea Hub',
        updated_at: '2026-09-02T00:00:00.000Z',
      },
    ];
    const groups = groupSiteImages(files);
    expect(groups.map((g) => g.siteName).sort()).toEqual(['Clinic A', 'Red Sea Hub']);
  });
});

describe('matchesDocumentFilters site', () => {
  it('does not match Unknown Site label as a real site filter value', () => {
    const file: DocumentMetadata = {
      document_category: 'site_image',
      site_label: 'Unknown Site',
    };
    expect(
      matchesDocumentFilters(file, {
        category: 'site_image',
        project: '',
        site: 'Unknown Site',
        period: '',
        adminOnly: false,
      }),
    ).toBe(false);
  });
});
