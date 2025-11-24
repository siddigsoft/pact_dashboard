# 🚀 PACT Workflow - Deployment Checklist

**Ensuring Web-Mobile Compatibility Across Updates**

---

## 📋 Pre-Deployment Checklist

### 1. Code Changes Review

**Database Schema Changes:**
```
☐ Are all schema changes ADDITIVE only? (new columns, not removed)
  - ✅ ALTER TABLE ... ADD COLUMN ... (safe)
  - ❌ ALTER TABLE ... DROP COLUMN ... (breaks old APKs)
  - ❌ ALTER TABLE ... ALTER COLUMN ... TYPE (breaks old APKs)

☐ Have you tested migrations on staging database?

☐ Are RLS policies updated for new tables/columns?

☐ Have you added indexes for new columns (if needed)?

☐ Is there a rollback plan if migration fails?
```

**API Changes:**
```
☐ Are new API endpoints backward compatible?

☐ Do existing endpoints maintain the same response structure?

☐ Are new fields marked as optional in TypeScript types?

☐ Have you added API version headers (if breaking changes)?

☐ Is error handling consistent with existing patterns?
```

**Frontend Changes:**
```
☐ Do components gracefully handle missing data (for old APKs)?

☐ Are new features guarded with version checks (if needed)?

☐ Is TypeScript compilation passing? (npm run build)

☐ Are there any console errors in browser DevTools?

☐ Is the bundle size reasonable? (<2MB gzipped)
```

---

### 2. Version Management

**Update Version Numbers:**
```
☐ package.json version updated?
  Current: ________
  New:     ________

☐ android/app/build.gradle versionCode incremented?
  Current: ________
  New:     ________

☐ android/app/build.gradle versionName updated?
  Current: ________
  New:     ________

☐ CHANGELOG.md updated with changes?

☐ replit.md updated with recent changes?
```

**Version Bump Rules:**
```
Patch (1.0.0 → 1.0.1):  Bug fixes, no new features
Minor (1.0.1 → 1.1.0):  New features, backward compatible
Major (1.1.0 → 2.0.0):  Breaking changes, not backward compatible
```

---

### 3. Testing

**Unit & Integration Tests:**
```
☐ All existing tests passing? (npm test)

☐ New tests written for new features?

☐ Critical user flows tested?
  - Login/Logout
  - Create MMP
  - Create Site Visit
  - Submit Cost
  - Approve workflows
```

**Cross-Platform Testing:**
```
☐ Tested on web app (latest code)?

☐ Tested on current mobile APK (before new build)?

☐ Tested offline mode (mobile only)?

☐ Tested real-time sync between web and mobile?

☐ Tested with different user roles?
  - Admin
  - Field Operation Manager
  - Coordinator
  - Data Collector
  - Supervisor
```

**Browser/Device Testing:**
```
☐ Chrome (latest)
☐ Firefox (latest)
☐ Safari (latest)
☐ Mobile Chrome
☐ Mobile Safari
☐ Android device (physical)
☐ iOS device (if applicable)
```

---

### 4. Database Preparation

**Before Migration:**
```
☐ Backup production database
  Command: pg_dump database_name > backup_$(date +%Y%m%d).sql

☐ Test migration on staging environment

☐ Document rollback SQL (if needed)

☐ Estimate migration time (for large tables)

☐ Plan maintenance window (if downtime needed)
```

**Migration Execution:**
```
☐ Run migrations during low-traffic period

☐ Monitor migration progress

☐ Verify data integrity after migration

☐ Test critical queries after migration

☐ Check RLS policies are working correctly
```

---

### 5. Security Review

**Authentication & Authorization:**
```
☐ Are new endpoints protected by authentication?

☐ Are RLS policies enforced for new tables?

☐ Are user roles checked before sensitive operations?

☐ Are API keys/secrets stored securely?

☐ Is HTTPS enforced? (cleartext: false in capacitor.config.ts)
```

**Data Validation:**
```
☐ Is input validation implemented server-side?

☐ Are SQL injection risks mitigated?

☐ Are XSS risks mitigated?

☐ Are CSRF protections in place?
```

---

## 🚀 Deployment Steps

### Step 1: Pre-Deployment

**1.1 Create Backup**
```bash
# Backup database
pg_dump $DATABASE_URL > backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Tag current version
git tag -a v1.0.0 -m "Release v1.0.0"
git push origin v1.0.0
```

**1.2 Build and Test**
```bash
# Install dependencies
npm install

# Run tests
npm test

# Build production bundle
npm run build

# Verify build
ls -lh dist/
```

---

### Step 2: Database Migration

**2.1 Execute Migration (if needed)**
```bash
# Connect to database
psql $DATABASE_URL

# Run migration SQL
\i migrations/add_app_versions_table.sql

# Verify migration
SELECT * FROM app_versions;

# Exit
\q
```

**2.2 Update App Versions Table**
```sql
-- Update minimum supported version (if needed)
UPDATE app_versions 
SET minimum_supported = '1.0.0',
    latest_version = '1.1.0',
    changelog = 'Bug fixes and performance improvements',
    updated_at = NOW()
WHERE platform = 'mobile';
```

---

### Step 3: Deploy Web App

