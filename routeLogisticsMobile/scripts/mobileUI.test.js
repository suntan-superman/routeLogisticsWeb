const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), React = require('react');
const { create, act } = require('react-test-renderer'), babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
const cache = new Map(), native = Object.fromEntries(['View', 'Text', 'Pressable', 'ActivityIndicator', 'TextInput', 'ScrollView', 'KeyboardAvoidingView'].map(name => [name, name]));
native.StyleSheet = { create: value => value };
native.Platform = { OS: 'android' };
const backHandlers = new Set(), keyboardHandlers = new Map(), announcements = [], focusTargets = [];
let keyboardDismissals = 0;
native.BackHandler = { addEventListener: (_event, handler) => { backHandlers.add(handler); return { remove: () => backHandlers.delete(handler) }; } };
native.Keyboard = { dismiss: () => { keyboardDismissals++; }, addListener: (event, handler) => { const rows=keyboardHandlers.get(event)||new Set();rows.add(handler);keyboardHandlers.set(event,rows);return{remove:()=>{rows.delete(handler);if(!rows.size)keyboardHandlers.delete(event);}}; } };
native.AccessibilityInfo = { announceForAccessibility: value => announcements.push(value), setAccessibilityFocus: value => focusTargets.push(value) };
native.findNodeHandle = node => node.nativeTag;
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
async function render(Component,props,options){await act(async()=>{tree=create(React.createElement(Component,props),options)});return tree;}
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;dark=false;assert.equal(backHandlers.size,0);assert.equal(keyboardHandlers.size,0);announcements.length=0;focusTargets.length=0;keyboardDismissals=0;});

test('job cards expose clear accessible actions and statuses without financial fields',async()=>{
 let opened=0;await render(UI.JobCard,{job:{id:'job',customerName:'Customer',serviceType:'Inspection',date:'2026-11-13',time:'15:00',status:'in-progress',estimatedCost:999,totalCost:999},onPress:()=>opened++});
 const button=tree.root.findByType('Pressable');assert.equal(button.props.accessibilityRole,'button');assert.match(button.props.accessibilityLabel,/Open job for Customer/);
 await act(async()=>button.props.onPress());assert.equal(opened,1);assert.doesNotMatch(JSON.stringify(tree.toJSON()),/999/);
 assert.match(JSON.stringify(tree.toJSON()),/In progress/);
});

