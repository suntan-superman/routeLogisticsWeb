// Native metadata identifies the binary actually installed on the device.
// EAS remote build numbers can differ from the checked-in app configuration.
function aboutAppMessage({ application = {}, config = {}, executionEnvironment, platform = {} } = {}) {
  const value = input => typeof input === 'string' && input.trim() ? input.trim() : null;
  const preview = executionEnvironment === 'storeClient' || platform.OS === 'web';
  const nativeVersion = preview ? null : value(application.nativeApplicationVersion);
  const version = nativeVersion || value(config.version);
  const build = preview ? null : value(application.nativeBuildVersion);
  const platformName = { ios: 'iOS', android: 'Android', web: 'Web preview' }[platform.OS] || 'Unavailable';
  const osVersion = platform.Version == null || platform.OS === 'web' ? '' : platform.OS === 'android' ? ` (API ${platform.Version})` : ` ${platform.Version}`;
  return [
    'Workside Software LLC',
    '',
    `Version: ${version || 'Unavailable'}${!nativeVersion && version ? ' (preview)' : ''}`,
    `Build: ${build || (preview ? 'Unavailable in preview' : 'Unavailable')}`,
    `Platform: ${platformName}${osVersion}`,
    '',
    'Include the version and build number when contacting support.',
  ].join('\n');
}

module.exports = { aboutAppMessage };