**3.1 Deploy to Replit**
```bash
# Commit changes
git add .
git commit -m "Release v1.1.0: [Brief description]"

# Push to main branch (auto-deploys on Replit)
git push origin main
```

**3.2 Verify Web Deployment**
```
☐ Visit production URL: https://your-replit-url.replit.app

☐ Check application loads correctly

☐ Test login flow

☐ Test critical features

☐ Check browser console for errors

☐ Verify API responses
```

---

### Step 4: Build Mobile APK (if needed)

**4.1 Sync Capacitor**
```bash
# Sync latest build to Android
npx cap sync android
```

**4.2 Build APK**
```bash
# Navigate to Android directory
cd android

# Build release APK
./gradlew assembleRelease

# Locate APK
ls -lh app/build/outputs/apk/release/

# Copy APK
cp app/build/outputs/apk/release/app-release.apk ../PACT-Workflow-v1.1.0.apk
cd ..
```

**4.3 Test APK**
```bash
# Install on test device
adb install PACT-Workflow-v1.1.0.apk

# Launch and test
adb shell am start -n com.pact.workflow/.MainActivity
```

---

### Step 5: Verify Deployment

**5.1 Smoke Tests**
```
☐ Web app is accessible

☐ Login works on web

☐ Login works on mobile APK

☐ Real-time sync working between web and mobile

☐ Offline mode working on mobile

☐ No console errors

☐ No 500 errors in network tab
```

**5.2 Monitor for Issues**
```
☐ Check error logs for 1 hour after deployment

☐ Monitor user feedback channels

☐ Check database performance metrics

☐ Verify no spike in error rates
```

---

## 🔄 Post-Deployment

### Update Documentation

```
☐ Update CHANGELOG.md with release notes

☐ Update replit.md with recent changes

☐ Update API documentation (if API changed)

☐ Create release notes for users

☐ Update version in app_versions table
```

### Distribute Mobile APK

**If New APK Built:**
```
☐ Upload APK to distribution channel:
  - Google Play Store (for production)
  - Direct download link (for internal testing)
  - Firebase App Distribution (for beta)

☐ Notify users of update via:
  - In-app notification
  - Email announcement
  - Chat message

☐ Monitor adoption rate:
  - Track version usage in analytics
  - Ensure majority upgrade within 2 weeks
```

---

## 🐛 Rollback Plan

### If Critical Issues Found

**Web App Rollback:**
```bash
# Revert to previous commit
git revert HEAD

# Or checkout previous tag
git checkout v1.0.0

# Force push (be careful!)
git push origin main --force

# Or redeploy from previous tag
git checkout tags/v1.0.0 -b rollback-branch
git push origin rollback-branch
```

**Database Rollback:**
```sql
-- Restore from backup
psql $DATABASE_URL < backups/backup_20251124_120000.sql

-- Or manually revert changes
ALTER TABLE site_visits DROP COLUMN new_column;
```

**Mobile APK:**
```
If new APK is broken:
1. Remove download link immediately
2. Update app_versions table to point to previous version
3. Communicate issue to users
4. Fix and redeploy
```

---

## 📊 Compatibility Testing Matrix

### Before Each Deployment, Verify:

| Test Scenario | Expected Result | Status |
|---------------|-----------------|--------|
| Old web + Old APK | ✅ Works | ☐ |
| New web + Old APK | ✅ Works (backward compat) | ☐ |
| Old web + New APK | ✅ Works | ☐ |
| New web + New APK | ✅ Works perfectly | ☐ |
| Offline mode (mobile) | ✅ Syncs when online | ☐ |
| Real-time sync | ✅ <1 second latency | ☐ |

---

## 📝 Quick Reference Commands

### Development
```bash
# Start dev server
npm run dev

# Run tests
npm test

# Build production
npm run build

# Sync Capacitor
npx cap sync android
```

### Database
```bash
# Connect to database
psql $DATABASE_URL

# Backup database
pg_dump $DATABASE_URL > backup.sql

# Restore database
psql $DATABASE_URL < backup.sql
```

### Mobile
```bash
# Build debug APK
cd android && ./gradlew assembleDebug

# Build release APK
cd android && ./gradlew assembleRelease

# Install APK
adb install app-release.apk

# View logs
adb logcat | grep com.pact.workflow
```

### Git
```bash
# Create release tag
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0

# List tags
git tag -l

# Checkout tag
git checkout tags/v1.1.0
```

---

## 🎯 Success Criteria

Deployment is successful when:

- ✅ Web app deployed and accessible
- ✅ No critical errors in logs
- ✅ All smoke tests passing
- ✅ Old mobile APK still works with new web app
- ✅ Real-time sync functioning
- ✅ Database migrations completed successfully
- ✅ Users can login and perform core workflows
- ✅ No spike in error rates compared to pre-deployment

---

## 📞 Emergency Contacts

**If Critical Issue During Deployment:**

1. **Database Issues**: Rollback database immediately
2. **Web App Down**: Revert to previous version
3. **Mobile APK Broken**: Remove download link, communicate to users
4. **Widespread Errors**: Enable maintenance mode, investigate

**Escalation Path:**
1. Check logs and error reports
2. Attempt rollback
3. Notify team lead
4. Create incident report
5. Schedule post-mortem

---

**Template Version:** 1.0.0  
**Last Updated:** November 24, 2025  
**PACT Workflow Platform**
