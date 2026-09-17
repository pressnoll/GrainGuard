const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);
const { assetExts } = defaultConfig.resolver;
const config = {
  resolver: {
    // The visual classifier is packaged with the app and loaded by the native
    // TensorFlow Lite runtime; Metro must treat it as an asset, not source.
    assetExts: [...assetExts, 'tflite'],

    // Gradle creates and removes files in these directories while Metro is
    // running. Excluding generated native output prevents the Windows fallback
    // watcher from trying to watch a directory that Gradle has just removed.
    blockList: [
      // CMake uses .cxx trees both in the app and inside native packages in
      // node_modules. Their short-lived CMakeTmp folders must never be watched.
      /[/\\]\.cxx[/\\].*/,
      /[/\\]android[/\\]app[/\\]build[/\\].*/,
      /[/\\]android[/\\]build[/\\].*/,
      /[/\\]ios[/\\]build[/\\].*/,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