test('estimate visits use the normal job card with a distinct badge and outcome while historical service cards stay unchanged',async()=>{
 const record={id:'estimate',customerName:'Prospect',serviceType:'Pest assessment',appointmentKind:'estimate_visit',billable:false,estimateOutcome:'quote_needed',address:'Old billing address',serviceProperty:{address:'Selected rental property'},date:'2026-11-16',time:'09:00',status:'completed'};
 await render(UI.JobCard,{job:record,onPress(){}});const text=JSON.stringify(tree.toJSON());assert.match(text,/Estimate Visit/);assert.match(text,/quote needed/);assert.match(text,/Selected rental property/);assert.doesNotMatch(text,/Old billing address/);assert.match(tree.root.findByType('Pressable').props.accessibilityLabel,/Estimate Visit/);
 await act(async()=>tree.unmount());tree=null;await render(UI.JobCard,{job:{...record,appointmentKind:undefined,estimateOutcome:undefined},onPress(){}});assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Estimate Visit|quote needed/);
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

test('keyboard-aware scrolling keeps multiline Android editors reachable above the keyboard',async()=>{
 const scrollRef=React.createRef(),scrollTo=()=>{},reveals=[];
 await render(UI.KeyboardAwareScrollView,{scrollRef,testID:'keyboard-form',children:React.createElement(Glass.GlassInput,{label:'Android multiline notes',multiline:true,value:'Retained text',onChangeText(){}})},{createNodeMock:element=>element.type==='ScrollView'?{scrollTo,scrollResponderScrollNativeHandleToKeyboard:(...args)=>reveals.push(args)}:element.type==='TextInput'?{nativeTag:77}:null});
 let scroll=tree.root.findByType('ScrollView');
 assert.equal(tree.root.findAllByType('KeyboardAvoidingView').length,0);
 assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');
 assert.equal(scroll.props.keyboardDismissMode,'on-drag');
 assert.equal(scroll.props.automaticallyAdjustKeyboardInsets,false);
 assert.equal(scrollRef.current.scrollTo,scrollTo);
 const styles=scroll.props.contentContainerStyle;assert.ok(Array.isArray(styles));assert.ok(styles.some(value=>value?.paddingBottom===24));
 await act(async()=>{tree.root.findByType('TextInput').props.onFocus({});for(const handler of keyboardHandlers.get('keyboardDidShow')||[])handler({endCoordinates:{height:312}});await new Promise(resolve=>setTimeout(resolve,5));});
 scroll=tree.root.findByType('ScrollView');assert.ok(scroll.props.contentContainerStyle.some(value=>value?.paddingBottom===36));assert.ok(reveals.some(args=>args[0]===77&&args[1]===28&&args[2]===true));
 assert.equal(tree.root.findByType('TextInput').props.value,'Retained text');
});

test('invalid glass inputs are visibly and accessibly identified beside the field',async()=>{
 await render(Glass.GlassInput,{label:'Scope of work',multiline:true,value:'',error:'Scope of work is required.',onChangeText(){}});
 const field=tree.root.findByType('TextInput');assert.equal(field.props.accessibilityInvalid,true);
 assert.equal(tree.root.findAll(node=>node.type==='Text'&&node.props.accessibilityRole==='alert')[0].children.join(''),'Scope of work is required.');
 const wrapper=field.parent;assert.equal(wrapper.props.style.borderColor,palette.danger);
});

test('screen headers and status labels remain explicit and safe-area edges are configurable',async()=>{
 await render(UI.ScreenHeader,{title:'Today',subtitle:'Your assigned work',onBack(){}});
 assert.ok(tree.root.findAll(node=>node.type==='Text'&&node.props.accessibilityRole==='header').length);
 assert.equal(tree.root.findByType('Pressable').props.accessibilityLabel,'Back from Today');
 await act(async()=>tree.unmount());tree=null;await render(UI.StatusBadge,{status:'cancelled'});assert.match(JSON.stringify(tree.toJSON()),/Cancelled/);
 await act(async()=>tree.unmount());tree=null;await render(Glass.GlassScreen,{edges:[],children:React.createElement('Text',null,'Embedded content')});assert.deepEqual(tree.root.findByType('SafeAreaView').props.edges,[]);
});

test('action feedback is a screen overlay with its own scrolling, accessible focus and no native modal',async()=>{
 let closed=0;
 await render(UI.ActionDialog,{title:'Review unfinished work',message:'Product application draft is optional.',onClose:()=>closed++,children:React.createElement('Text',null,'Keep editing')},{createNodeMock:element=>element.type==='Text'?{nativeTag:42}:null});
 const overlay=tree.root.findByProps({testID:'action-dialog'});
 assert.equal(overlay.type,'View');assert.equal(overlay.props.style.position,'absolute');assert.equal(overlay.props.style.top,0);assert.equal(overlay.props.style.bottom,0);
 assert.equal(overlay.props.accessibilityViewIsModal,true);assert.equal(tree.root.findAllByType('Modal').length,0);
 assert.equal(tree.root.findAllByType('ScrollView').length,1);assert.deepEqual(focusTargets,[42]);assert.equal(keyboardDismissals,1);
 assert.match(announcements[0],/Review unfinished work.*Product application/);
 await act(async()=>tree.root.findByProps({testID:'action-dialog-backdrop'}).props.onPress());assert.equal(closed,1);
 await act(async()=>overlay.props.onAccessibilityEscape());assert.equal(closed,2);
});

test('busy action feedback traps Android back and backdrop without firing old close callbacks',async()=>{
 let closed=0;
 const props={title:'Saving completion',message:'Please wait.',busy:true,onClose:()=>closed++};
 await render(UI.ActionDialog,props);
 assert.equal(backHandlers.size,1);
 assert.equal([...backHandlers][0](),true);assert.equal(closed,0);
 const backdrop=tree.root.findByProps({testID:'action-dialog-backdrop'});
 assert.equal(backdrop.props.disabled,true);
 await act(async()=>backdrop.props.onPress());assert.equal(closed,0);
 assert.equal(tree.root.findByType('ActivityIndicator').props.accessibilityLabel,'Saving changes');
 await act(async()=>tree.update(React.createElement(UI.ActionDialog,{...props,busy:false,onClose:()=>{closed+=10;}})));
 await act(async()=>{assert.equal([...backHandlers][0](),true);});
 assert.equal(closed,10);assert.equal(backHandlers.size,1);
});
