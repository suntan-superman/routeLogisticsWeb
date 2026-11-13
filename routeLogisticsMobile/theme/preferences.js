const THEME_KEY = 'rl-appearance-v1';
const MODES = ['system', 'light', 'dark'];
const normalizeMode = mode => MODES.includes(mode) ? mode : 'system';
const resolveMode = (mode, system) => normalizeMode(mode) === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
async function loadAppearance(storage) { return normalizeMode(await storage.getItem(THEME_KEY)); }
async function saveAppearance(storage, mode) {
  if (!MODES.includes(mode)) throw new Error('Choose System, Light, or Dark.');
  await storage.setItem(THEME_KEY, mode);
  return mode;
}
module.exports = { THEME_KEY, MODES, normalizeMode, resolveMode, loadAppearance, saveAppearance };
