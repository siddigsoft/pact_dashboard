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
-keep class io.flutter.** { *; }
-dontwarn io.flutter.**

# Supabase
-keep class io.supabase.** { *; }
-dontwarn io.supabase.**