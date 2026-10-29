import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nutricionistai.app',
  appName: 'Nutricionist AI',
  webDir: 'dist',
  android: {
    // Permite falar com um servidor de IA em http:// na rede local (testes). Em produção, use https://.
    allowMixedContent: true,
  },
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#14513c',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_notify',
      iconColor: '#1b6b4f',
    },
  },
};

export default config;
