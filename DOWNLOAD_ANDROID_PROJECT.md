# 📱 How to Download and Build Your Android APK

**Status:** ✅ Android project built successfully in Replit!
**Location:** `android/` folder contains your complete Android project

---

## 🎯 What Just Happened

We successfully ran:
```bash
npm run build           # Built optimized web assets (248 KB main bundle)
npx cap sync android    # Copied assets to Android project
```

**Result:** Your `android/` folder now contains a complete Android Studio project with:
- ✅ Your React app compiled and ready
- ✅ Capacitor native plugins configured
- ✅ All app resources (icons, splash screen, manifest)
- ✅ Gradle build configuration

---

## 📥 Next Step: Download the Android Project

### Option A: Download Entire Repository (Recommended)

**Using Git (if you have Git on Windows):**
```bash
# On your Windows machine:
git clone <your-replit-git-url>
cd pact_dashboard
```

**Using Replit Download:**
1. In Replit, click the three dots (⋮) next to your project name
2. Select "Download as zip"
3. Extract the zip file on your Windows machine

---

### Option B: Download Only Android Folder

**Using Replit Shell:**
1. In Replit terminal, run:
   ```bash
   zip -r android.zip android/
   ```
2. Download `android.zip` from the Files panel
3. Extract on your Windows machine

---

## 🛠️ Install Required Software on Windows

Before you can build the APK, install these tools:

### 1. Upgrade Node.js (REQUIRED)

**Current:** Your Windows has Node.js v20.10.0 (too old)
**Required:** Node.js v20.17.0+ or v22+

**Install:**
1. Download from: https://nodejs.org/
2. Choose "LTS" version (currently v22.x)
3. Run the installer
4. Restart your terminal
5. Verify: `node --version` (should show v20.17+ or v22+)

---

### 2. Install Android Studio (REQUIRED)

**Download:** https://developer.android.com/studio

**Installation Steps:**
1. Run the installer (will take 10-15 minutes)
2. During setup, make sure these are checked:
   - ✅ Android SDK
   - ✅ Android SDK Platform
   - ✅ Android Virtual Device (for testing)
   - ✅ Android SDK Build-Tools

**Important:** Android Studio includes JDK 17, so you don't need to install Java separately!

---

### 3. Configure Android SDK

After Android Studio installs:

1. Open Android Studio
2. Go to: **Settings** → **Appearance & Behavior** → **System Settings** → **Android SDK**
3. Install these SDK versions:
   - ✅ Android 13 (API 33) - Recommended
   - ✅ Android 14 (API 34) - Latest

4. Go to **SDK Tools** tab and install:
   - ✅ Android SDK Build-Tools
   - ✅ Android SDK Command-line Tools
   - ✅ Android Emulator (for testing)

---

## 🏗️ Build the APK in Android Studio

Once you have Android Studio installed and the project downloaded:

### Step 1: Open Project
1. Open Android Studio
2. Click "Open"
3. Navigate to your downloaded `pact_dashboard/android/` folder
4. Click "OK"

**First-time setup:**
- Android Studio will sync Gradle (takes 2-5 minutes)
- Wait for "Gradle sync finished" message
- If prompted to update Gradle, click "Don't remind me again"

### Step 2: Build APK
1. In Android Studio, go to: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Wait for build to complete (2-5 minutes first time)
3. Click "Locate" when the notification appears
4. Your APK is at: `android/app/build/outputs/apk/debug/app-debug.apk`

### Step 3: Test APK
**Option 1 - Real Device:**
- Enable Developer Options on your Android phone
- Enable USB Debugging
- Connect phone to computer
- Click "Run" (green play button) in Android Studio

**Option 2 - Emulator:**
- Click "Device Manager" in Android Studio
- Create a new virtual device
- Click "Run" to test on emulator

---

## 📦 Build Signed APK for Distribution

For distributing to your field team:

