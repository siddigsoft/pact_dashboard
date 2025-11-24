# 📱 PACT Mobile APK Generation Guide for Replit

## Overview
This guide will walk you through the complete process of generating an Android APK from your PACT Workflow Platform running on Replit using Capacitor. The app features a cyber-tech themed interface with gradient cards, dark mode support, and native mobile capabilities.

---

## 🎯 Prerequisites

### Required Software
1. **Android Studio** (Latest version recommended)
   - Download from: https://developer.android.com/studio
   - Minimum: Arctic Fox (2020.3.1) or later
   - Install with Android SDK Tools

2. **Java Development Kit (JDK)**
   - JDK 11 or later
   - Typically installed with Android Studio

3. **Node.js** (Already available on Replit)
   - Version 18 or later

### Replit Setup
- Your PACT project running on Replit
- All dependencies installed
- Application building successfully (`npm run build`)

---

## 📋 Step-by-Step Process

### **PHASE 1: Initial Setup on Replit**

#### 1.1 Verify Capacitor Installation
Your project already has Capacitor installed. Verify with:

```bash
npm list @capacitor/core @capacitor/cli @capacitor/android
```

#### 1.2 Build Your Web Application
First, create a production build of your React application:

```bash
npm run build
```

This creates an optimized `dist` folder with your web app.

#### 1.3 Update Capacitor Configuration
The `capacitor.config.ts` file needs to be updated for local development:

**Current config (for Lovable):**
```typescript
const config: CapacitorConfig = {
  appId: 'app.lovable.91773677c07f4ef0aac332c7b3821cde',
  appName: 'pact-consultancy',
  webDir: 'dist',
  server: {
    url: 'https://91773677-c07f-4ef0-aac3-32c7b3821cde.lovableproject.com?forceHideBadge=true',
    cleartext: true
  }
};
```

**For APK generation, update to:**
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pact.consultancy',  // Change to your own unique ID
  appName: 'PACT Workflow',       // Your app name
  webDir: 'dist',
  server: {
    // For development: Use your Replit domain
    url: 'https://8061f5ee-0482-4ab7-b0dc-02ca73db7311-00-1mrfz5xd21tdt.riker.replit.dev',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1A1F2C",
      androidScaleType: "CENTER_CROP",
      showSpinner: false
    }
  }
};

