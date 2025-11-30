# PACT Mobile APK Build Guide

Complete guide for building, signing, and distributing the PACT Workflow Platform mobile application.

## Prerequisites

### Development Environment
- Node.js 18+ installed
- Android Studio installed (for Android SDK)
- Java JDK 17+ installed
- Capacitor CLI (`npm install -g @capacitor/cli`)

### Environment Variables
```bash
# Required for signed builds
ANDROID_KEYSTORE_PATH=/path/to/your-keystore.jks
ANDROID_KEYSTORE_PASSWORD=your_keystore_password
ANDROID_KEYSTORE_ALIAS=your_key_alias
ANDROID_KEYSTORE_ALIAS_PASSWORD=your_key_password
```

---

## Quick Build Commands

### Development APK (Debug)
```bash
# Build web assets
npm run build

# Sync with Android
npx cap sync android

# Build debug APK
cd android && ./gradlew assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### Production APK (Release)
```bash
# Build optimized web assets
npm run build

# Sync with Android
npx cap sync android

# Build signed release APK
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`

---

## Step-by-Step Build Process

### Step 1: Prepare Web Assets

```bash
# Clean previous builds
rm -rf dist

# Build production-optimized web app
npm run build

# Verify build output
ls -la dist/
```

### Step 2: Sync Capacitor

```bash
# Copy web assets to native project
npx cap sync android

# Or just copy without updating plugins
npx cap copy android
```

### Step 3: Create Signing Keystore (First Time Only)

```bash
# Generate a new keystore for signing
keytool -genkey -v -keystore pact-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias pact-key

# Store securely! You'll need this for all future releases
```

**Important:** Keep your keystore file and passwords secure. Losing them means you cannot update your app on Google Play.

### Step 4: Configure Signing

Create `android/app/signing.properties`:
```properties
storeFile=/path/to/pact-release.jks
storePassword=your_keystore_password
keyAlias=pact-key
keyPassword=your_key_password
```

Or set environment variables (recommended for CI/CD):
```bash
export ANDROID_KEYSTORE_PATH=/path/to/pact-release.jks
export ANDROID_KEYSTORE_PASSWORD=your_keystore_password
export ANDROID_KEYSTORE_ALIAS=pact-key
export ANDROID_KEYSTORE_ALIAS_PASSWORD=your_key_password
```

### Step 5: Build Release APK

```bash
cd android

# Clean previous builds
./gradlew clean

# Build signed release APK
./gradlew assembleRelease

# APK location
ls -la app/build/outputs/apk/release/
```

### Step 6: Verify APK

```bash
# Check APK signing
apksigner verify --verbose app/build/outputs/apk/release/app-release.apk

# Check APK contents
aapt dump badging app/build/outputs/apk/release/app-release.apk
```

---

## Build for Google Play (AAB)

For Play Store distribution, build an Android App Bundle instead:

```bash
cd android

# Build signed release bundle
./gradlew bundleRelease

# Output location
ls -la app/build/outputs/bundle/release/
```

---

## Version Management

### Update Version Number

Edit `android/app/build.gradle`:
```gradle
android {
    defaultConfig {
        versionCode 2          // Increment for each release
        versionName "1.1.0"    // Semantic version
    }
}
```

### Version Naming Convention
- **versionCode**: Integer that must increment for each Play Store release
- **versionName**: User-facing version (e.g., "1.2.3")

---

## Live Reload Development

For faster development with live reload:

```bash
# Start dev server
npm run dev

# Get your local IP (e.g., 192.168.1.100)
ifconfig | grep inet

# Set environment variable
export CAPACITOR_LIVE_RELOAD=true
export CAPACITOR_REMOTE_URL=http://192.168.1.100:5000

# Sync and run on device
npx cap sync android
npx cap run android
```

---

## Troubleshooting

### Build Fails with Gradle Error
```bash
# Clear Gradle cache
cd android
./gradlew clean
rm -rf ~/.gradle/caches/

# Rebuild
./gradlew assembleDebug
```

### Capacitor Sync Issues
```bash
# Force refresh native plugins
npx cap sync android --force

# Rebuild Capacitor
rm -rf android/app/src/main/assets/public
npx cap copy android
```

### APK Not Installing
- Enable "Install from unknown sources" in device settings
- Check minimum SDK version matches device
- Verify APK was signed correctly

### Network Issues on Device
- Ensure `usesCleartextTraffic="true"` in AndroidManifest.xml (dev only)
- Check network_security_config.xml for proper domains
- Verify Supabase URLs are allowed in allowNavigation

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build Android APK

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Setup Java
        uses: actions/setup-java@v3
        with:
          distribution: 'temurin'
          java-version: '17'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build web assets
        run: npm run build
      
      - name: Sync Capacitor
        run: npx cap sync android
      
      - name: Decode keystore
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/pact-release.jks
      
      - name: Build APK
        env:
          ANDROID_KEYSTORE_PATH: pact-release.jks
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEYSTORE_ALIAS: ${{ secrets.ANDROID_KEYSTORE_ALIAS }}
          ANDROID_KEYSTORE_ALIAS_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_ALIAS_PASSWORD }}
        run: |
          cd android
          ./gradlew assembleRelease
      
      - name: Upload APK
        uses: actions/upload-artifact@v3
        with:
          name: app-release
          path: android/app/build/outputs/apk/release/app-release.apk
```

---

## Release Checklist

Before each release:

- [ ] Update `versionCode` and `versionName` in build.gradle
- [ ] Test offline functionality
- [ ] Verify push notifications work
- [ ] Test GPS location features
- [ ] Check camera permissions
- [ ] Verify dark/light theme switching
- [ ] Test on multiple Android versions (min API 24)
- [ ] Run `npx cap sync android` after npm build
- [ ] Build and sign APK with release keystore
- [ ] Test signed APK on a real device
- [ ] Create git tag for the release

---

## App Configuration

### Package Name
`com.pact.workflow`

### Minimum SDK
API 24 (Android 7.0)

### Target SDK
API 34 (Android 14)

### Required Permissions
- Internet access
- Location (fine and background)
- Camera
- Storage (media images)
- Push notifications
- Vibration
- Network state

---

## Support

For build issues, check:
1. Capacitor docs: https://capacitorjs.com/docs
2. Android Studio build issues
3. Gradle documentation

Contact ICT team for keystore credentials and signing configuration.
