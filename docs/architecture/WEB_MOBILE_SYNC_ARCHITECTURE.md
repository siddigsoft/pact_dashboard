# 🔄 Web-Mobile Synchronization Architecture

**Ensuring Seamless Data Sync Between Web App, Database, and Mobile APK**

---

## 📋 Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Synchronization Strategy](#database-synchronization-strategy)
3. [API Versioning & Backward Compatibility](#api-versioning--backward-compatibility)
4. [Real-time Data Flow](#real-time-data-flow)
5. [Version Management](#version-management)
6. [Update & Deployment Process](#update--deployment-process)
7. [Compatibility Matrix](#compatibility-matrix)
8. [Migration Strategy](#migration-strategy)

---

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                      SHARED DATABASE                         │
│                    (Supabase PostgreSQL)                     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │  Tables: profiles, roles, projects, mmps,          │    │
│  │  site_visits, budgets, wallets, cost_submissions   │    │
│  │                                                     │    │
│  │  Row Level Security (RLS) Policies ✅              │    │
│  │  Real-time Subscriptions Enabled ✅                │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────┬─────────────────────┬────────────────────┘
                   │                     │
                   │                     │
    ┌──────────────▼──────────┐  ┌──────▼───────────────┐
    │      WEB APP            │  │   MOBILE APK         │
    │   (React + Vite)        │  │  (Capacitor)         │
    │                         │  │                      │
    │  - Supabase Client ✅   │  │  - Supabase Client ✅│
    │  - Real-time Subs ✅    │  │  - Real-time Subs ✅ │
    │  - Context API ✅       │  │  - Context API ✅    │
    │  - TanStack Query ✅    │  │  - TanStack Query ✅ │
    │  - Offline Queue ❌     │  │  - Offline Queue ✅  │
    │                         │  │                      │
    │  Hosted on Replit       │  │  Installed on Device │
    │  Always Latest Version  │  │  Version: 1.0.0+     │
    └─────────────────────────┘  └──────────────────────┘
```

### Key Principle: **Single Source of Truth**

- ✅ **Shared Supabase Database** - Both web and mobile connect to the same database
- ✅ **Real-time Subscriptions** - Changes propagate instantly to all connected clients
- ✅ **Identical Data Models** - Web and mobile use same TypeScript types
- ✅ **Unified Authentication** - Same Supabase Auth system for both platforms

---

## 💾 Database Synchronization Strategy

### 1. **Real-Time Synchronization (Instant)**

Both web and mobile apps subscribe to database changes using Supabase Real-time:

**Example: Site Visit Updates**

```typescript
// This code runs identically in web and mobile
useEffect(() => {
  const channel = supabase
    .channel('site_visits_changes')
    .on(
      'postgres_changes',
      { 
        event: '*', 
        schema: 'public', 
        table: 'site_visits' 
      },
      (payload) => {
        // Update happens automatically in both web and mobile
        queryClient.invalidateQueries({ queryKey: ['/api/site-visits'] });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, []);
```

**What This Means:**
- User updates site visit on web → Mobile sees change instantly ✅
- User updates site visit on mobile → Web sees change instantly ✅
- Updates happen in **milliseconds** (typically <500ms)

---

### 2. **Offline Synchronization (Mobile Only)**

Mobile app includes offline queue system that web app doesn't need:

**How It Works:**

```typescript
// Mobile-only feature
const { queueRequest } = useOfflineQueue();

// When offline, requests are queued
if (!navigator.onLine) {
  queueRequest({
    url: '/api/site-visits',
    method: 'POST',
    data: siteVisitData
  });
  // Shows user: "Saved locally. Will sync when online."
}

// When connection restored
window.addEventListener('online', () => {
  syncQueue(); // Automatically sends all queued requests
});
```

**Result:**
- Mobile user works offline → Changes stored locally ✅
- User goes back online → All changes sync to database ✅
- Web app sees changes appear automatically ✅

---

### 3. **Optimistic Updates (Both Platforms)**

Both web and mobile use TanStack Query for optimistic UI updates:

```typescript
const mutation = useMutation({
  mutationFn: (data) => apiRequest('/api/site-visits', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['/api/site-visits'] });
    
    // Snapshot previous value
    const previous = queryClient.getQueryData(['/api/site-visits']);
    
    // Optimistically update cache
    queryClient.setQueryData(['/api/site-visits'], (old) => 
      [...old, newData]
    );
    
    return { previous };
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['/api/site-visits'], context.previous);
  },
  onSuccess: () => {
    // Refetch to ensure sync
    queryClient.invalidateQueries({ queryKey: ['/api/site-visits'] });
  }
});
```

**User Experience:**
- User clicks "Save" → UI updates instantly (optimistic)
- Request fails → UI reverts to previous state
- Request succeeds → Database updates, real-time propagates to all clients

---

## 🔢 API Versioning & Backward Compatibility

### Current Version: **v1**

All API endpoints are currently unversioned, which is fine for v1.0.0 but needs to change.

### Future Strategy: **API Version Headers**

**Implementation Plan:**

1. **Add version to all API requests:**

```typescript
// src/lib/apiClient.ts
export async function apiRequest(url: string, options: RequestInit = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-API-Version': '1', // Add version header
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }

  return response.json();
}
```

2. **Server validates version and routes accordingly:**

```typescript
// Server-side (future implementation)
app.use((req, res, next) => {
  const apiVersion = req.headers['x-api-version'] || '1';
  
  // Route to appropriate version handler
  if (apiVersion === '1') {
    // Use v1 logic
  } else if (apiVersion === '2') {
    // Use v2 logic (backward compatible)
  }
  
  next();
});
```

### Versioning Rules

**✅ Safe Changes (No Version Bump Needed):**
- Adding new optional fields to database tables
- Adding new API endpoints
- Adding new features that don't affect existing data
- Bug fixes that don't change behavior
- UI/UX improvements

**⚠️ Breaking Changes (Require Version Bump):**
- Removing database columns
- Renaming database columns
- Changing data types
- Removing API endpoints
- Changing API response structure
- Changing authentication flow

### Backward Compatibility Strategy

**Rule #1: Old APKs Must Continue Working**

When you update the web app:

```typescript
// ❌ BAD - Breaks old APKs
// Old APK expects 'coordinator_id' field
// New web app removes it
const siteVisit = {
  id: '123',
  // coordinator_id: '456', // Removed - BREAKS OLD APKs!
  assigned_to: '456', // New field name
};

// ✅ GOOD - Supports both old and new APKs
const siteVisit = {
  id: '123',
  coordinator_id: '456', // Keep for old APKs
  assigned_to: '456',     // Add for new versions
};
```

**Rule #2: Database Schema is Additive Only**

```sql
-- ✅ GOOD - Adding new column (doesn't break anything)
ALTER TABLE site_visits ADD COLUMN new_field VARCHAR;

-- ❌ BAD - Removing column (breaks old APKs)
ALTER TABLE site_visits DROP COLUMN coordinator_id;

-- ✅ GOOD - Deprecate instead
ALTER TABLE site_visits 
  ADD COLUMN new_field VARCHAR,
  -- Keep old column, mark as deprecated in code comments
  -- Remove in v2.0.0 when all users updated
```

**Rule #3: Grace Period for Breaking Changes**

If you **must** make a breaking change:

1. **Release v1.1.0 (Web + Mobile APK)**
   - Add new field alongside old field
   - Both versions work

2. **Wait 3-6 months**
   - Most users update to v1.1.0+
   - Monitor analytics for old version usage

3. **Release v2.0.0 (Web + Mobile APK)**
   - Remove old field
   - Show "Update Required" message to users on old APKs

---

## ⚡ Real-time Data Flow

### Scenario 1: Web User Updates Data

```
[Web App] User clicks "Approve Site Visit"
    ↓
[Web App] Mutation updates database
    ↓
[Supabase] Database row updated
    ↓
[Supabase Real-time] Broadcasts change to all subscribers
    ↓
[Mobile App] Receives broadcast → Invalidates cache → Refetches data
    ↓
[Mobile App] UI updates automatically (within 500ms)
```

### Scenario 2: Mobile User Updates Data (Online)

```
[Mobile App] User submits cost submission
    ↓
[Mobile App] Mutation updates database
    ↓
[Supabase] Database row updated
    ↓
[Supabase Real-time] Broadcasts change to all subscribers
    ↓
[Web App] Receives broadcast → Invalidates cache → Refetches data
    ↓
[Web App] UI updates automatically (within 500ms)
```

### Scenario 3: Mobile User Updates Data (Offline)

```
[Mobile App] User submits cost submission (no internet)
    ↓
[Mobile App] Detects offline → Queues request in localStorage
    ↓
[Mobile App] Shows: "Saved locally. Will sync when online."
    ↓
--- User reconnects to internet ---
    ↓
[Mobile App] Detects online → Processes offline queue
    ↓
[Mobile App] Sends all queued requests to Supabase
    ↓
[Supabase] Database rows updated
    ↓
[Supabase Real-time] Broadcasts changes
    ↓
[Web App] Receives broadcasts → UI updates with all changes
```

---

## 📱 Version Management

### Version Numbering: **Semantic Versioning**

Format: `MAJOR.MINOR.PATCH`

**Examples:**
- `1.0.0` - Initial release
- `1.0.1` - Bug fix (backward compatible)
- `1.1.0` - New features (backward compatible)
- `2.0.0` - Breaking changes (not backward compatible)

### Storing Version in APK

**Update these files before each APK build:**

1. **`package.json`**
```json
{
  "name": "pact-workflow",
  "version": "1.0.0",  // ← Update this
  ...
}
```

2. **`capacitor.config.ts`**
```typescript
const config: CapacitorConfig = {
  appId: 'com.pact.workflow',
  appName: 'PACT Workflow',
  webDir: 'dist',
  // Note: Capacitor doesn't have a version field
  // Version is set in Android/iOS project files
};
```

3. **`android/app/build.gradle`**
```gradle
android {
    defaultConfig {
        applicationId "com.pact.workflow"
        minSdkVersion 22
        targetSdkVersion 33
        versionCode 1        // ← Increment this (integer)
        versionName "1.0.0"  // ← Update this (string)
    }
}
```

### Version Code vs Version Name

- **versionCode**: Integer that increments with each release (1, 2, 3, 4...)
  - Used by Google Play Store to determine which version is newer
  - Must always increase

- **versionName**: Human-readable version (1.0.0, 1.0.1, 1.1.0...)
  - Shown to users
  - Follows semantic versioning

**Example Timeline:**
```
Release 1: versionCode 1,  versionName "1.0.0"
Release 2: versionCode 2,  versionName "1.0.1" (bug fix)
Release 3: versionCode 3,  versionName "1.1.0" (new features)
Release 4: versionCode 4,  versionName "2.0.0" (breaking changes)
```

---

## 🚀 Update & Deployment Process

### Deployment Checklist

**Before Deploying Web App Update:**

```
1. Database Changes
   ☐ Schema changes are additive only (new columns, not removed)
   ☐ Migrations tested on staging database
   ☐ RLS policies updated if needed
   ☐ Indexes created for new columns (if needed)

2. API Changes
   ☐ New endpoints are backward compatible
   ☐ Existing endpoints maintain same response structure
   ☐ Optional fields marked as optional in TypeScript types
   ☐ API version header added (if needed)

3. Testing
   ☐ Tested with web app (latest code)
   ☐ Tested with mobile app (current APK version)
   ☐ Tested offline mode (mobile only)
   ☐ Tested real-time sync between web and mobile
   ☐ Tested with different user roles

4. Documentation
   ☐ Updated CHANGELOG.md
   ☐ Updated API documentation (if API changed)
   ☐ Updated replit.md with recent changes

5. Deployment
   ☐ Deploy database migrations (if any)
   ☐ Deploy web app to Replit
   ☐ Verify web app is working
   ☐ Verify old mobile APK still works
   ☐ Monitor error logs for 24 hours
```

**When to Release New Mobile APK:**

**Minor Updates (Monthly or as needed):**
- Bug fixes
- Performance improvements
- New features that use existing backend

**Major Updates (Quarterly or as needed):**
- New features requiring new database tables
- UI/UX overhaul
- Breaking changes (with migration guide)

---

### Update Process for Mobile Users

**Scenario A: Web Update (No APK Needed)**

```
1. You update web app → Deploy to Replit
2. Mobile APK continues to work (connects to same Supabase)
3. Mobile users see new data immediately via real-time sync
4. No APK update needed ✅
```

**Scenario B: Mobile Update (New APK Needed)**

```
1. You add new mobile-only feature (e.g., biometric auth)
2. Build new APK v1.1.0
3. Distribute to users via:
   - Google Play Store (auto-update)
   - Direct download link (manual update)
   - In-app update prompt (future feature)
```

**Scenario C: Breaking Change (Forced Update)**

```
1. You make breaking database change (e.g., remove old field)
2. Build new APK v2.0.0
3. Deploy web app with version check:

// In mobile app startup
const currentVersion = '1.0.0'; // From package.json
const minVersion = await getMinimumSupportedVersion(); // From API

if (compareVersions(currentVersion, minVersion) < 0) {
  // Show "Update Required" dialog
  showUpdateDialog({
    title: "Update Required",
    message: "Please update to the latest version to continue using PACT Workflow.",
    downloadUrl: "https://example.com/download-latest-apk"
  });
}
```

---

## 📊 Compatibility Matrix

### Web App vs Mobile APK Compatibility

| Web Version | Mobile v1.0.x | Mobile v1.1.x | Mobile v2.0.x |
|-------------|---------------|---------------|---------------|
| v1.0.x      | ✅ Full       | ✅ Full       | ⚠️ Degraded   |
| v1.1.x      | ✅ Full       | ✅ Full       | ✅ Full       |
| v1.2.x      | ✅ Full       | ✅ Full       | ✅ Full       |
| v2.0.x      | ❌ Broken     | ⚠️ Degraded   | ✅ Full       |

**Legend:**
- ✅ **Full**: All features work perfectly
- ⚠️ **Degraded**: Most features work, some new features unavailable
- ❌ **Broken**: App won't work, update required

### Database Schema Version Support

| Schema Version | Supports Web v1.x | Supports Mobile v1.x | Supports Web v2.x | Supports Mobile v2.x |
|----------------|-------------------|----------------------|-------------------|----------------------|
| v1             | ✅                | ✅                   | ❌                | ❌                   |
| v1.1 (additive)| ✅                | ✅                   | ✅                | ⚠️                   |
| v2             | ❌                | ❌                   | ✅                | ✅                   |

---

## 🔧 Migration Strategy

### Database Migration Best Practices

**Phase 1: Additive Changes (v1.x → v1.y)**

```sql
-- ✅ Add new column (doesn't break old versions)
ALTER TABLE site_visits 
ADD COLUMN new_status VARCHAR DEFAULT 'pending';

-- ✅ Add new table (old versions ignore it)
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  message TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ✅ Add new index (improves performance)
CREATE INDEX idx_site_visits_status ON site_visits(status);
```

**Phase 2: Deprecation (v1.y → v1.z)**

```sql
-- ✅ Duplicate data to new column
UPDATE site_visits 
SET new_status = old_status 
WHERE new_status IS NULL;

-- Mark old column as deprecated in code
-- Add comment in database
COMMENT ON COLUMN site_visits.old_status IS 
  'DEPRECATED: Use new_status instead. Will be removed in v2.0.0';
```

**Phase 3: Breaking Changes (v2.0.0)**

```sql
-- After 3-6 month grace period
-- And after confirming <5% of users on old versions

-- ❌ Now safe to remove old column
ALTER TABLE site_visits DROP COLUMN old_status;
```

### Code Migration Example

**v1.0.0 - Original Code**
```typescript
interface SiteVisit {
  id: string;
  coordinator_id: string; // Old field
  status: 'pending' | 'approved';
}
```

**v1.1.0 - Transition Phase**
```typescript
interface SiteVisit {
  id: string;
  coordinator_id: string;  // Keep for backward compat
  assigned_to: string;     // New field
  status: 'pending' | 'approved' | 'in_progress'; // Extended
}

// Helper function for backward compatibility
function normalizeSiteVisit(raw: any): SiteVisit {
  return {
    ...raw,
    assigned_to: raw.assigned_to || raw.coordinator_id, // Fallback
  };
}
```

**v2.0.0 - Breaking Change**
```typescript
interface SiteVisit {
  id: string;
  assigned_to: string;  // Only new field
  status: 'pending' | 'approved' | 'in_progress' | 'completed';
}
```

---

## 🛠️ Implementation Tools

### 1. Version Checker Utility

Create `src/utils/versionChecker.ts`:

```typescript
import { compareVersions } from 'compare-versions';
import { supabase } from '@/integrations/supabase/client';

interface AppVersion {
  current: string;
  minimum_supported: string;
  latest: string;
  update_required: boolean;
  update_available: boolean;
}

export async function checkAppVersion(
  currentVersion: string
): Promise<AppVersion> {
  // Fetch version info from database
  const { data, error } = await supabase
    .from('app_versions')
    .select('*')
    .eq('platform', 'mobile')
    .single();

  if (error || !data) {
    return {
      current: currentVersion,
      minimum_supported: currentVersion,
      latest: currentVersion,
      update_required: false,
      update_available: false,
    };
  }

  const updateRequired = 
    compareVersions(currentVersion, data.minimum_supported) < 0;
  
  const updateAvailable = 
    compareVersions(currentVersion, data.latest) < 0;

  return {
    current: currentVersion,
    minimum_supported: data.minimum_supported,
    latest: data.latest,
    update_required: updateRequired,
    update_available: updateAvailable,
  };
}
```

### 2. Database Table for Version Control

```sql
CREATE TABLE app_versions (
  id SERIAL PRIMARY KEY,
  platform VARCHAR NOT NULL, -- 'web' or 'mobile'
  current_version VARCHAR NOT NULL,
  minimum_supported VARCHAR NOT NULL,
  latest_version VARCHAR NOT NULL,
  changelog TEXT,
  download_url VARCHAR,
  force_update BOOLEAN DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert initial version
INSERT INTO app_versions (platform, current_version, minimum_supported, latest_version)
VALUES ('mobile', '1.0.0', '1.0.0', '1.0.0');

INSERT INTO app_versions (platform, current_version, minimum_supported, latest_version)
VALUES ('web', '1.0.0', '1.0.0', '1.0.0');
```

### 3. Update Dialog Component

Create `src/components/UpdateDialog.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { checkAppVersion } from '@/utils/versionChecker';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Device } from '@capacitor/device';

export function UpdateDialog() {
  const [versionInfo, setVersionInfo] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    async function checkVersion() {
      const deviceInfo = await Device.getInfo();
      
      // Only check on mobile
      if (deviceInfo.platform !== 'web') {
        const packageJson = await import('../../package.json');
        const version = await checkAppVersion(packageJson.version);
        
        setVersionInfo(version);
        
        if (version.update_required || version.update_available) {
          setShowDialog(true);
        }
      }
    }

    checkVersion();
  }, []);

  if (!versionInfo) return null;

  const isRequired = versionInfo.update_required;

  return (
    <Dialog open={showDialog} onOpenChange={!isRequired ? setShowDialog : undefined}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isRequired ? '⚠️ Update Required' : '🎉 Update Available'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p>
            {isRequired
              ? 'You must update to continue using PACT Workflow.'
              : 'A new version of PACT Workflow is available with new features and improvements.'}
          </p>
          
          <div className="bg-muted p-4 rounded-md">
            <p className="text-sm">
              <strong>Current:</strong> v{versionInfo.current}
            </p>
            <p className="text-sm">
              <strong>Latest:</strong> v{versionInfo.latest}
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              onClick={() => {
                // Open download URL or Play Store
                window.open(versionInfo.download_url || 'https://play.google.com/store/apps/details?id=com.pact.workflow', '_system');
              }}
              className="flex-1"
            >
              Update Now
            </Button>
            
            {!isRequired && (
              <Button 
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Later
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## 📝 Quick Reference

### Sync Checklist for Every Update

**Before Deploying Any Update:**

```bash
# 1. Check current versions
cat package.json | grep version
cat android/app/build.gradle | grep versionCode

# 2. Run tests
npm test

# 3. Build and verify
npm run build
npx cap sync android

# 4. Test with old APK
# Install old APK on device
# Deploy new web app
# Verify old APK still works

# 5. Deploy
git add .
git commit -m "Release v1.1.0"
git push
```

### Version Bump Guide

**Bug Fix (1.0.0 → 1.0.1):**
```bash
npm version patch
# Update android/app/build.gradle versionCode
# Build and deploy
```

**New Feature (1.0.1 → 1.1.0):**
```bash
npm version minor
# Update android/app/build.gradle versionCode
# Build and deploy
```

**Breaking Change (1.1.0 → 2.0.0):**
```bash
npm version major
# Update android/app/build.gradle versionCode
# Update database migration
# Build and deploy
# Communicate to users
```

---

## ✅ Success Criteria

Your web-mobile sync is working correctly when:

- ✅ Web user creates record → Mobile sees it within 1 second
- ✅ Mobile user creates record → Web sees it within 1 second
- ✅ Mobile works offline → Syncs when reconnected
- ✅ Old APK continues working after web deploy
- ✅ Database schema changes don't break old APKs
- ✅ Real-time subscriptions work on both platforms
- ✅ Authentication works seamlessly on both platforms

---

**Last Updated:** November 24, 2025  
**PACT Workflow Platform - Sync Architecture v1.0.0**