export default config;
```

**For production APK (standalone app), comment out the server section:**
```typescript
const config: CapacitorConfig = {
  appId: 'com.pact.consultancy',
  appName: 'PACT Workflow',
  webDir: 'dist',
  // server: { ... },  // Comment this out for standalone app
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1A1F2C"
    }
  }
};
```

#### 1.4 Add Android Platform
If not already added, run:

```bash
npm run cap:add:android
```

or manually:

```bash
npx cap add android
```

This creates an `android` folder in your project root.

---

### **PHASE 2: Syncing & Opening in Android Studio**

#### 2.1 Sync Web Assets to Android
Every time you make changes to your web app, run:

```bash
npm run cap:sync
```

or manually:

```bash
npm run build
npx cap sync android
```

This command:
- Builds your React app
- Copies the `dist` folder into the Android project
- Syncs Capacitor plugins

#### 2.2 Open Project in Android Studio
Run one of these commands:

```bash
npm run cap:open:android
```

or

```bash
npx cap open android
```

**Alternative:** Manually open Android Studio and select:
- **File → Open**
- Navigate to the `android` folder in your project
- Click **OK**

---

### **PHASE 3: Building the APK in Android Studio**

#### 3.1 Wait for Gradle Sync
- Android Studio will automatically start syncing Gradle
- Wait for the sync to complete (check bottom status bar)
- This may take 5-10 minutes on first run

#### 3.2 Update Dependencies (if prompted)
- If prompted to update Gradle or plugins, click **Update**
- Accept any license agreements

#### 3.3 Configure Build Variant (Optional)
1. Click **Build → Select Build Variant**
2. Choose:
   - **debug** - For testing (creates `app-debug.apk`)
   - **release** - For production (requires signing)

#### 3.4 Build the APK

**Method 1: Build Menu**
1. Go to: **Build → Build Bundle(s) / APK(s) → Build APK(s)**
2. Wait for build to complete (1-5 minutes)
3. A popup will appear: **"APK(s) generated successfully"**
4. Click **Locate** to find your APK

**Method 2: Command Line (from Replit Shell)**
```bash
cd android
./gradlew assembleDebug
```

The APK will be located at:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

#### 3.5 Find Your APK
Navigate to:
```
<project-root>/android/app/build/outputs/apk/debug/app-debug.apk
```

---

### **PHASE 4: Installing & Testing the APK**

#### 4.1 Transfer APK to Your Phone

**Method 1: USB Cable**
1. Connect your Android phone to computer via USB
2. Enable **File Transfer** mode
3. Copy `app-debug.apk` to your phone's **Downloads** folder

**Method 2: Cloud Storage**
1. Upload APK to Google Drive, Dropbox, or email it to yourself
2. Download on your phone
3. Install from Downloads

**Method 3: ADB (Android Debug Bridge)**
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

#### 4.2 Install on Device
1. Open **File Manager** on your phone
2. Navigate to **Downloads**
3. Tap on `app-debug.apk`
4. If prompted, enable **"Install from Unknown Sources"** in Settings
5. Tap **Install**
6. Once installed, tap **Open** or find the app in your app drawer

---

### **PHASE 5: Production Release (Signed APK/AAB)**

For Google Play Store or production distribution, you need a signed build.

#### 5.1 Generate a Signing Key
In Android Studio:
1. **Build → Generate Signed Bundle / APK**
2. Select **APK** or **Android App Bundle (AAB)**
3. Click **Create new...** to create a keystore
4. Fill in the details:
   - **Key store path**: Save somewhere safe (e.g., `pact-release-key.jks`)
   - **Password**: Create a strong password
   - **Key alias**: e.g., `pact-key`
   - **Validity**: 25 years (default)
   - Fill in organization details
5. Click **OK**

⚠️ **IMPORTANT**: Save your keystore file and passwords securely! You'll need them for all future updates.

#### 5.2 Sign the APK
1. **Build → Generate Signed Bundle / APK**
2. Choose **APK**
3. Select your keystore file
4. Enter passwords
5. Choose build type: **release**
6. Click **Finish**

The signed APK will be at:
```
android/app/release/app-release.apk
```

---

## 🔧 Troubleshooting

### Common Issues

#### **Issue 1: "Android SDK not found"**
**Solution:**
- Open Android Studio → **Tools → SDK Manager**
- Install Android SDK (API level 31 or higher)
- Set `ANDROID_HOME` environment variable

#### **Issue 2: "Gradle build failed"**
**Solution:**
```bash
cd android
./gradlew clean
./gradlew assembleDebug
```

#### **Issue 3: "App doesn't install on phone"**
**Solution:**
- Enable "Install from Unknown Sources" in Settings
- Check if you have enough storage space
- Uninstall previous version of app

#### **Issue 4: "White screen on app launch"**
**Solution:**
- Check that `webDir: 'dist'` is correct in `capacitor.config.ts`
- Run `npm run build` before `npx cap sync`
- Check Android Logcat for errors

#### **Issue 5: "Changes not reflecting in app"**
**Solution:**
Always run this sequence:
```bash
npm run build
npx cap sync
```
Then rebuild in Android Studio or run:
```bash
npm run cap:build:android
```

#### **Issue 6: Network/API errors in app**
**Solution:**
- Update `capacitor.config.ts` with correct server URL
- For standalone app, comment out `server` section
- Ensure your backend API allows CORS from mobile origin

---

## 📱 Development Workflow

### Quick Development Cycle

**For web changes:**
```bash
npm run cap:sync
```

**For plugin/native changes:**
```bash
npx cap sync
npx cap open android
```

### Live Reload (Development Only)

Using the `server.url` in `capacitor.config.ts`, you can develop with live reload:

1. Start your Replit dev server: `npm run dev`
2. Set `server.url` to your Replit domain
3. Build and install the APK
4. App will connect to your Replit server for hot reloading

**⚠️ Production apps should NOT have `server.url` configured!**

---

## 🎨 Customizing Your Mobile App

### App Icons
1. Create icons at various sizes:
   - `android/app/src/main/res/mipmap-hdpi/ic_launcher.png` (72x72)
   - `android/app/src/main/res/mipmap-mdpi/ic_launcher.png` (48x48)
   - `android/app/src/main/res/mipmap-xhdpi/ic_launcher.png` (96x96)
   - `android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png` (144x144)
   - `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` (192x192)

### Splash Screen
Configure in `capacitor.config.ts`:
```typescript
plugins: {
  SplashScreen: {
    launchShowDuration: 2000,
    backgroundColor: "#1A1F2C",  // Your theme color
    androidScaleType: "CENTER_CROP",
    showSpinner: false
  }
}
```

### App Name & Package
Edit `android/app/src/main/AndroidManifest.xml`:
```xml
<application
    android:label="PACT Workflow"
    ...
