const THEME_KEY = 'rl-appearance-v1';
const DENSITY_KEY = 'rl-display-density-v1';
const { DENSITIES } = require('./designTokens');
const MODES = ['system', 'light', 'dark'];
const normalizeMode = mode => MODES.includes(mode) ? mode : 'system';
const resolveMode = (mode, system) => normalizeMode(mode) === 'system' ? (system === 'dark' ? 'dark' : 'light') : mode;
async function loadAppearance(storage) { return normalizeMode(await storage.getItem(THEME_KEY)); }
async function saveAppearance(storage, mode) {
  if (!MODES.includes(mode)) throw new Error('Choose System, Light, or Dark.');
  await storage.setItem(THEME_KEY, mode);
  return mode;
}
async function loadDensity(storage) {
  const value = await storage.getItem(DENSITY_KEY);
  if (DENSITIES.includes(value)) return value;
  // An existing appearance preference identifies an established installation.
  // Keep its familiar spacing until the owner chooses a density explicitly.
  return await storage.getItem(THEME_KEY) === null ? 'compact' : 'comfortable';
}
async function saveDensity(storage, density) {
  if (!DENSITIES.includes(density)) throw new Error('Choose Compact, Comfortable, or Large.');
  await storage.setItem(DENSITY_KEY, density);
  return density;
}
module.exports = { THEME_KEY, DENSITY_KEY, MODES, DENSITIES, normalizeMode, resolveMode, loadAppearance, saveAppearance, loadDensity, saveDensity };