### Step 1: Generate Signing Key
1. In Android Studio: **Build** → **Generate Signed Bundle / APK**
2. Select "APK" → Click "Next"
3. Click "Create new..." to create a keystore
4. Fill in the details:
   - **Key store path:** Choose where to save (e.g., `pact-keystore.jks`)
   - **Password:** Create a strong password (SAVE THIS!)
   - **Alias:** `pact-key`
   - **Validity:** 25 years
   - **Certificate info:** Your organization details
5. Click "OK"

**CRITICAL:** Save the keystore file and passwords! You need them for all future updates.

### Step 2: Build Signed APK
1. After creating keystore, click "Next"
2. Select "release" build variant
3. Check "V1 (Jar Signature)" and "V2 (Full APK Signature)"
4. Click "Finish"

Your signed APK will be at:
```
android/app/build/outputs/apk/release/app-release.apk
```

This is the file you distribute to users!

---

## 📲 Distribute to Field Team

### Method 1: Direct Install
1. Copy `app-release.apk` to Android device
2. Open file on device
3. Allow "Install from unknown sources" if prompted
4. Install the app

### Method 2: Cloud Distribution
Upload APK to:
- Google Drive / Dropbox
- Your internal file server
- Firebase App Distribution (free)
- TestFlight alternative for Android

Share the download link with your team.

---

## 🔄 Update Workflow (For Future Updates)

When you make changes to your app:

### In Replit:
```bash
# 1. Update version number
# Edit package.json: "version": "1.0.1"
# Edit capacitor.config.ts: version: "1.0.1"

# 2. Build and sync
npm run build
npx cap sync android

# 3. Update app_versions table in Supabase
# INSERT INTO app_versions (version, force_update, changelog)
# VALUES ('1.0.1', false, 'Bug fixes and improvements');
```

### On Your Windows Machine:
```bash
# 1. Download updated android folder (or git pull)

# 2. Open in Android Studio

# 3. Build → Generate Signed Bundle / APK
# (Use same keystore as before!)

# 4. Distribute new app-release.apk
```

---

## 🐛 Troubleshooting

### "Gradle sync failed"
- Make sure you have internet connection
- Wait a few minutes and try again
- Restart Android Studio

### "SDK not found"
- Open Android Studio settings
- Install Android SDK (API 33 or 34)
- Restart Android Studio

### "Build failed: Could not resolve dependencies"
- Open `android/build.gradle`
- Add at top of `repositories` block:
  ```gradle
  google()
  mavenCentral()
  ```

### APK installs but crashes
- Check that Supabase URL in `capacitor.config.ts` is correct
- Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
- Check Android logs in Android Studio's Logcat

### Version checker not working
- Verify `app_versions` table exists in Supabase
- Insert at least one version record
- Check app can connect to database

---

## 📊 Expected File Sizes

**Debug APK:** ~30-50 MB (includes debug symbols)
**Release APK:** ~15-25 MB (optimized and compressed)

---

## ✅ Success Checklist

Before distributing your APK:

- [ ] APK builds without errors
- [ ] App opens and shows login screen
- [ ] Can login with test account
- [ ] Dashboard loads with data
- [ ] Theme toggle works
- [ ] Bottom navigation works
- [ ] Offline queue activates when offline
- [ ] Version checker shows current version in Settings

---

## 🎯 Quick Start Summary

**On Windows Machine:**
1. ✅ Install Node.js v22+ (https://nodejs.org/)
2. ✅ Install Android Studio (https://developer.android.com/studio)
3. ✅ Download your project from Replit
4. ✅ Open `android/` folder in Android Studio
5. ✅ Build → Build APK
6. ✅ Distribute `app-debug.apk` for testing

**For production:**
7. ✅ Build → Generate Signed Bundle / APK
8. ✅ Create keystore (save it!)
9. ✅ Build release APK
10. ✅ Distribute `app-release.apk` to team

---

## 📞 Need Help?

Refer to:
- `docs/guides/APK_GENERATION_STEP_BY_STEP.md` - Detailed guide
- `docs/guides/DEPLOYMENT_CHECKLIST.md` - Pre-deployment checks
- `docs/architecture/WEB_MOBILE_SYNC_ARCHITECTURE.md` - How sync works

**Common Issues:** Check the Troubleshooting section above first!
