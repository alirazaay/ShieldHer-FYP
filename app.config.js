import 'dotenv/config';

export default {
  expo: {
    name: 'ShieldHer',
    slug: 'shieldher',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: false,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.shieldher.app',
      infoPlist: {
        NSSpeechRecognitionUsageDescription: 'Allow $(PRODUCT_NAME) to use speech recognition.',
        NSMicrophoneUsageDescription: 'Allow $(PRODUCT_NAME) to use the microphone.',
        NSLocationWhenInUseUsageDescription:
          'Allow $(PRODUCT_NAME) to access your location for emergency alerts.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Allow $(PRODUCT_NAME) to access your location in background for safety.',
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#ffffff',
      },
      edgeToEdgeEnabled: true,
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.ACCESS_FINE_LOCATION',
        'android.permission.ACCESS_COARSE_LOCATION',
        'android.permission.SEND_SMS',
        'android.permission.POST_NOTIFICATIONS',
        'android.permission.READ_PHONE_STATE',
        'android.permission.RECEIVE_BOOT_COMPLETED',
        'android.permission.FOREGROUND_SERVICE',
        'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
        'android.permission.USE_FULL_SCREEN_INTENT',
        'android.permission.INTERNET',
        'android.permission.ACCESS_NETWORK_STATE',
      ],
      package: 'com.shieldher.app',
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: ['expo-speech-recognition'],
    extra: {
      // Firebase configuration from environment variables
      firebaseApiKey: process.env.FIREBASE_API_KEY,
      firebaseAuthDomain: process.env.FIREBASE_AUTH_DOMAIN,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
      firebaseStorageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      firebaseMessagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
      firebaseAppId: process.env.FIREBASE_APP_ID,
      firebaseMeasurementId: process.env.FIREBASE_MEASUREMENT_ID,
      // Expo configuration
      expoProjectId: process.env.EXPO_PROJECT_ID,
      eas: {
        projectId: process.env.EXPO_PROJECT_ID,
      },
    },
  },
};
