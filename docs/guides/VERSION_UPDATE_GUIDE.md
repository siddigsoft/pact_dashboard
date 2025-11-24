# 📦 Version Update Guide

**Step-by-Step Instructions for Updating PACT Workflow Versions**

---

## 🎯 Quick Reference

### When to Update Version?

| Change Type | Version Bump | New APK? | Example |
|-------------|--------------|----------|---------|
| Bug fix | Patch (1.0.0 → 1.0.1) | Optional | Fix login error |
| New feature | Minor (1.0.1 → 1.1.0) | Recommended | Add export feature |
| Breaking change | Major (1.1.0 → 2.0.0) | **Required** | Remove old field |
| UI/UX update | Patch | Optional | Change button color |
| Performance | Patch | Optional | Optimize queries |

---

## 🔄 Scenario 1: Web-Only Update (No New APK)

**Use when:** Bug fix, UI change, or new feature that works with existing mobile APK

### Step-by-Step:

**1. Make Your Changes**
```bash
# Edit your code
# Test locally
npm run dev
```

**2. Update Web Version in Database**
```sql
-- Connect to database
psql $DATABASE_URL

-- Update web version
UPDATE app_versions 
SET current_version = '1.0.1',
    latest_version = '1.0.1',
    changelog = 'Fixed login bug and improved performance',
    updated_at = NOW()
WHERE platform = 'web';

-- Verify
SELECT * FROM app_versions WHERE platform = 'web';
\q
```

**3. Test with Existing Mobile APK**
```bash
# Install current APK on device
adb devices
adb install PACT-Workflow-v1.0.0.apk

# Deploy web changes
npm run build
git add .
git commit -m "fix: login bug and performance improvements"
git push

# Test mobile app with new web code
# - Login should work
# - All features should work
# - Real-time sync should work
```

**4. Deploy**
```bash
# Changes auto-deploy on Replit when pushed to main
git push origin main

# Monitor for issues
# Check logs for errors
```

**Result:**
- ✅ Web app updated to v1.0.1
- ✅ Mobile APK v1.0.0 still works perfectly
- ✅ No APK rebuild needed
- ✅ Users see improvements immediately on web
- ✅ Mobile users continue working without update

---

## 📱 Scenario 2: Mobile APK Update (Bug Fix)

**Use when:** Mobile-specific bug or performance improvement

### Step-by-Step:

**1. Update Version Numbers**

**`package.json`:**
```json
{
  "version": "1.0.1"  // 1.0.0 → 1.0.1
}
```

**`android/app/build.gradle`:**
```gradle
defaultConfig {
    versionCode 2        // Increment: 1 → 2
    versionName "1.0.1"  // Update: "1.0.0" → "1.0.1"
}
```

**2. Make Your Changes**
```bash
# Fix bug in mobile code
# Test locally
npm run dev
```

**3. Build Production APK**
```bash
# Build React app
npm run build

# Sync Capacitor
npx cap sync android

# Build APK
cd android
./gradlew assembleRelease

# APK location: app/build/outputs/apk/release/app-release.apk
```

**4. Test APK**
```bash
# Install on device
adb install app/build/outputs/apk/release/app-release.apk

# Test all features
# - Bug is fixed
# - All features work
# - Real-time sync works
```

**5. Update Database**
```sql
UPDATE app_versions 
SET current_version = '1.0.1',
    latest_version = '1.0.1',
    minimum_supported = '1.0.0',  -- Old version still works
    changelog = 'Fixed offline sync bug',
    download_url = 'https://example.com/PACT-Workflow-v1.0.1.apk',
    updated_at = NOW()
WHERE platform = 'mobile';
```

**6. Distribute APK**
```bash
# Copy to final location
cp android/app/build/outputs/apk/release/app-release.apk PACT-Workflow-v1.0.1.apk

# Upload to:
# - Google Play Store
# - Direct download server
# - Firebase App Distribution
```

**Result:**
- ✅ Mobile v1.0.1 available
- ✅ Mobile v1.0.0 still supported
- ✅ Users get optional update notification
- ✅ Bug fixed for users who update

---

## 🆕 Scenario 3: New Feature (Web + Mobile)

**Use when:** Adding new feature that requires both web and mobile changes

### Step-by-Step:

**1. Update Versions**

```bash
# Bump minor version
npm version minor  # 1.0.1 → 1.1.0
```

**`android/app/build.gradle`:**
```gradle
defaultConfig {
    versionCode 3        // Increment
    versionName "1.1.0"  // Update
}
```

**2. Database Changes (if needed)**

