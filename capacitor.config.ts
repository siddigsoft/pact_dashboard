
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.91773677c07f4ef0aac332c7b3821cde',
  appName: 'pact-consultancy',
  webDir: 'dist',
  server: {
    url: 'https://91773677-c07f-4ef0-aac3-32c7b3821cde.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000
    }
  }
};

export default config;
