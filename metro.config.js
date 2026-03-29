const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.transformer = {
  ...config.transformer,
  getTransformOptions: async () => ({
    transform: {
      experimentalImportSupport: false,
      inlineRequires: false,
    },
  }),
};

const extraAssetExts = ['mp4', 'webm', 'wav', 'mp3', 'aac', 'm4a', 'ttf'];

config.resolver = {
  ...config.resolver,
  assetExts: Array.from(new Set([...(config.resolver.assetExts || []), ...extraAssetExts])),
};

module.exports = config;
