# Offline Support for Data Collectors

This guide explains how to ensure all data collector pages work offline.

## Overview

Data collectors need to work in areas with poor or no internet connectivity. The application uses a combination of:
- **Service Worker** - Caches static assets and API responses
- **IndexedDB** - Stores offline data for reading and writing
- **Background Sync** - Automatically syncs data when connection is restored

## Data Collector Pages

The following pages must work offline:

1. **Dashboard** (`/dashboard`)
2. **MMP Management** (`/mmp`) - Claimable Sites, My Sites tabs
3. **Site Visit Details** (`/site-visits/:id`)
4. **Wallet** (`/wallet`)
5. **Cost Submission** (`/cost-submission`)
6. **Settings** (`/settings`)

## Offline Architecture

### 1. Service Worker Caching

The service worker (`public/service-worker.js`) caches:

#### Static Assets
- HTML, CSS, JavaScript bundles
- Images, fonts, icons
- Manifest and offline page

#### API Endpoints (Network-First Strategy)
- `/rest/v1/mmp_site_entries` - Site entries for MMP pages
- `/rest/v1/profiles` - User profiles
- `/rest/v1/projects` - Projects
- `/rest/v1/mmps` - MMP files
- `/rest/v1/wallets` - Wallet data
- `/rest/v1/cost_submissions` - Cost submissions
- `/rest/v1/notifications` - Notifications
- `/rest/v1/states` - States
- `/rest/v1/localities` - Localities
- `/rest/v1/master_sites` - Master sites
- `/rest/v1/classifications` - Classifications

### 2. IndexedDB Storage

The offline database (`src/lib/offline-db.ts`) stores:

#### Read-Only Cached Data
- **MMPs** - Cached for 2 hours
- **Budgets** - Cached for 1 hour
- **Wallets** - Cached for 30 minutes
- **Notifications** - Cached for 24 hours
- **Chat Messages** - Cached for 48 hours
- **Projects** - Cached for 2 hours

#### Offline Writes (Synced Later)
- **Site Visits** - Started/completed visits
- **Locations** - GPS coordinates
- **Pending Actions** - Claims, completions, submissions

### 3. Sync Manager

The sync manager (`src/lib/sync-manager.ts`) handles:
- Automatic sync when connection is restored
- Retry logic with exponential backoff
- Conflict resolution
- Progress tracking

## Implementation Checklist

### ✅ Already Implemented

- [x] Service worker registration
- [x] Static asset caching
- [x] API endpoint caching (network-first)
- [x] IndexedDB for offline storage
- [x] Background sync for mutations
- [x] Offline site visit tracking
- [x] Location tracking offline
- [x] Cost submission queuing
- [x] Sync status indicators

### 🔧 Required Enhancements

1. **Pre-cache Critical Data on Login**
   - When a data collector logs in, pre-fetch and cache:
     - Their assigned MMP sites
     - Their wallet data
     - Recent notifications
     - Available projects

2. **Offline-First Data Fetching**
   - Update page components to:
     - Check IndexedDB first
     - Fall back to network
     - Update cache after network fetch

3. **Enhanced Error Handling**
   - Show clear offline indicators
   - Display cached data timestamps
   - Provide manual sync triggers

4. **Storage Management**
   - Implement cache size limits
   - Clean up old cached data
   - Warn when storage is full

## Usage for Data Collectors

### Before Going Offline

1. **Login while online** - This ensures initial data is cached
2. **Navigate to key pages** - Visit dashboard, MMP, wallet to cache data
3. **Check sync status** - Ensure no pending syncs before going offline

### While Offline

1. **All pages remain accessible** - Cached versions load automatically
2. **Data can be viewed** - All cached data is available
3. **Actions are queued** - Site visits, submissions are saved locally
4. **Offline indicator shows** - Red WiFi icon in header

### When Connection Returns

1. **Automatic sync** - Data syncs in the background
2. **Sync indicator** - Shows progress in header
3. **Notifications** - Alerts when sync completes
4. **Manual sync** - Tap sync button to force immediate sync

## API Endpoints Used by Data Collectors

