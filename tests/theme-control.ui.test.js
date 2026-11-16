const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const cache = new Map();
function useTheme() {
  const [preference, set] = React.useState(env.initial);
  return { preference, theme: preference === 'system' ? env.systemTheme : preference, setPreference: next => { env.changes.push(next); set(next); } };
}
function load(name) {
  if (cache.has(name)) return cache.get(name);
  const module = { exports: {} };
  const importer = source => source === 'react' ? React : source.endsWith('/ThemeContext') ? { useTheme } : source === './ThemedSelect' ? load('ThemedSelect') : (() => { throw Error('Unexpected appearance dependency: ' + source); })();
  new Function('React', 'require', 'module', 'exports', transformSync(fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src/components', name + '.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code)(React, importer, module, module.exports);
  cache.set(name, module.exports); return module.exports;
}
const Control = load('ThemeControl').default;
const combo = () => tree.root.findByProps({ role: 'combobox' });
const options = () => tree.root.findAll(node => node.type === 'li' && node.props.role === 'option');
const key = async value => { const event = { key: value, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; await act(async () => combo().props.onKeyDown(event)); return event; };
const mount = async () => act(async () => { tree = create(React.createElement(Control), { createNodeMock: element => element.type === 'input' ? { matches: () => false, focus() {}, select() {}, setCustomValidity() {} } : element.type === 'ul' ? { children: Array.from({ length: 3 }, () => ({ scrollIntoView() {} })) } : { contains: () => false } }); });
beforeEach(() => { env = { initial: 'system', systemTheme: 'dark', changes: [], listeners: new Set() }; global.document = { addEventListener: (_, listener) => env.listeners.add(listener), removeEventListener: (_, listener) => env.listeners.delete(listener) }; });
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; assert.equal(env.listeners.size, 0); delete global.document; });

test('appearance control exposes the stored preference independently of the resolved system theme', async () => {
  await mount(); assert.equal(combo().props['aria-label'], 'Appearance'); assert.equal(combo().props.value, 'System'); assert.equal(combo().props['data-selected-value'], 'system'); assert.equal(combo().props.readOnly, true); assert.equal(combo().props.title, 'Choose light, dark or system appearance'); assert.deepEqual(env.changes, []);
});
test('Light, Dark and System selections forward only the explicit browser preference to the theme hook', async () => {
  env.initial = 'dark'; await mount(); assert.equal(combo().props.value, 'Dark');
  for (const preference of ['light', 'dark', 'system']) {
    await act(async () => combo().props.onClick()); const choice = options().find(node => node.props['data-option-value'] === preference); assert.ok(choice); await act(async () => choice.props.onClick()); assert.equal(combo().props['data-selected-value'], preference); assert.equal(combo().props['aria-expanded'], false);
  }
  assert.deepEqual(env.changes, ['light', 'dark', 'system']);
});
test('keyboard selection uses the existing green menu and never submits its enclosing form', async () => {
  await mount(); const opened = await key('Enter'); assert.equal(opened.prevented, true); assert.equal(options().length, 3); await key('End'); const active = options().find(node => node.props['data-option-value'] === 'dark'); assert.match(active.props.className, /bg-primary-700 text-white/); const selected = await key('Enter'); assert.equal(selected.prevented, true); assert.equal(combo().props.value, 'Dark'); assert.deepEqual(env.changes, ['dark']);
});
test('Escape cancels a pending appearance selection and removes its menu overlay', async () => {
  env.initial = 'light'; await mount(); await key('Enter'); await key('End'); const event = await key('Escape'); assert.equal(event.prevented, true); assert.equal(event.stopped, true); assert.equal(options().length, 0); assert.equal(combo().props.value, 'Light'); assert.deepEqual(env.changes, []);
});
