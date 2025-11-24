# 📱 PACT Workflow - Android APK Generation Guide

**Complete Step-by-Step Instructions for Building Your Android App**

---

## 📋 Table of Contents

1. [Prerequisites Installation](#prerequisites-installation)
2. [Prepare Your App for Build](#prepare-your-app-for-build)
3. [Sync Capacitor with Latest Code](#sync-capacitor-with-latest-code)
4. [Build Development APK (Testing)](#build-development-apk-testing)
5. [Build Production APK (Release)](#build-production-apk-release)
6. [Install APK on Android Device](#install-apk-on-android-device)
7. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## 🔧 Prerequisites Installation

### Step 1: Install Java Development Kit (JDK)

**Required:** JDK 11 or higher

**Option A: Install via Terminal (Recommended)**
```bash
# Check if Java is already installed
java -version

# If not installed or version < 11, install JDK 17
# On Ubuntu/Debian:
sudo apt update
sudo apt install openjdk-17-jdk

# On macOS (using Homebrew):
brew install openjdk@17

# Verify installation
java -version
```

**Option B: Download Manually**
1. Visit: https://adoptium.net/
2. Download JDK 17 (LTS)
3. Install and add to PATH

**Set JAVA_HOME Environment Variable:**
```bash
# Add to your ~/.bashrc or ~/.zshrc
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH

# Reload shell configuration
source ~/.bashrc  # or source ~/.zshrc
```

---

### Step 2: Install Android Studio

**Download:**
- Visit: https://developer.android.com/studio
- Download Android Studio (latest version)
- File size: ~1GB

**Installation Steps:**

**Linux:**
```bash
# Extract the downloaded archive
tar -xvf android-studio-*.tar.gz

# Move to /opt (optional but recommended)
sudo mv android-studio /opt/

# Run Android Studio
/opt/android-studio/bin/studio.sh
```

**macOS:**
1. Open the downloaded DMG file
2. Drag Android Studio to Applications folder
3. Launch from Applications

**Windows:**
1. Run the .exe installer
2. Follow installation wizard
3. Launch Android Studio from Start menu

---

### Step 3: Configure Android Studio

**First Launch Setup:**

1. **Welcome Screen**
   - Click "Next" on welcome dialog
   - Choose "Standard" installation type
   - Select UI theme (light/dark)
   - Click "Next"

2. **SDK Components Installation**
   - Android Studio will download:
     - Android SDK
     - Android SDK Platform
     - Android Virtual Device
   - This may take 10-30 minutes
   - Click "Finish" when complete

3. **Set ANDROID_HOME Environment Variable:**
```bash
# Add to ~/.bashrc or ~/.zshrc
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin

# Reload configuration
source ~/.bashrc  # or source ~/.zshrc

# Verify
echo $ANDROID_HOME
```

4. **Install Required SDK Components:**
   - Open Android Studio
   - Click "More Actions" → "SDK Manager"
   - In "SDK Platforms" tab:
     - ✅ Check "Android 13.0 (Tiramisu)" or latest
     - ✅ Check "Android 12.0 (S)"
   - In "SDK Tools" tab:
     - ✅ Android SDK Build-Tools
     - ✅ Android SDK Command-line Tools
     - ✅ Android Emulator
     - ✅ Android SDK Platform-Tools
     - ✅ Google Play services
   - Click "Apply" → "OK"
   - Wait for downloads to complete

---

### Step 4: Install Gradle (Optional - Android Studio includes it)

Gradle is bundled with Android Studio, but you can install it globally:

```bash
# Using SDKMAN (recommended)
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install gradle

# Verify
gradle -v
```

---

## 🚀 Prepare Your App for Build

### Step 1: Build Production Assets

```bash
# Navigate to your project directory
cd /path/to/PACT-Platform-2025

# Install dependencies (if not already done)
npm install

# Build production version of your React app
npm run build
```

**Expected Output:**
```
✓ built in 34.31s
dist/index.html                          2.17 kB
dist/assets/index-*.css                204.76 kB
dist/js/index-*.js                   1,506.78 kB
```

**Verify Build:**
```bash
# Check dist folder was created
ls -lh dist/
```

---

### Step 2: Update App Version

Edit `capacitor.config.ts` to set your app version:

```typescript
// capacitor.config.ts
const config: CapacitorConfig = {
  appId: 'com.pact.workflow',
  appName: 'PACT Workflow',
  webDir: 'dist',
  // ... rest of config
};
```

Edit `package.json` to update version:

```json
{
  "name": "pact-workflow",
  "version": "1.0.0",  // ← Update this
  // ...
}
```

---

## 🔄 Sync Capacitor with Latest Code

### Step 1: Install Capacitor CLI (if not already installed)

```bash
npm install @capacitor/cli @capacitor/core
```

### Step 2: Add Android Platform (First Time Only)

```bash
# Add Android platform (only needed once)
npx cap add android
```

**Expected Output:**
```
✔ Adding native android project in android in 3.50s
✔ Syncing Gradle in 2.35s
✔ add in 5.86s
```

**Verify Android Folder Created:**
```bash
ls -lh android/
```

You should see:
```
android/
  ├── app/
  ├── gradle/
  ├── build.gradle
  └── settings.gradle
```

### Step 3: Sync Latest Build to Android

```bash
# Copy web assets to Android project
npx cap sync android
```

**What This Does:**
1. Copies `dist/` folder to `android/app/src/main/assets/public/`
2. Updates native plugins
3. Syncs Capacitor configuration
4. Updates AndroidManifest.xml

**Expected Output:**
```
✔ Copying web assets from dist to android/app/src/main/assets/public in 234.56ms
✔ Creating capacitor.config.json in android/app/src/main/assets in 1.23ms
✔ copy android in 245.89ms
✔ Updating Android plugins in 12.34ms
✔ update android in 123.45ms
✔ Syncing Gradle in 1.23s
```

### Step 4: Verify Sync Success

```bash
# Check if assets were copied
ls android/app/src/main/assets/public/

# Should show your built files
# index.html, assets/, js/, etc.
```

---

## 📦 Build Development APK (Testing)

### Option 1: Using Android Studio (Recommended for Beginners)

**Step 1: Open Project in Android Studio**

```bash
# Open Android Studio with your project
npx cap open android
```

This will launch Android Studio and open the `android/` folder.

**Step 2: Wait for Gradle Sync**

- Android Studio will automatically start syncing Gradle
- Look at bottom of screen: "Gradle Build Running..."
- This may take 2-10 minutes on first run
- Wait until you see: "Gradle sync finished"

**Step 3: Build APK**

1. Click **Build** menu at top
2. Select **Build Bundle(s) / APK(s)**
3. Select **Build APK(s)**
4. Wait for build process (2-5 minutes)
5. Look for notification: "APK(s) generated successfully"
6. Click **locate** link in notification

**APK Location:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

### Option 2: Using Command Line (Faster)

**Step 1: Navigate to Android Directory**

```bash
cd android
```

**Step 2: Build Debug APK**

```bash
# On Linux/Mac:
./gradlew assembleDebug

# On Windows:
gradlew.bat assembleDebug
```

**Expected Output:**
```
> Task :app:packageDebug
> Task :app:assembleDebug

BUILD SUCCESSFUL in 2m 34s
45 actions executed
```

**Step 3: Locate APK**

```bash
# APK will be created at:
ls -lh app/build/outputs/apk/debug/

# You should see:
# app-debug.apk (approximately 50-80 MB)
```

**Step 4: Copy APK to Easy Location**

```bash
# Copy to project root for easy access
cp app/build/outputs/apk/debug/app-debug.apk ../PACT-Workflow-Debug.apk

# Go back to project root
cd ..

# Verify
ls -lh PACT-Workflow-Debug.apk
```

---

## 🏆 Build Production APK (Release)

### Step 1: Generate Signing Key

**Why?** Android requires all apps to be digitally signed before installation.

**Create Keystore:**

```bash
# Navigate to android/app directory
cd android/app

# Generate keystore (one-time setup)
keytool -genkey -v -keystore pact-release-key.keystore \
  -alias pact-workflow \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

**You'll be asked:**
```
Enter keystore password: [Create strong password - SAVE IT!]
Re-enter new password: [Repeat password]

What is your first and last name?
  [Unknown]:  PACT Team

What is the name of your organizational unit?
  [Unknown]:  Development

What is the name of your organization?
  [Unknown]:  PACT

What is the name of your City or Locality?
  [Unknown]:  [Your City]

What is the name of your State or Province?
  [Unknown]:  [Your State]

What is the two-letter country code for this unit?
  [Unknown]:  US

Is CN=PACT Team, OU=Development, O=PACT, L=City, ST=State, C=US correct?
  [no]:  yes

Enter key password for <pact-workflow>
  (RETURN if same as keystore password): [Press ENTER]
```

**⚠️ CRITICAL: Save These Credentials!**

Create a file `KEYSTORE_CREDENTIALS.txt` (DO NOT commit to git):
```
Keystore Password: [your password]
Key Alias: pact-workflow
Key Password: [same as keystore password]
Keystore Path: android/app/pact-release-key.keystore
```

---

### Step 2: Configure Signing in Gradle

**Create `android/key.properties`:**

```bash
# Create key.properties file
nano android/key.properties
```

**Add these lines:**
```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=pact-workflow
storeFile=app/pact-release-key.keystore
```

**Save and exit** (Ctrl+X, then Y, then Enter)

---

### Step 3: Update `android/app/build.gradle`

**Edit the file:**
```bash
nano android/app/build.gradle
```

**Add BEFORE `android {` block:**

```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

**Inside `android {` block, add `signingConfigs` BEFORE `buildTypes`:**

```gradle
android {
    namespace "com.pact.workflow"
    compileSdkVersion rootProject.ext.compileSdkVersion
    
    // ADD THIS:
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
            }
        }
    }
    
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
            // ADD THIS LINE:
            signingConfig signingConfigs.release
        }
    }
    
    // ... rest of file
}
```

**Save and exit**

---

### Step 4: Build Signed Release APK

**Option A: Using Android Studio**

1. Build → Generate Signed Bundle / APK
2. Select "APK" → Next
3. Choose "Create new..." or select existing keystore
4. Enter keystore details
5. Select "release" build variant
6. Click "Finish"
7. Wait 3-5 minutes
8. APK location: `android/app/build/outputs/apk/release/app-release.apk`

**Option B: Using Command Line**

```bash
# Navigate to android directory
cd android

# Build release APK
./gradlew assembleRelease

# Expected output:
# BUILD SUCCESSFUL in 3m 12s
```

**Locate Release APK:**
```bash
ls -lh app/build/outputs/apk/release/

# You should see:
# app-release.apk (approximately 50-80 MB, smaller than debug)
```

**Copy to Root:**
```bash
cp app/build/outputs/apk/release/app-release.apk ../PACT-Workflow-v1.0.0.apk
cd ..
ls -lh PACT-Workflow-v1.0.0.apk
```

---

## 📲 Install APK on Android Device

### Method 1: USB Connection (Recommended)

**Step 1: Enable Developer Mode on Android Device**

1. Open **Settings** on your phone
2. Scroll to **About Phone**
3. Tap **Build Number** 7 times
4. You'll see: "You are now a developer!"
5. Go back to **Settings** → **Developer Options**
6. Enable **USB Debugging**

**Step 2: Connect Device via USB**

```bash
# Check if device is connected
adb devices

# Expected output:
# List of devices attached
# ABC123XYZ    device
```

If no devices shown:
- Disconnect and reconnect USB cable
- On phone, approve "Allow USB debugging" popup
- Try different USB cable
- Check USB mode is "File Transfer" not "Charging only"

**Step 3: Install APK**

```bash
# Install debug APK
adb install PACT-Workflow-Debug.apk

# Or install release APK
adb install PACT-Workflow-v1.0.0.apk

# Expected output:
# Performing Streamed Install
# Success
```

**Step 4: Launch App**

```bash
# Launch app directly from command line
adb shell am start -n com.pact.workflow/.MainActivity

# Or just tap the app icon on your phone
```

---

### Method 2: Download Directly to Phone

**Step 1: Upload APK to Cloud Storage**

Upload your APK to:
- Google Drive
- Dropbox
- Your own server
- GitHub Release (if project is open source)

**Step 2: Download on Phone**

1. Open browser on Android device
2. Navigate to APK download link
3. Download APK file
4. You'll see: "This type of file can harm your device"
5. Tap **OK** to proceed

**Step 3: Enable Unknown Sources**

1. When you try to install, Android will show:
   "Install blocked - Your phone is not allowed to install unknown apps from this source"
2. Tap **Settings**
3. Enable "Allow from this source"
4. Go back and tap **Install**

**Step 4: Install**

1. Tap **Install**
2. Wait 5-10 seconds
3. Tap **Open** to launch app
4. Or find "PACT Workflow" in app drawer

---

### Method 3: Using Android Emulator (Testing Only)

**Step 1: Create Emulator in Android Studio**

1. In Android Studio, click **Device Manager** (phone icon)
2. Click **Create Device**
3. Select device: "Pixel 6" → Next
4. Select system image: "Tiramisu (API 33)" → Download if needed
5. Click **Next** → **Finish**
6. Click ▶️ (Play) button to start emulator

**Step 2: Install APK on Emulator**

```bash
# Wait for emulator to fully boot (2-3 minutes)
adb devices  # Should show emulator

# Install APK
adb install PACT-Workflow-Debug.apk

# Launch
adb shell am start -n com.pact.workflow/.MainActivity
```

**Or Drag & Drop:**
- Just drag the APK file onto the emulator window
- Android will automatically install it

---

## 🧪 Test Your APK

### Essential Tests Checklist

**✅ App Launch**
- [ ] App icon appears in app drawer
- [ ] App launches without crashes
- [ ] Splash screen displays correctly (blue theme)
- [ ] Login screen appears

**✅ Authentication**
- [ ] Can login with existing credentials
- [ ] Can register new account (if enabled)
- [ ] Error messages display correctly
- [ ] Session persists after closing app

**✅ Navigation**
- [ ] Bottom navigation works (5 tabs)
- [ ] "More" drawer opens and shows all features
- [ ] All screens load correctly
- [ ] Back button works as expected

**✅ Offline Mode**
- [ ] Turn on airplane mode
- [ ] Try to create/update data
- [ ] Turn off airplane mode
- [ ] Data syncs automatically

**✅ Permissions**
- [ ] Location permission requested (for Field Team Map)
- [ ] Camera permission works (for cost submission)
- [ ] File access works (for MMP upload)

**✅ Performance**
- [ ] App is responsive (no lag)
- [ ] Scrolling is smooth
- [ ] Images load properly
- [ ] Maps render correctly

**✅ Network**
- [ ] Can connect to Replit backend
- [ ] Can access Supabase data
- [ ] Real-time updates work (chat, notifications)

---

## 🐛 Troubleshooting Common Issues

### Issue 1: "BUILD FAILED" - Gradle Sync Error

**Error:**
```
Execution failed for task ':app:mergeDebugResources'.
```

**Solution:**
```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

---

### Issue 2: "INSTALL_FAILED_UPDATE_INCOMPATIBLE"

**Error when installing:**
```
adb: failed to install app.apk: Failure [INSTALL_FAILED_UPDATE_INCOMPATIBLE]
```

**Solution:**
```bash
# Uninstall existing version
adb uninstall com.pact.workflow

# Then reinstall
adb install PACT-Workflow-Debug.apk
```

---

### Issue 3: APK Size Too Large (>100MB)

**Problem:** APK is 150MB+

**Solution - Enable ProGuard/R8 (Code Shrinking):**

Edit `android/app/build.gradle`:
```gradle
buildTypes {
    release {
        minifyEnabled true  // Change from false to true
        shrinkResources true  // Add this line
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
}
```

Rebuild:
```bash
cd android
./gradlew assembleRelease
```

---

### Issue 4: App Crashes on Startup

**Check Logs:**
```bash
# View real-time logs
adb logcat | grep -i "pact\|crash\|error"

# Or filter by your app package
adb logcat | grep com.pact.workflow
```

**Common Causes:**
1. **Wrong server URL in capacitor.config.ts**
   - Verify URL is correct Replit domain
2. **Missing permissions in AndroidManifest.xml**
   - Check `android/app/src/main/AndroidManifest.xml`
3. **JavaScript errors**
   - Check browser console in Chrome DevTools

---

### Issue 5: "Cleartext HTTP traffic not permitted"

**Error in logs:**
```
java.net.UnknownServiceException: CLEARTEXT communication not permitted
```

**Solution:**

Edit `android/app/src/main/AndroidManifest.xml`:

```xml
<application
    android:usesCleartextTraffic="false"
    android:networkSecurityConfig="@xml/network_security_config"
    ...>
```

Create `android/app/src/main/res/xml/network_security_config.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
</network-security-config>
```

---

### Issue 6: White Screen After Launch

**Causes:**
1. Assets not synced properly
2. Wrong `webDir` in capacitor.config.ts
3. CORS issues with backend

**Solutions:**

```bash
# Re-sync capacitor
npx cap sync android

# Check capacitor.config.ts
cat capacitor.config.ts | grep webDir
# Should show: webDir: 'dist'

# Verify dist folder exists
ls -lh dist/
```

---

## 📊 APK Information

### Understanding APK Components

**Debug APK (~50-80 MB):**
- Contains debugging symbols
- Not optimized
- Larger file size
- For testing only

**Release APK (~30-50 MB):**
- Optimized and minified
- Code obfuscated (ProGuard)
- Smaller file size
- Ready for distribution

### Reduce APK Size

**Enable App Bundles (AAB) instead of APK:**

```bash
# Build Android App Bundle (recommended for Play Store)
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**Benefits:**
- Smaller download size (50% reduction)
- Google Play generates optimized APKs per device
- Required for Play Store submissions

---

## 🎯 Quick Reference Commands

### Build Commands
```bash
# Development APK (quick testing)
npx cap sync android
cd android && ./gradlew assembleDebug

# Production APK (signed release)
cd android && ./gradlew assembleRelease

# App Bundle for Play Store
cd android && ./gradlew bundleRelease
```

### Installation Commands
```bash
# Install via USB
adb install path/to/app.apk

# Uninstall
adb uninstall com.pact.workflow

# Launch app
adb shell am start -n com.pact.workflow/.MainActivity

# View logs
adb logcat | grep com.pact.workflow
```

### Maintenance Commands
```bash
# Clean build
cd android && ./gradlew clean

# Update dependencies
npm install
npx cap sync android

# Check Capacitor status
npx cap doctor
```

---

## 📝 Checklist Before Distribution

**Before sending APK to users:**

- [ ] App version updated in `package.json`
- [ ] Tested on real Android device
- [ ] Tested offline mode
- [ ] All features working (navigation, auth, data sync)
- [ ] No crashes or errors in logs
- [ ] Release APK is signed
- [ ] APK size is reasonable (<50MB)
- [ ] Splash screen displays correctly
- [ ] App icon looks good
- [ ] Backend URL points to production (not localhost)
- [ ] SSL/HTTPS enabled (`cleartext: false`)

---

## 🎉 Success!

Your PACT Workflow Android app is now ready to use!

**Next Steps:**
- Test thoroughly on multiple devices
- Gather user feedback
- Submit to Google Play Store (optional)
- Set up automated builds (CI/CD)

**Need Help?**
- Android Studio docs: https://developer.android.com/studio/build
- Capacitor docs: https://capacitorjs.com/docs/android
- Stack Overflow: Tag your questions with `capacitor` and `android`

---

**Generated:** November 24, 2025  
**PACT Workflow Platform v1.0.0**
