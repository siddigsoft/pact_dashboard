import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.pact.workflow',
  appName: 'PACT Workflow',
  webDir: 'dist',
 
  server: process.env.CAPACITOR_REMOTE_URL
    ? {
        url: process.env.CAPACITOR_REMOTE_URL,
        cleartext: false,
        allowNavigation: [
          'https://pact-dashboard-831y.vercel.app',
          'https://*.vercel.app',
          'https://*.supabase.co',
          'https://*.supabase.in',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com'
        ]
      }
    : process.env.NODE_ENV === 'development' && process.env.CAPACITOR_LIVE_RELOAD === 'true'
    ? {
        url: 'http://localhost:5000',
        cleartext: true,
        allowNavigation: [
          'https://pact-dashboard-831y.vercel.app',
          'https://*.vercel.app',
          'https://*.supabase.co',
          'https://*.supabase.in',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com'
        ]
      }
    : {
        // Production: bundled app, but allow navigation to external services
        allowNavigation: [
          'https://pact-dashboard-831y.vercel.app',
          'https://*.vercel.app',
          'https://*.supabase.co',
          'https://*.supabase.in',
          'https://fonts.googleapis.com',
          'https://fonts.gstatic.com'
        ]
      },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: process.env.NODE_ENV === 'development',
    // Build configuration for APK
    buildOptions: {
      keystorePath: process.env.ANDROID_KEYSTORE_PATH,
      keystorePassword: process.env.ANDROID_KEYSTORE_PASSWORD,
      keystoreAlias: process.env.ANDROID_KEYSTORE_ALIAS,
      keystoreAliasPassword: process.env.ANDROID_KEYSTORE_ALIAS_PASSWORD
    }
  },
  ios: {
    contentInset: 'always'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1e40af',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#ffffff',
      androidSpinnerStyle: 'large',
      iosSpinnerStyle: 'small',
      splashFullScreen: true,
      splashImmersive: true
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#1e40af',
      sound: 'beep.wav'
    },
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'dark',
      backgroundColor: '#1e40af',
      overlaysWebView: false
    },
    NavigationBar: {
      backgroundColor: '#1e40af',
      color: 'white'
    },
    Geolocation: {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    },
    Camera: {
      presentationStyle: 'popover',
      saveToGallery: true,
      quality: 90
    },
    Network: {
      connectionType: true
    },
    Filesystem: {
      directory: 'Documents'
    }
  }
};

export default config;
