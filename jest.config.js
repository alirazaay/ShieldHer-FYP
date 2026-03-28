/**
 * Jest Configuration for ShieldHer
 *
 * Avoids the native react-native/jest/setup.js (contains Flow type annotations
 * that can't be parsed as plain JS in RN 0.81+). Instead, we provide our own
 * mock setup and use jest-expo's babel transform for module compilation.
 */
const path = require('path');

module.exports = {
  // Do NOT use 'preset' directly — it pulls in RN's Flow-typed setup.js.
  // Instead, cherry-pick the parts we need from jest-expo.

  // Transform config from jest-expo (handles Flow, JSX, etc.)
  transform: {
    '\\.[jt]sx?$': [
      'babel-jest',
      {
        caller: {
          name: 'metro',
          bundler: 'metro',
          platform: 'ios',
        },
      },
    ],
    '^.+\\.(bmp|gif|jpg|jpeg|png|psd|svg|webp|xml|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|yaml|yml|otf|ttf|zip|heic|avif|db)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },

  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|native-base|react-native-svg|firebase|@firebase)',
  ],

  // Our custom setup (mocks Firebase, Expo modules, etc.)
  // Explicitly SKIP react-native/jest/setup.js which has Flow annotations
  setupFiles: [path.resolve(__dirname, '__tests__/setup.js')],

  testMatch: ['**/__tests__/**/*.test.js', '**/tests/**/*.test.js'],

  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/__tests__/__mocks__/fileMock.js',
  },

  collectCoverageFrom: [
    'src/**/*.{js,jsx}',
    'functions/**/*.js',
    '!src/**/*.test.{js,jsx}',
    '!functions/**/*.test.js',
    '!**/node_modules/**',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
