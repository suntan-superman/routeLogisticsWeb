const { withAppBuildGradle } = require('@expo/config-plugins');
const marker = '// Route Logistics: bounded CMake object paths for Windows native builds.';
function configureCmakePaths(contents) {
  if (contents.includes(marker)) return contents;
  return `${contents}\n${marker}\nandroid {\n    externalNativeBuild {\n        cmake { buildStagingDirectory file("$rootDir/../../.migration/cxx") }\n    }\n    defaultConfig {\n        externalNativeBuild {\n            cmake { arguments "-DCMAKE_OBJECT_PATH_MAX=256" }\n        }\n    }\n}\n`;
}
module.exports = config => withAppBuildGradle(config, result => {
  result.modResults.contents = configureCmakePaths(result.modResults.contents);
  return result;
});
module.exports.configureCmakePaths = configureCmakePaths;
