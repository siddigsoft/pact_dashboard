
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
  
  /**
   * State assignment for team members (data collectors, coordinators)
   * Used for site filtering and locality matching
   */
  stateId?: string;
  
  /**
   * Locality assignment for team members
   * Required for site claiming in locality-specific dispatch mode
   */
  localityId?: string;
  
  /**
   * HUB-BASED SUPERVISION MODEL
   * ============================
   * Hub assignment for supervisors and team members.
   * Each hub manages MULTIPLE states:
   * - Kosti Hub: 7 states (white-nile, north-kordofan, south-kordofan, west-kordofan, north-darfur, south-darfur, east-darfur)
   * - Kassala Hub: 5 states (kassala, gedaref, gezira, sennar, blue-nile)
   * - Dongola Hub: 2 states (northern, river-nile)
   * - Forchana Hub: 2 states (west-darfur, central-darfur)
   * - Country Office: 2 states (khartoum, red-sea)
   * 
   * IMPORTANT: Hub supervisors should be assigned hub_id (NOT state_id).
   * They see ALL team members across ALL states within their hub.
   * Team members need matching hub_id to appear in supervisor's view.
   */
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
    accuracy?: number;
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
