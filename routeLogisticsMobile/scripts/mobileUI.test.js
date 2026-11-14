const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), React = require('react');
const { create, act } = require('react-test-renderer'), babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
const cache = new Map(), native = Object.fromEntries(['View', 'Text', 'Pressable', 'ActivityIndicator', 'TextInput'].map(name => [name, name]));
native.StyleSheet = { create: value => value };
let dark = false, tree;
const palette = { background: '#F2F7F5', surface: '#FFF', text: '#142B23', secondary: '#526C60', border: '#DDD', input: '#EEF5F1', accent: '#087B55', button: '#087B55', danger: '#AD3030' };
function load(relative) {
 const filename = path.resolve(__dirname, '..', relative); if(cache.has(filename)) return cache.get(filename).exports;
 const module = { exports: {} }; cache.set(filename, module);
 const requireMock = name => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if(name === 'react') return React;
  if(name === 'react-native') return native;
  if(name === '@expo/vector-icons') return { Ionicons: 'Icon' };
  if(name === 'react-native-safe-area-context') return { SafeAreaView: 'SafeAreaView' };
  if(name.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette: dark ? { ...palette, background: '#07120F', surface: '#14241F', text: '#EFFAF5', secondary: '#B0C8BE' } : palette, isDark: dark }) };
  if(name.startsWith('.')) return load(path.relative(path.resolve(__dirname,'..'), path.resolve(path.dirname(filename), name + (name.endsWith('.js') ? '' : '.js'))));
  throw Error('Unexpected dependency '+name);
 };
 const code=babel.transformSync(fs.readFileSync(filename,'utf8'),{filename,configFile:false,babelrc:false,presets:[[require.resolve('babel-preset-expo'),{jsxRuntime:'classic'}]],plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 new Function('require','module','exports',code)(requireMock,module,module.exports); return module.exports;
}
const UI=load('components/MobileUI.js'),Glass=load('components/Glass.js');
async function render(Component,props){await act(async()=>{tree=create(React.createElement(Component,props))});return tree;}
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;dark=false;});

test('job cards expose clear accessible actions and statuses without financial fields',async()=>{
 let opened=0;await render(UI.JobCard,{job:{id:'job',customerName:'Customer',serviceType:'Inspection',date:'2026-11-13',time:'15:00',status:'in-progress',estimatedCost:999,totalCost:999},onPress:()=>opened++});
 const button=tree.root.findByType('Pressable');assert.equal(button.props.accessibilityRole,'button');assert.match(button.props.accessibilityLabel,/Open job for Customer/);
 await act(async()=>button.props.onPress());assert.equal(opened,1);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/999/);
 assert.match(JSON.stringify(tree.toJSON()),/In progress/);
});

test('buttons and fields provide accessible targets and solid readable surfaces in either appearance',async()=>{
 for(const isDark of [false,true]){
  dark=isDark;await render(UI.PrimaryButton,{title:'Start work'});
  const button=tree.root.findByType('Pressable'),style=button.props.style({pressed:false});assert.equal(button.props.accessibilityLabel,'Start work');assert.ok(style[0].minHeight>=44);
  await act(async()=>tree.unmount());tree=null;await render(UI.Card,{children:React.createElement('Text',null,'Work order')});
  assert.equal(tree.root.findAllByType('BlurView').length,0);assert.equal(tree.root.findAllByType('LinearGradient').length,0);
  await act(async()=>tree.unmount());tree=null;
 }
 await render(Glass.GlassInput,{label:'Work notes',multiline:true,value:'Saved',onChangeText(){}});
 const field=tree.root.findByType('TextInput');assert.equal(field.props.accessibilityLabel,'Work notes');assert.ok(field.props.style[0].minHeight>=100);assert.equal(field.props.maxFontSizeMultiplier,undefined);
});

test('screen headers and status labels remain explicit and safe-area edges are configurable',async()=>{
 await render(UI.ScreenHeader,{title:'Today',subtitle:'Your assigned work',onBack(){}});
 assert.ok(tree.root.findAll(node=>node.type==='Text'&&node.props.accessibilityRole==='header').length);
 assert.equal(tree.root.findByType('Pressable').props.accessibilityLabel,'Back from Today');
 await act(async()=>tree.unmount());tree=null;await render(UI.StatusBadge,{status:'cancelled'});assert.match(JSON.stringify(tree.toJSON()),/Cancelled/);
 await act(async()=>tree.unmount());tree=null;await render(Glass.GlassScreen,{edges:[],children:React.createElement('Text',null,'Embedded content')});assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,[]);
});