>
```

---

## 🚀 Publishing to Google Play Store

1. **Create AAB (Android App Bundle)** instead of APK
2. **Sign with release key**
3. **Create Google Play Console account** ($25 one-time fee)
4. **Upload AAB** to Play Console
5. **Fill in store listing** (description, screenshots, etc.)
6. **Submit for review**

---

## 📊 Native Features in PACT App

Your app already includes these Capacitor plugins:

- **@capacitor/device** - Device information
- **@capacitor/android** - Android-specific features
- **@capacitor/ios** - iOS support (for future)

### Using Device Plugin
Example in your app:
```typescript
import { Device } from '@capacitor/device';

const info = await Device.getInfo();
console.log('Platform:', info.platform); // 'android'
console.log('Model:', info.model);
```

---

## 📝 Quick Reference Commands

```bash
# Add Android platform
npm run cap:add:android

# Build and sync (after code changes)
npm run cap:sync

# Open in Android Studio
npm run cap:open:android

# Build APK via CLI
npm run cap:build:android

# Manual steps
npm run build              # Build React app
npx cap sync               # Sync to native project
npx cap open android       # Open Android Studio
```

---

## ⚙️ Configuration Files Reference

### capacitor.config.ts (Development)
```typescript
{
  appId: 'com.pact.consultancy',
  appName: 'PACT Workflow',
  webDir: 'dist',
  server: {
    url: 'https://your-replit-domain.replit.dev',
    cleartext: true
  }
}
```

### capacitor.config.ts (Production)
```typescript
{
  appId: 'com.pact.consultancy',
  appName: 'PACT Workflow',
  webDir: 'dist',
  // NO server configuration for standalone app
}
```

---

## 🎯 Best Practices

1. **Always build before syncing**
   ```bash
   npm run build && npx cap sync
   ```

2. **Test on real devices**, not just emulators

3. **Keep keystore safe** - Store in password manager

4. **Use environment variables** for API keys:
   ```typescript
   const apiUrl = import.meta.env.VITE_API_URL;
   ```

5. **Test both orientations** - Portrait and landscape

6. **Optimize images** - Use WebP format when possible

7. **Test offline mode** - App should handle no network gracefully

---

## 📞 Support & Resources

- **Capacitor Docs**: https://capacitorjs.com/docs
- **Android Studio**: https://developer.android.com/studio/intro
- **React + Capacitor**: https://capacitorjs.com/solution/react
- **Replit Docs**: https://docs.replit.com/

---

## 🎉 Success Checklist

- [ ] Android Studio installed
- [ ] Capacitor dependencies installed
- [ ] Web app builds successfully (`npm run build`)
- [ ] Android platform added (`npm run cap:add:android`)
- [ ] Capacitor config updated with correct appId
- [ ] Assets synced to Android (`npm run cap:sync`)
- [ ] APK built successfully in Android Studio
- [ ] APK installed and tested on device
- [ ] All features working as expected
- [ ] Release APK signed (for production)

---

**Generated:** November 23, 2025  
**Version:** 1.0  
**Platform:** PACT Workflow Platform on Replit
