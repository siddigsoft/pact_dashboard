// Central type exports to maintain compatibility
export * from './mmp';
export * from './siteVisit';
export * from './financial';
export * from './notification';
export * from './project';
export * from './mobile';
export * from './chat';
export * from './archive'; // Added archive types
export * from './roles'; // Export roles types

// Re-export geo-types but rename SiteVisit to GeoSiteVisit to avoid naming conflict
export type { DataCollector, GeoSiteVisit, Assignment, Hub } from './geo-types';

// Explicitly re-export user types to avoid naming conflicts
export type { User, UserLogin, UserRegister, UserUpdateRequest } from './user';
export type { AppRole, UserRole as AppUserRole } from './roles';

// Always import MMPStatus from './mmp/base'
import { MMPStatus } from './mmp/base';

// Remove this block:
// export interface MMPFile {
//   // ...existing fields...
//   status: MMPStatus;
//   logs?: { action: string; by: string; date: string }[];
//   // ...existing fields...
// }
