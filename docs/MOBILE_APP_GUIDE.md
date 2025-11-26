# PACT Workflow Platform
## Mobile Application Guide

Complete guide for using PACT on iOS and Android devices.

---

# Table of Contents

1. [Getting Started](#1-getting-started)
2. [App Navigation](#2-app-navigation)
3. [Site Visit Workflow](#3-site-visit-workflow)
4. [GPS and Location Features](#4-gps-and-location-features)
5. [Camera and Photo Capture](#5-camera-and-photo-capture)
6. [Offline Mode](#6-offline-mode)
7. [Notifications](#7-notifications)
8. [Troubleshooting](#8-troubleshooting)

---

# 1. Getting Started

## 1.1 Installation

### iOS (iPhone/iPad)

1. Open the **App Store**
2. Search for "PACT Workflow"
3. Tap **"Get"** to download
4. Wait for installation to complete
5. Tap **"Open"** to launch

### Android

1. Open **Google Play Store**
2. Search for "PACT Workflow"
3. Tap **"Install"**
4. Wait for installation to complete
5. Tap **"Open"** to launch

## 1.2 First Launch Setup

When you first open the app:

1. **Welcome Screen**: Tap "Get Started"
2. **Permissions**: Grant required permissions (see below)
3. **Login**: Enter your email and password
4. **Profile Sync**: Wait for data to download
5. **Ready**: You're set to use the app!

## 1.3 Required Permissions

The app needs these permissions to work properly:

| Permission | Why It's Needed | Required? |
|------------|-----------------|-----------|
| **Location** | GPS capture for site visits | Yes |
| **Camera** | Photo documentation | Yes |
| **Notifications** | Assignment alerts | Recommended |
| **Storage** | Offline data storage | Yes |

### Granting Permissions

When prompted, tap **"Allow"** for each permission. If you accidentally deny a permission:

**iOS:**
1. Go to Settings > PACT
2. Enable the required permission

**Android:**
1. Go to Settings > Apps > PACT
2. Tap Permissions
3. Enable the required permission

---

# 2. App Navigation

## 2.1 Bottom Navigation Bar

The main navigation bar has 5 tabs:

| Icon | Tab | Purpose |
|------|-----|---------|
| Home icon | **Home** | Dashboard and quick actions |
| Map icon | **Map** | Location view of sites |
| List icon | **Visits** | Your site visit assignments |
| Message icon | **Messages** | Team communication |
| Person icon | **Profile** | Settings and account |

## 2.2 Home Dashboard

Your home screen shows:

- **Welcome Message**: Your name and role
- **Today's Visits**: Visits scheduled for today
- **Quick Actions**: Start Visit, Check In buttons
- **Notifications**: Recent alerts
- **Status**: Online/offline indicator

## 2.3 Quick Actions

### Start Visit Button
Large button at bottom of screen to begin a site visit.

### Pull to Refresh
Pull down on any list to refresh data.

### Swipe Actions
Swipe left/right on items for quick actions.

---

# 3. Site Visit Workflow

## 3.1 Viewing Your Assignments

1. Tap the **Visits** tab
2. See your assigned site visits
3. Use filters at top:
   - All / Today / Upcoming
   - Status filter (Pending, In Progress, etc.)
4. Tap any visit to see details

## 3.2 Starting a Site Visit

1. Find your assigned visit
2. Tap to open details
3. Tap **"Start Visit"** button
4. The app will:
   - Capture your GPS location
   - Record start time
   - Open data entry form

## 3.3 During the Visit

### Capturing Data

1. Fill in required fields
2. Take photos when prompted
3. GPS location auto-captured
4. Add notes as needed

### Adding Site Entries

For sites with multiple data points:

1. Complete first entry
2. Tap **"Add Entry"**
3. Repeat data capture
4. Continue until done

### Taking Photos

1. Tap the camera icon
2. Point at subject
3. Tap capture button
4. Review photo
5. Tap **"Use Photo"** or retake

## 3.4 Completing a Visit

1. Ensure all required fields filled
2. Tap **"Complete Visit"**
3. Review summary
4. Confirm completion
5. Data syncs automatically

---

# 4. GPS and Location Features

## 4.1 Location Accuracy

The app shows GPS accuracy:

| Indicator | Accuracy | Status |
|-----------|----------|--------|
| Green | Less than 10m | Excellent |
| Yellow | 10-30m | Good |
| Orange | 30-100m | Fair |
| Red | Over 100m | Poor |

## 4.2 Improving GPS Accuracy

For better location accuracy:

1. Go outdoors or near windows
2. Wait 10-15 seconds for GPS lock
3. Move away from tall buildings
4. Ensure clear sky view
5. Keep phone still during capture

## 4.3 Location Sharing

When enabled:

1. Your location is visible to supervisors
2. Updates every few minutes
3. Only shared during work hours
4. Can be disabled in settings

### Enabling/Disabling Location Sharing

1. Go to **Profile** > **Settings**
2. Find **Location Sharing**
3. Toggle on/off
4. Set sharing schedule

## 4.4 Viewing Team Locations

If you have permission:

1. Tap **Map** tab
2. See team member markers
3. Tap any marker for details
4. Profile photos show status rings

---

# 5. Camera and Photo Capture

## 5.1 Photo Requirements

Photos should be:
- Clear and in focus
- Well-lit (avoid shadows)
- Properly framed
- Relevant to the visit

## 5.2 Taking Photos

1. Tap camera icon in form
2. Position camera
3. Hold steady
4. Tap capture button
5. Review and confirm

## 5.3 Photo Features

| Feature | How to Use |
|---------|------------|
| Flash | Auto/On/Off toggle |
| Focus | Tap screen to focus |
| Zoom | Pinch to zoom |
| Switch Camera | Tap switch icon |

## 5.4 Managing Photos

After capture:
- **Use Photo**: Accept and attach
- **Retake**: Take a new photo
- **Delete**: Remove attached photo

---

# 6. Offline Mode

## 6.1 Understanding Offline Mode

When you lose internet connection:

- App continues to work
- Data saved locally
- Actions queued for sync
- Offline indicator shown

## 6.2 What Works Offline

| Feature | Offline Support |
|---------|-----------------|
| View assignments | Yes (cached) |
| Start visits | Yes |
| Capture GPS | Yes |
| Take photos | Yes |
| Complete visits | Yes (queued) |
| View messages | Yes (cached) |
| Send messages | Queued |

## 6.3 Syncing When Online

When connection restored:

1. App detects connection
2. Queued data uploads
3. New data downloads
4. Sync complete notification

### Manual Sync

1. Pull down on any screen
2. Or go to **Profile** > **Sync Now**

## 6.4 Offline Status Banner

When offline, you'll see:
- Yellow banner at top
- "Offline - Data will sync when connected"
- Pending items count

---

# 7. Notifications

## 7.1 Notification Types

| Type | Description |
|------|-------------|
| **Assignment** | New site visit assigned |
| **Reminder** | Upcoming visit reminder |
| **Approval** | Cost/payment updates |
| **Message** | New chat message |
| **Alert** | System announcements |

## 7.2 Managing Notifications

### Enable/Disable Notifications

1. Go to **Profile** > **Settings**
2. Tap **Notifications**
3. Toggle each type on/off
4. Save changes

### Notification Settings by Type

- **Assignments**: Recommended ON
- **Reminders**: Recommended ON
- **Messages**: Optional
- **System**: Recommended ON

## 7.3 Acting on Notifications

When you receive a notification:

1. Tap to open the app
2. View notification details
3. Take required action
4. Notification marked as read

---

# 8. Troubleshooting

## 8.1 App Won't Open

1. Force close the app
2. Restart your device
3. Check for app updates
4. Reinstall if needed

### Force Close

**iOS:**
- Swipe up from bottom, pause
- Swipe app card up to close

**Android:**
- Tap recent apps button
- Swipe app away

## 8.2 Login Problems

1. Check email spelling
2. Verify password
3. Check internet connection
4. Try "Forgot Password"
5. Contact administrator

## 8.3 GPS Not Working

1. Check location permission
2. Enable device GPS/Location
3. Go outdoors
4. Wait for GPS lock
5. Restart app

## 8.4 Camera Issues

1. Check camera permission
2. Close other camera apps
3. Restart the app
4. Clean camera lens
5. Check storage space

## 8.5 Photos Not Uploading

1. Check internet connection
2. Check storage space
3. Reduce photo size
4. Try manual sync
5. Contact support

## 8.6 Data Not Syncing

1. Check internet connection
2. Pull down to refresh
3. Try manual sync
4. Log out and back in
5. Check for updates

## 8.7 App Running Slow

1. Close other apps
2. Clear app cache
3. Check storage space
4. Update the app
5. Restart device

### Clearing Cache

**iOS:**
- Offload and reinstall app
- Or: Settings > PACT > Clear Cache

**Android:**
- Settings > Apps > PACT
- Storage > Clear Cache

## 8.8 Battery Drain

Location services use battery. To conserve:

1. Disable location sharing when not needed
2. Use "Only during visits" option
3. Lower screen brightness
4. Close app when not using
5. Disable background refresh

---

# Quick Reference

## Gesture Guide

| Gesture | Action |
|---------|--------|
| Tap | Select item |
| Long press | Show options |
| Swipe left | Quick actions |
| Swipe right | Quick actions |
| Pull down | Refresh |
| Pinch | Zoom (maps/photos) |

## Status Icons

| Icon | Meaning |
|------|---------|
| Green dot | Online |
| Orange dot | Active |
| Gray dot | Offline |
| Cloud with check | Synced |
| Cloud with arrow | Syncing |
| Cloud with X | Sync failed |

## Getting Help

- **In-app**: Profile > Help
- **Email**: support@pact-platform.com
- **Phone**: Check with your administrator

---

**Document Version**: 1.0  
**Last Updated**: November 2024  
**PACT Mobile Application**