**✅ GOOD - Additive only:**
```sql
-- Add new table
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add new column
ALTER TABLE site_visits 
ADD COLUMN notification_sent BOOLEAN DEFAULT false;

-- RLS policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see own notifications"
  ON notifications
  FOR SELECT
  USING (user_id = auth.uid()::text);
```

**❌ BAD - Breaking change:**
```sql
-- Don't do this in minor version!
ALTER TABLE site_visits DROP COLUMN old_field;
ALTER TABLE site_visits ALTER COLUMN status TYPE VARCHAR(50);
```

**3. Implement Feature**

**Backend:**
```typescript
// Add new API endpoint
app.get('/api/notifications', async (req, res) => {
  // Implementation
});
```

**Frontend (Web + Mobile):**
```typescript
// Add notification feature
// Works on both web and mobile identically
```

**4. Test Both Platforms**

```bash
# Test web
npm run dev
# Test all features

# Test mobile
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
# Test all features
```

**5. Deploy**

**Web:**
```bash
git add .
git commit -m "feat: Add push notifications system"
git push origin main
```

**Mobile:**
```bash
# Build release APK
cd android && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../PACT-Workflow-v1.1.0.apk
```

**6. Update Database**

```sql
-- Web version
UPDATE app_versions 
SET current_version = '1.1.0',
    latest_version = '1.1.0',
    changelog = 'Added push notifications and improved performance',
    updated_at = NOW()
WHERE platform = 'web';

-- Mobile version
UPDATE app_versions 
SET current_version = '1.1.0',
    latest_version = '1.1.0',
    minimum_supported = '1.0.0',  -- Old versions still work
    changelog = 'New Features:
- Push notifications
- Improved offline sync
- Performance improvements',
    download_url = 'https://example.com/PACT-Workflow-v1.1.0.apk',
    updated_at = NOW()
WHERE platform = 'mobile';
```

**Result:**
- ✅ Web v1.1.0 deployed
- ✅ Mobile v1.1.0 available
- ✅ Mobile v1.0.x still works
- ✅ New feature available on both platforms
- ✅ Backward compatible

---

## ⚠️ Scenario 4: Breaking Change (Major Version)

**Use when:** Removing features, changing data structure, or incompatible changes

### Step-by-Step:

**1. Plan Migration**

```markdown
Migration Plan v2.0.0:

Breaking Changes:
- Remove old coordinator_id field (replaced with assigned_to)
- Change status values ('in_progress' replaces 'pending')
- Remove deprecated API endpoints

Migration Path:
1. v1.9.0 - Add new fields alongside old (grace period)
2. Wait 3 months - Monitor adoption
3. v2.0.0 - Remove old fields

Minimum Supported: v1.9.0
```

**2. Grace Period Release (v1.9.0)**

```sql
-- Add new fields alongside old
ALTER TABLE site_visits 
ADD COLUMN assigned_to VARCHAR,
ADD COLUMN new_status VARCHAR;

-- Populate new fields from old
UPDATE site_visits 
SET assigned_to = coordinator_id,
    new_status = CASE 
      WHEN status = 'pending' THEN 'in_progress'
      ELSE status 
    END;

-- Mark old fields as deprecated (in code comments)
COMMENT ON COLUMN site_visits.coordinator_id IS 
  'DEPRECATED: Use assigned_to. Will be removed in v2.0.0';
```

**Code supports both:**
```typescript
interface SiteVisit {
  id: string;
  coordinator_id?: string;  // Deprecated, keep for v1.x
  assigned_to: string;      // Use this
  status: 'pending' | 'in_progress' | 'approved';
  new_status?: string;      // Will replace status
}

// Helper for backward compat
function normalizeSiteVisit(raw: any): SiteVisit {
  return {
    ...raw,
    assigned_to: raw.assigned_to || raw.coordinator_id,
    status: raw.new_status || raw.status,
  };
}
```

**3. Monitor Adoption (3 months)**

```sql
-- Track version usage
SELECT 
  version,
  COUNT(*) as user_count,
  MAX(last_active) as latest_activity
FROM user_sessions
GROUP BY version
ORDER BY version DESC;

-- Ensure >95% on v1.9.0+
```

**4. Breaking Change Release (v2.0.0)**

**Update versions:**
```bash
npm version major  # 1.9.0 → 2.0.0
```

**`android/app/build.gradle`:**
```gradle
defaultConfig {
    versionCode 20       // Big jump
    versionName "2.0.0"
}
```

**Remove old fields:**
```sql
ALTER TABLE site_visits 
DROP COLUMN coordinator_id,
DROP COLUMN status;

ALTER TABLE site_visits 
RENAME COLUMN assigned_to TO assigned_to;

ALTER TABLE site_visits 
RENAME COLUMN new_status TO status;
```