### Dashboard
- `GET /rest/v1/mmp_site_entries` - Site entries
- `GET /rest/v1/profiles` - User profile
- `GET /rest/v1/wallets` - Wallet balance

### MMP Page
- `GET /rest/v1/mmp_site_entries` - Claimable/assigned sites
- `GET /rest/v1/mmps` - MMP files
- `POST /rest/v1/mmp_site_entries` - Claim site (queued offline)
- `PATCH /rest/v1/mmp_site_entries` - Update site (queued offline)

### Site Visit Details
- `GET /rest/v1/mmp_site_entries/:id` - Site details
- `PATCH /rest/v1/mmp_site_entries/:id` - Start/complete visit (queued offline)
- `POST /rest/v1/storage/site-visit-photos` - Upload photos (queued offline)

### Wallet
- `GET /rest/v1/wallets` - Wallet data
- `GET /rest/v1/wallet_transactions` - Transaction history
- `POST /rest/v1/withdrawal_requests` - Request withdrawal (queued offline)

### Cost Submission
- `GET /rest/v1/cost_submissions` - Submission history
- `GET /rest/v1/site_visits` - Available site visits
- `POST /rest/v1/cost_submissions` - Submit cost (queued offline)

### Settings
- `GET /rest/v1/profiles/:id` - User profile
- `PATCH /rest/v1/profiles/:id` - Update profile (queued offline)

## Testing Offline Functionality

### 1. Chrome DevTools

1. Open DevTools (F12)
2. Go to **Application** tab
3. **Service Workers** - Check registration status
4. **Cache Storage** - View cached assets
5. **IndexedDB** - View offline data
6. **Network** tab - Check "Offline" to simulate offline mode

### 2. Test Scenarios

#### Scenario 1: View Cached Data
1. Load dashboard while online
2. Go offline (DevTools > Network > Offline)
3. Refresh page
4. ✅ Dashboard should load from cache

#### Scenario 2: Create Offline Action
1. Go offline
2. Claim a site or complete a visit
3. ✅ Action should be queued
4. Go online
5. ✅ Action should sync automatically

#### Scenario 3: View Offline Wallet
1. Load wallet page while online
2. Go offline
3. Navigate to wallet
4. ✅ Wallet data should show from cache

## Troubleshooting

### Pages Not Loading Offline

1. **Check service worker registration**
   - DevTools > Application > Service Workers
   - Should show "activated and running"

2. **Check cache**
   - DevTools > Application > Cache Storage
   - Should contain cached assets

3. **Clear and re-register**
   - Unregister service worker
   - Reload page
   - Service worker should re-register

### Data Not Syncing

1. **Check sync status**
   - Look for sync indicator in header
   - Check pending count badge

2. **Check network**
   - Ensure device is online
   - Check connection quality

3. **Manual sync**
   - Tap sync button in header
   - Check console for errors

### Storage Full

1. **Check storage usage**
   - DevTools > Application > Storage
   - Check IndexedDB size

2. **Clear old data**
   - Settings > Clear Cache
   - Or wait for automatic cleanup (24 hours)

## Best Practices

1. **Pre-cache on login** - Always login while online first
2. **Regular syncs** - Sync before going offline
3. **Monitor storage** - Keep an eye on storage usage
4. **Test offline** - Test offline functionality regularly
5. **Report issues** - Report any offline sync failures

## Technical Details

### Cache Strategy

- **Static Assets**: Cache-first (fastest)
- **API GET Requests**: Network-first with cache fallback
- **API POST/PATCH/DELETE**: Network-only, queued when offline

### Sync Priority

1. Site visits (highest priority)
2. Locations
3. Pending actions (claims, submissions)

### Conflict Resolution

- **Last-write-wins** - Most recent update takes precedence
- **Deduplication** - Prevents duplicate syncs
- **Status checks** - Skips sync if server already has terminal state

## Future Enhancements

- [ ] Offline photo compression
- [ ] Incremental sync (only changed data)
- [ ] Offline map tiles
- [ ] Background photo upload
- [ ] Offline analytics
- [ ] Multi-device sync

