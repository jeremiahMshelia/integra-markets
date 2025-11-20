const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);

config.resolver.alias = {
  '@': path.resolve(__dirname, 'app'),
};

config.resolver.sourceExts = Array.from(
  new Set([...config.resolver.sourceExts, 'ts', 'tsx', 'cjs'])
);

const missingAssetRegistryPath = path.resolve(
  __dirname,
  'missing-asset-registry-path.js'
);

config.resolver.assetRegistryPath = missingAssetRegistryPath;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'missing-asset-registry-path') {
    return {
      type: 'sourceFile',
      filePath: missingAssetRegistryPath,
    };
  }

  if (context.resolveRequest) {
    return context.resolveRequest(context, moduleName, platform);
  }

  return resolve(context, moduleName, platform);
};

config.transformer.minifierConfig = {
  ...config.transformer.minifierConfig,
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

if (process.env.NODE_ENV === 'production') {
  config.transformer.publicPath = '/integra-markets/_expo/static/';
}

module.exports = config;
