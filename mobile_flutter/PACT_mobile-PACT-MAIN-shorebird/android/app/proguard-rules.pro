# Keep Facebook Fresco/ImagePipeline classes (used by Jitsi)
-keep class com.facebook.imagepipeline.** { *; }
-dontwarn com.facebook.imagepipeline.**

# Keep WebP transcoder
-keep class com.facebook.imagepipeline.nativecode.** { *; }
-dontwarn com.facebook.imagepipeline.nativecode.**

# Jitsi Meet SDK
-keep class org.jitsi.** { *; }
-dontwarn org.jitsi.**

# WebRTC
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# Flutter
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-dontwarn io.flutter.**
-dontwarn io.flutter.embedding.**

# Supabase
-keep class io.supabase.** { *; }
-dontwarn io.supabase.**

# Agora RTC Engine
-keep class io.agora.** { *; }
-dontwarn io.agora.**

# Firebase
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# Google Play Core
-dontwarn com.google.android.play.core.**

# AndroidX Lifecycle
-keep class androidx.lifecycle.** { *; }

# Google Crypto Tink (flutter_secure_storage)
-keep class com.google.crypto.tink.** { *; }
-dontwarn com.google.crypto.tink.**

# Keep annotations
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses
