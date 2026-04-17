import js from '@eslint/js';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

export default [
  // Ignore patterns
  {
    ignores: [
      'node_modules/',
      'PoliceDashboard/node_modules/',
      'android/',
      'ios/',
      '.expo/',
      'build/',
      'PoliceDashboard/build/',
      'dist/',
      'coverage/',
      'web-build/',
      'functions/node_modules/',
      'functions/',
      '__tests__/',
    ],
  },

  // Base JS config
  js.configs.recommended,

  // Prettier config (disables conflicting rules)
  prettierConfig,

  // Main config for JS/JSX files
  {
    files: ['**/*.js', '**/*.jsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-native': reactNativePlugin,
      prettier: prettierPlugin,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        Notification: 'readonly',
        Audio: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Node globals
        module: 'readonly',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        // React Native globals
        __DEV__: 'readonly',
        global: 'readonly',
        // ES2021
        Promise: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        WeakMap: 'readonly',
        WeakSet: 'readonly',
        Proxy: 'readonly',
        Reflect: 'readonly',
        Symbol: 'readonly',
        BigInt: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      // React rules
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',

      // React Hooks rules
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // General rules
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'prefer-const': 'warn',
      'no-var': 'error',

      // Prettier integration
      'prettier/prettier': ['warn', { endOfLine: 'auto' }, { usePrettierrc: true }],
    },
  },

  // Test files config — add Jest globals
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        jest: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      // Test files often keep a /* global ... */ banner for readability.
      // This overlaps with globals above and should not fail lint.
      'no-redeclare': 'off',
    },
  },
];
