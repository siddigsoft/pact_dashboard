import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

val keystorePropertiesFile = rootProject.file("key.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

// Codemagic injects these when android_signing is configured in codemagic.yaml
val cmKeystorePath = System.getenv("CM_KEYSTORE_PATH")
val cmKeystorePassword = System.getenv("CM_KEYSTORE_PASSWORD")
val cmKeyAlias = System.getenv("CM_KEY_ALIAS")
val cmKeyPassword = System.getenv("CM_KEY_PASSWORD")
val hasCodemagicSigning = !cmKeystorePath.isNullOrBlank() &&
    !cmKeystorePassword.isNullOrBlank() &&
    !cmKeyAlias.isNullOrBlank() &&
    !cmKeyPassword.isNullOrBlank()
val hasLocalSigning = keystorePropertiesFile.exists() && keystoreProperties["storeFile"] != null

// Agora pulls in full-screen-sharing for screen capture; we only need voice/video calls.
configurations.configureEach {
    exclude(group = "io.agora.rtc", module = "full-screen-sharing")
}

android {
    namespace = "com.pact.workflow"
    compileSdk = 36
    ndkVersion = "28.0.12433566"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        isCoreLibraryDesugaringEnabled = true
    }

    tasks.withType<JavaCompile>().configureEach {
        options.compilerArgs.add("-Xlint:-options")
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    sourceSets {
        getByName("main") {
            java.srcDirs("src/main/kotlin")
        }
    }

    defaultConfig {
        applicationId = "com.pact.workflow"
        minSdk = flutter.minSdkVersion
        targetSdk = 35
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            if (hasCodemagicSigning) {
                keyAlias = cmKeyAlias
                keyPassword = cmKeyPassword
                storeFile = file(cmKeystorePath!!)
                storePassword = cmKeystorePassword
            } else {
                keyAlias = keystoreProperties["keyAlias"] as String?
                keyPassword = keystoreProperties["keyPassword"] as String?
                storeFile = if (keystoreProperties["storeFile"] != null) {
                    file(keystoreProperties["storeFile"] as String)
                } else {
                    null
                }
                storePassword = keystoreProperties["storePassword"] as String?
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (hasCodemagicSigning || hasLocalSigning) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    // Google Play 16 KB page size: uncompressed native libs, 16 KB zip-aligned (AGP 8.5.1+)
    packaging {
        jniLibs {
            useLegacyPackaging = false
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
    implementation("androidx.biometric:biometric:1.1.0")
}
