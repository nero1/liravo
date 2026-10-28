const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...config.watchFolders, path.resolve(__dirname, '../messages'), path.resolve(__dirname, '../src/lib')];

config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules'), ...(config.resolver.nodeModulesPaths ?? [])];

module.exports = withNativeWind(config, { input: './global.css' });
