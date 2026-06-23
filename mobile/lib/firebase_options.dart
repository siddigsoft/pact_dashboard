// Firebase options placeholder.
// Replace with generated file from FlutterFire CLI:
//   flutterfire configure --project=YOUR_FIREBASE_PROJECT_ID
//
// For now, Firebase push notifications will be gracefully skipped
// (the try/catch in main.dart handles this).

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart' show defaultTargetPlatform, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return android;
      default:
        return android;
    }
  }

  // Placeholder — replace with real values from google-services.json
  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'PLACEHOLDER_API_KEY',
    appId: '1:000000000000:android:000000000000000000000000',
    messagingSenderId: '000000000000',
    projectId: 'pact-command-center',
    storageBucket: 'pact-command-center.appspot.com',
  );
}
