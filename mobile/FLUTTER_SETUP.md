# PACT Command Center — Flutter App Setup

## First-time local setup

```bash
cd mobile
flutter pub get
```

This automatically fills in any missing Android resource files (launcher icons, etc.):
```bash
flutter create --project-name pact_command_center --org com.pact --android-language kotlin --no-pub .
flutter pub get
```

## Running in development

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://your-project.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your-anon-key
```

## Firebase (optional — for push notifications)

1. Create a Firebase project at https://console.firebase.google.com
2. Add an Android app with package `com.pact.commandcenter`
3. Download `google-services.json` and place it at `mobile/android/app/google-services.json`
4. Run `flutterfire configure` to update `lib/firebase_options.dart`

Without Firebase, the app works fully — push notifications are simply not delivered.

## Building a release APK locally

```bash
flutter build apk --release \
  --dart-define=SUPABASE_URL=https://your-project.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your-anon-key
```

Output: `build/app/outputs/flutter-apk/app-release.apk`

## GitHub Actions (automatic APK builds)

Every push to `master` or `main` that touches `mobile/` triggers `.github/workflows/build-flutter-apk.yml`.

**Required GitHub secrets:**
| Secret | Value |
|--------|-------|
| `VITE_SUPABASE_URL` | Your Supabase project URL (already set for web app) |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon key (already set for web app) |

The APK is uploaded as a build artifact (retained 30 days).

## Role Access Summary

| Role | Screens |
|------|---------|
| **Data Collector** | Dashboard · Field Ops · My Sites · Tasks · Wallet · Calendar · Notifications |
| **Coordinator** | + Cost Submission · Site Verification · Sites for Verification |
| **Supervisor** | + Approvals Hub · Cycle Close |
| **FOM** | + Finance Hub · Programme Hub · CRM · Analytics |
| **Data Team** | Tasks · MMP (read-only) · Field Ops (read-only) · Analytics · Communication |

## Architecture

- **Offline-first:** Hive caches all key data locally. SyncManager flushes queued actions on reconnect.
- **State:** Flutter Riverpod (providers) — matches web app's React Context approach.
- **Navigation:** go_router with role-based bottom nav + drawer.
- **Auth:** Supabase Auth (same credentials as web app).
- **Push:** Firebase Cloud Messaging (optional).
