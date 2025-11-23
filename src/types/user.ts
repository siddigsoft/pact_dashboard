
// These are just placeholder types to avoid TypeScript errors.
// You would replace these with your actual types.

import { AppRole } from './roles';
import type { ClassificationLevel, ClassificationRoleScope } from './classification';

export interface User {
  id: string;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  status?: string;
  role: string;
  createdAt?: string;
  updatedAt?: string;
  isApproved?: boolean;
  employeeId?: string;
  stateId?: string;
  localityId?: string;
  hubId?: string;
  avatar?: string;
  username?: string;
  fullName?: string;
  lastActive: string;  // Changed from optional to required
  performance?: {
    rating: number;
    totalCompletedTasks: number;
    onTimeCompletion: number;
    currentWorkload?: number;
  };
  location?: {
    latitude?: number;
    longitude?: number;
    region?: string;
    address?: string;
    isSharing?: boolean;
    lastUpdated?: string;
  };
  settings?: {
    language?: string;
    notificationPreferences?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
    theme?: 'light' | 'dark' | 'system';
    defaultPage?: string;
    shareLocationWithTeam?: boolean;
    displayPersonalMetrics?: boolean;
  };
  availability: string;  // Changed from optional to required
  roles?: AppRole[];
  
  // Classification information (for coordinators, data collectors, supervisors)
  classification?: {
    level: ClassificationLevel;
    roleScope: ClassificationRoleScope;
    hasRetainer: boolean;
    retainerAmountCents: number;
    retainerCurrency: string;
    effectiveFrom: string;
    effectiveUntil?: string;
  };
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserRegister extends UserLogin {
  name: string;
  phone?: string;
  role?: string;
}

export interface UserUpdateRequest {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  status?: string;
  avatar?: string;
  settings?: User['settings'];
}