**Update types:**
```typescript
interface SiteVisit {
  id: string;
  assigned_to: string;  // Only new field
  status: 'in_progress' | 'approved' | 'completed';
}
```

**5. Force Update**

```sql
UPDATE app_versions 
SET current_version = '2.0.0',
    latest_version = '2.0.0',
    minimum_supported = '1.9.0',  -- Force update from v1.8 and below
    changelog = 'MAJOR UPDATE - Breaking Changes:
- New assignment system
- Updated status workflow
- Performance improvements

⚠️ Users on v1.8 or below must update',
    force_update = true,  -- Show update required dialog
    download_url = 'https://example.com/PACT-Workflow-v2.0.0.apk',
    updated_at = NOW()
WHERE platform = 'mobile';
```

**6. Deploy**

```bash
# Deploy web
git add .
git commit -m "BREAKING: Release v2.0.0 with new assignment system"
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin main --tags

# Build mobile
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../PACT-Workflow-v2.0.0.apk
```

**7. Communicate**

```markdown
Email to users:

Subject: PACT Workflow v2.0.0 - Update Required

We're excited to announce PACT Workflow v2.0.0!

What's New:
- Improved assignment system
- Streamlined status workflow
- 50% faster performance

⚠️ Action Required:
Please update to v2.0.0 by [date]. Versions 1.8 and below will stop working after this date.

Download: [link]
```

**Result:**
- ✅ v2.0.0 deployed
- ✅ Old versions (1.8 and below) show "Update Required"
- ✅ v1.9.0 continues to work during transition
- ✅ Clean codebase without legacy fields

---

## 🔍 Version Check Reference

### Comparison Logic

```typescript
// Version 1.0.0 vs 1.0.1
compareVersions('1.0.0', '1.0.1')  // -1 (1.0.0 is older)
compareVersions('1.0.1', '1.0.0')  // 1  (1.0.1 is newer)
compareVersions('1.0.0', '1.0.0')  // 0  (same)

// Examples
compareVersions('1.0.0', '1.1.0')  // -1 (update available)
compareVersions('1.9.0', '2.0.0')  // -1 (major update)
compareVersions('2.0.0', '1.9.0')  // 1  (already on latest)
```

### Update Dialog Logic

```typescript
const current = '1.0.0';
const minimum = '1.0.0';
const latest = '1.1.0';

// Update available (optional)
if (compareVersions(current, latest) < 0 && 
    compareVersions(current, minimum) >= 0) {
  showUpdateDialog({ required: false });
}

// Update required (forced)
if (compareVersions(current, minimum) < 0) {
  showUpdateDialog({ required: true });
}

// Up to date
if (compareVersions(current, latest) === 0) {
  // No dialog
}
```

---

## 📊 Version Matrix Example

### Timeline

| Date | Web Version | Mobile Version | Min Supported | Notes |
|------|-------------|----------------|---------------|-------|
| Jan 1 | 1.0.0 | 1.0.0 | 1.0.0 | Initial release |
| Jan 15 | 1.0.1 | 1.0.0 | 1.0.0 | Web bug fix |
| Feb 1 | 1.0.1 | 1.0.1 | 1.0.0 | Mobile bug fix |
| Mar 1 | 1.1.0 | 1.1.0 | 1.0.0 | New feature |
| Apr 1 | 1.1.1 | 1.1.0 | 1.0.0 | Web hotfix |
| Jun 1 | 1.9.0 | 1.9.0 | 1.0.0 | Grace period |
| Sep 1 | 2.0.0 | 2.0.0 | 1.9.0 | Breaking change |

---

## ✅ Pre-Deployment Checklist

Before any version update:

```
☐ Version numbers updated (package.json, build.gradle)
☐ CHANGELOG.md updated
☐ Database migrations tested
☐ Backward compatibility verified
☐ Old APK tested with new web code
☐ New APK tested with new web code
☐ All tests passing
☐ app_versions table updated
☐ Release notes written
☐ Team notified
```

---

## 🚨 Emergency Rollback

If critical issue found after deployment:

**Web Rollback:**
```bash
git revert HEAD
git push origin main
```

**Mobile Rollback:**
```sql
-- Point to previous version
UPDATE app_versions 
SET latest_version = '1.0.0',
    download_url = 'https://example.com/PACT-Workflow-v1.0.0.apk',
    updated_at = NOW()
WHERE platform = 'mobile';
```

**Database Rollback:**
```bash
# Restore from backup
psql $DATABASE_URL < backup.sql
```

---

**Last Updated:** November 24, 2025  
**PACT Workflow Platform**
