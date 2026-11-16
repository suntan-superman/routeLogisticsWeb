import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createThemeStore, normalizePreference, readThemePreference, resolveTheme, THEME_STORAGE_KEY } from './theme.js';

function environment({ stored, dark = false, blocked = false, legacy = false } = {}) {
  const values = new Map(stored === undefined ? [] : [[THEME_STORAGE_KEY, stored]]), events = new Map(), changes = new Set(), classes = new Set();
  const meta = {}, root = { dataset: {}, style: {}, classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } };
  const document = { documentElement: root, querySelector: () => ({ setAttribute: (key, value) => { meta[key] = value; } }) };
  const storage = { getItem: key => { if (blocked) throw Error('Blocked'); return values.get(key) ?? null; }, setItem: (key, value) => { if (blocked) throw Error('Blocked'); values.set(key, value); } };
  const media = { matches: dark, ...(legacy ? { addListener: fn => changes.add(fn), removeListener: fn => changes.delete(fn) } : { addEventListener: (_event, fn) => changes.add(fn), removeEventListener: (_event, fn) => changes.delete(fn) }) };
  const browser = { document, localStorage: storage, matchMedia: () => media, addEventListener: (event, fn) => events.set(event, fn), removeEventListener: event => events.delete(event) };
  return { browser, root, meta, classes, values, changes, events, storage, media,
    os: matches => { media.matches = matches; changes.forEach(fn => fn({ matches })); },
    remote: value => { if (value === null) values.delete(THEME_STORAGE_KEY); else values.set(THEME_STORAGE_KEY, value); events.get('storage')?.({ key: THEME_STORAGE_KEY, newValue: value, storageArea: storage }); } };
}
test('appearance accepts only its own bounded preferences and invalid/unavailable storage follows the system', () => {
  for (const value of [null, undefined, 'DARK', '{}', '<script>', '']) assert.equal(normalizePreference(value), 'system');
  for (const value of ['system', 'light', 'dark']) assert.equal(normalizePreference(value), value);
  assert.equal(readThemePreference({ getItem: () => { throw Error('Blocked'); } }), 'system');
  assert.equal(resolveTheme('system', true), 'dark'); assert.equal(resolveTheme('light', true), 'light'); assert.equal(resolveTheme('dark', false), 'dark');
});
test('system mode responds to OS changes without creating a saved preference', () => {
  const f = environment({ dark: true }), store = createThemeStore(f.browser), stop = store.start(); let notifications = 0; store.subscribe(() => notifications++);
  assert.deepEqual(store.getSnapshot(), { preference: 'system', theme: 'dark' }); assert.equal(f.root.dataset.theme, 'dark'); assert.equal(f.root.style.colorScheme, 'dark'); assert(f.classes.has('dark'));
  f.os(false); assert.deepEqual(store.getSnapshot(), { preference: 'system', theme: 'light' }); assert.equal(f.meta.content, '#f9fafb'); assert.equal(f.values.size, 0); assert.equal(notifications, 1);
  stop(); f.os(true); assert.equal(store.getSnapshot().theme, 'light'); assert.equal(f.changes.size, 0); assert.equal(f.events.size, 0);
});
test('explicit mode persists through a fresh store and ignores subsequent OS changes', () => {
  const f = environment(), first = createThemeStore(f.browser), stop = first.start();
  assert.equal(first.setPreference('dark'), true); assert.equal(f.values.get(THEME_STORAGE_KEY), 'dark'); f.os(false); assert.equal(first.getSnapshot().theme, 'dark'); stop();
  const reloaded = createThemeStore(f.browser), cleanup = reloaded.start(); assert.equal(reloaded.getSnapshot().preference, 'dark'); assert.equal(f.root.style.backgroundColor, '#071510');
  assert.equal(reloaded.setPreference('invalid'), false); assert.equal(reloaded.getSnapshot().theme, 'dark'); reloaded.setPreference('system'); f.os(false); assert.equal(reloaded.getSnapshot().theme, 'light'); cleanup();
});
test('storage changes synchronize tabs, reset on removal and ignore unrelated/authentication keys', () => {
  const f = environment({ dark: true }), store = createThemeStore(f.browser), cleanup = store.start();
  f.remote('light'); assert.deepEqual(store.getSnapshot(), { preference: 'light', theme: 'light' });
  f.events.get('storage')({ key: 'firebase-auth-state', newValue: 'dark', storageArea: f.storage }); assert.equal(store.getSnapshot().preference, 'light');
  f.remote(null); assert.deepEqual(store.getSnapshot(), { preference: 'system', theme: 'dark' });
  f.remote('invalid'); assert.equal(store.getSnapshot().preference, 'system'); cleanup();
});
test('blocked storage still permits a current-page choice and does not discard it on an OS change', () => {
  const f = environment({ blocked: true }), store = createThemeStore(f.browser), cleanup = store.start();
  assert.equal(store.setPreference('dark'), false); f.os(false); assert.equal(store.getSnapshot().theme, 'dark'); assert.equal(f.root.dataset.theme, 'dark'); cleanup();
});
test('legacy media listeners and strict-mode start/stop cycles do not duplicate observers', () => {
  const f = environment({ legacy: true }), store = createThemeStore(f.browser), first = store.start(); first(); const second = store.start();
  assert.equal(f.changes.size, 1); f.os(true); assert.equal(store.getSnapshot().theme, 'dark'); second(); assert.equal(f.changes.size, 0);
});
test('snapshot identity remains stable unless appearance actually changes and unsubscribed observers stay quiet', () => {
  const f = environment(), store = createThemeStore(f.browser), cleanup = store.start(); let count = 0; const unsubscribe = store.subscribe(() => count++), original = store.getSnapshot();
  f.os(false); assert.equal(store.getSnapshot(), original); store.setPreference('dark'); assert.equal(count, 1); unsubscribe(); store.setPreference('light'); assert.equal(count, 1); cleanup();
});
test('the blocking bootstrap and React controller resolve the same initial theme before the application module', () => {
  const script = fs.readFileSync(new URL('../../public/theme-init.js', import.meta.url), 'utf8'), html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert(html.indexOf('src="/theme-init.js"') < html.indexOf('src="/src/main.jsx"'));
  for (const options of [{ dark: true }, { stored: 'dark' }, { stored: 'light', dark: true }, { stored: 'invalid', dark: true }, { blocked: true, dark: true }]) {
    const f = environment(options); vm.runInNewContext(script, { window: f.browser, document: f.browser.document });
    assert.equal(f.root.dataset.theme, createThemeStore(f.browser).getSnapshot().theme); assert.equal(f.root.style.colorScheme, f.root.dataset.theme);
  }
});
