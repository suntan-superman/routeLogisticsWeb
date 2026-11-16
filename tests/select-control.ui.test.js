const{test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');global.IS_REACT_ACT_ENVIRONMENT=true;
let tree,env;
const cache=new Map();
function load(name){
 if(cache.has(name))return cache.get(name);const module={exports:{}};
 const source=fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src/components',name+'.jsx'),'utf8');
 new Function('React','require','module','exports',transformSync(source,{loader:'jsx',format:'cjs'}).code)(React,specifier=>specifier==='react'?React:specifier==='./ThemedSelect'?load('ThemedSelect'):(()=>{throw Error('Unexpected dependency '+specifier);})(),module,module.exports);
 cache.set(name,module.exports);return module.exports;
}
const Select=load('SelectControl').default;
const option=(value,label,disabled=false)=>React.createElement('option',{key:value,value,disabled},label);
function Controlled(){const[value,setValue]=React.useState(env.initialValue);env.setValue=setValue;return React.createElement(Select,{...env.props,value,onChange:event=>{env.events.push(event);if(env.commit)setValue(event.target.value);}},env.options);}
const combo=()=>tree.root.findAll(node=>node.type==='input'&&node.props.role==='combobox')[0];
const choices=()=>tree.root.findAll(node=>node.type==='li'&&node.props.role==='option');
const choose=value=>choices().find(node=>node.props['data-option-value']===String(value));
const open=async()=>act(async()=>combo().props.onClick());
const key=async name=>{const event={key:name,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};await act(async()=>combo().props.onKeyDown(event));return event;};
async function render({controlled=true,...props}={}){
 env.props=props;await act(async()=>{tree=create(controlled?React.createElement(Controlled):React.createElement(Select,{...props,onChange:event=>env.events.push(event)},env.options),{createNodeMock:element=>{
  if(element.type==='input'&&element.props.role==='combobox')return env.input;
  if(element.type==='ul')return{children:Array.from({length:100},()=>({scrollIntoView:()=>env.scrolled++}))};
  return{contains:target=>target===env.input};
 }});});
}
beforeEach(()=>{
 tree=null;env={initialValue:'a',options:[option('a','Alpha'),option('b','Beta'),option('x','Blocked',true),option('g','Gamma')],props:{},events:[],commit:true,scrolled:0,focused:0,validity:'',fieldsetDisabled:false,listeners:new Set()};
 env.input={labels:[{textContent:'Implicit field label',cloneNode:()=>({textContent:'Implicit field label',querySelectorAll:()=>[]})}],focus:()=>env.focused++,select:()=>{},setCustomValidity:message=>{env.validity=message;},matches:selector=>selector===':disabled'&&env.fieldsetDisabled};
 global.document={addEventListener:(_event,listener)=>env.listeners.add(listener),removeEventListener:(_event,listener)=>env.listeners.delete(listener)};
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());assert.equal(env.listeners.size,0);delete global.document;});
test('the adapter keeps native-style string values, IDs, names, labels and change targets',async()=>{
 env.initialValue='0';env.options=[option(0,'Zero'),option(1,'One')];await render({id:'count',name:'quantity','aria-label':'Quantity',required:true});
 assert.equal(combo().props.id,'count');assert.equal(combo().props['aria-label'],'Quantity');assert.equal(combo().props.value,'Zero');assert.equal(combo().props['data-selected-value'],'0');
 const hidden=()=>tree.root.findAll(node=>node.type==='input'&&node.props.type==='hidden')[0];assert.equal(hidden().props.name,'quantity');assert.equal(hidden().props.value,'0');assert.equal(env.validity,'');
 await open();let prevented=false,stopped=false;await act(async()=>choose(1).props.onClick({preventDefault(){prevented=true;},stopPropagation(){stopped=true;}}));
 assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(env.events.length,1);assert.deepEqual(env.events[0].target,{id:'count',name:'quantity',value:'1',type:'select-one'});assert.equal(env.events[0].currentTarget,env.events[0].target);assert.equal(hidden().props.value,'1');assert.equal(combo().props.value,'One');assert.equal(choices().length,0);
});
test('controlled parents may reject a change without the displayed selection changing',async()=>{
 env.commit=false;await render();await open();await act(async()=>choose('b').props.onClick());assert.equal(env.events[0].target.value,'b');assert.equal(combo().props['data-selected-value'],'a');assert.equal(combo().props.value,'Alpha');
});
test('uncontrolled selections honor defaults and handle later option loading',async()=>{
 env.options=[];await render({controlled:false,defaultValue:'b'});assert.equal(combo().props.value,'');
 env.options=[option('x','Disabled',true),option('a','Alpha'),option('b','Beta')];await act(async()=>tree.update(React.createElement(Select,{defaultValue:'b',onChange:event=>env.events.push(event)},env.options)));assert.equal(combo().props.value,'Beta');
 await open();await act(async()=>choose('a').props.onClick());assert.equal(combo().props.value,'Alpha');assert.equal(env.events.length,1);
});
test('required empty choices stay invalid even when their placeholder label is visible',async()=>{
 env.initialValue='';env.options=[option('','Choose a service'),option('a','Alpha')];await render({required:true,'aria-describedby':'service-help'});
 assert.equal(combo().props.value,'Choose a service');assert.equal(combo().props.required,true);assert.equal(combo().props['aria-required'],true);assert.equal(combo().props['aria-describedby'],'service-help');assert.match(env.validity,/Choose an option/);
 await open();await act(async()=>choose('a').props.onClick());assert.equal(env.validity,'');await open();await act(async()=>choose('').props.onClick());assert.match(env.validity,/Choose an option/);assert.equal(combo().props['data-selected-value'],'');
});
test('disabled options and disabled fieldsets cannot commit a choice',async()=>{
 await render();await open();await act(async()=>choose('x').props.onClick());assert.equal(env.events.length,0);assert.equal(choose('x').props['aria-disabled'],true);
 env.fieldsetDisabled=true;await act(async()=>choose('b').props.onClick());assert.equal(env.events.length,0);await key('Enter');assert.equal(env.events.length,0);
});
test('conditional fragments and optgroup disabled state preserve user-friendly option labels',async()=>{
 env.options=[React.createElement(React.Fragment,{key:'f'},null,option('a','Alpha')),React.createElement('optgroup',{key:'group',label:'Unavailable group',disabled:true},option('b','Beta')),React.createElement('option',{key:'label',value:'g',label:'Friendly gamma'},'Internal gamma')];
 await render();await open();assert.deepEqual(choices().map(node=>[node.props['data-option-value'],node.props['data-option-label']]),[['a','Alpha'],['b','Beta'],['g','Friendly gamma']]);assert.equal(choose('b').props['aria-disabled'],true);
});
test('search and keyboard selection commit only enabled choices and maintain green highlights',async()=>{
 await render();await open();assert.match(choose('a').props.className,/bg-primary-700 text-white/);await key('ArrowDown');assert.match(choose('b').props.className,/bg-primary-700 text-white/);await key('ArrowDown');assert.match(choose('g').props.className,/bg-primary-700 text-white/);
 await key('Home');assert.match(choose('a').props.className,/bg-primary-700 text-white/);await key('End');assert.match(choose('g').props.className,/bg-primary-700 text-white/);await key('Enter');assert.equal(combo().props['data-selected-value'],'g');assert.equal(choices().length,0);
 await open();await act(async()=>combo().props.onChange({target:{value:'Bet'}}));assert.equal(choices().length,1);assert.equal(combo().props['data-selected-value'],'g');await key('Enter');assert.equal(combo().props['data-selected-value'],'b');
});
test('Escape restores the current choice and Tab closes without trapping focus or changing data',async()=>{
 await render();await open();await act(async()=>combo().props.onChange({target:{value:'no-match'}}));assert.equal(choices().length,0);const escape=await key('Escape');assert.equal(escape.prevented,true);assert.equal(escape.stopped,true);assert.equal(combo().props.value,'Alpha');assert.equal(env.events.length,0);
 await open();const tab=await key('Tab');assert.equal(tab.prevented,undefined);assert.equal(choices().length,0);assert.equal(combo().props['data-selected-value'],'a');
});
test('implicit accessible labels remain stable while the menu is open',async()=>{
 await render();assert.equal(combo().props['aria-label'],'Implicit field label');await open();assert.equal(combo().props['aria-label'],'Implicit field label');assert.equal(tree.root.findByProps({role:'listbox'}).props['aria-label'],'Implicit field label options');
});
test('all application-owned dropdown sources use the shared green control',()=>{
 const root=path.resolve(__dirname,'../routeLogisticsWeb/src');let native=0;const visit=directory=>{for(const row of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,row.name);if(row.isDirectory())visit(file);else if(/\.(jsx|js)$/.test(file)&&/<select\b/.test(fs.readFileSync(file,'utf8')))native++;}};visit(root);assert.equal(native,0);
});
