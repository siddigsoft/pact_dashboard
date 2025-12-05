# PACT Workflow ProGuard Rules
# Optimized for Capacitor + Firebase + Android

# ==== General Android Rules ====
-dontusemixedcaseclassnames
-dontskipnonpubliclibraryclasses
-verbose

# Preserve annotations, signatures, and exceptions
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod
-keepattributes SourceFile,LineNumberTable

# ==== Capacitor Rules ====
-keep class com.getcapacitor.** { *; }
-keep class org.capacitorjs.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.annotation.Permission class * { *; }
-keep @com.getcapacitor.NativePlugin class * { *; }

# Keep Capacitor Bridge
-keep class com.getcapacitor.Bridge { *; }
-keep class com.getcapacitor.BridgeWebViewClient { *; }
-keep class com.getcapacitor.MessageHandler { *; }
-keep class com.getcapacitor.Plugin { *; }
-keep class com.getcapacitor.PluginCall { *; }
-keep class com.getcapacitor.PluginResult { *; }
-keep class com.getcapacitor.JSObject { *; }
-keep class com.getcapacitor.JSArray { *; }

# Keep Capacitor Plugins
-keep class com.capacitorjs.plugins.** { *; }

# ==== Firebase Rules ====
# Keep Firebase classes
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# Firebase Messaging
-keep class com.google.firebase.messaging.** { *; }
-keep class com.pact.workflow.PACTFirebaseMessagingService { *; }

# Firebase Crashlytics
-keepattributes SourceFile,LineNumberTable
-keep public class * extends java.lang.Exception

# Firebase Analytics
-keep class com.google.android.gms.measurement.** { *; }
-keep class com.google.firebase.analytics.** { *; }

# ==== PACT Application Rules ====
# Keep main activity and services
-keep class com.pact.workflow.MainActivity { *; }
-keep class com.pact.workflow.LocationForegroundService { *; }

# Keep any native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Parcelables
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# Keep Serializables
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# ==== WebView Rules ====
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep WebView JavaScript interfaces
-keepattributes JavascriptInterface

# ==== Enum Rules ====
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ==== WorkManager Rules ====
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.ListenableWorker {
    public <init>(android.content.Context,androidx.work.WorkerParameters);
}

# ==== OkHttp/Retrofit Rules (if used) ====
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ==== Gson Rules (if used for JSON) ====
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.stream.** { *; }
-keep class * implements com.google.gson.TypeAdapterFactory
-keep class * implements com.google.gson.JsonSerializer
-keep class * implements com.google.gson.JsonDeserializer

# ==== Suppress Warnings ====
-dontwarn java.lang.invoke.**
-dontwarn **$$Lambda$*
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.*
-dontwarn kotlin.**
-dontwarn kotlinx.**
