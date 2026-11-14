const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),React=require('react'),{create,act}=require('react-test-renderer'),babel=require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT=true;
const template=require('../../functions/shared/serviceTemplates.json').find(row=>row.id==='pool-maintenance');
let tree,server,rows,listeners,drafts,busyStates,saves,failure,manager;
const panel=({title,subtitle,children})=>React.createElement('View',null,title&&React.createElement('Text',null,title),subtitle&&React.createElement('Text',null,subtitle),children);
const button=({title,onPress,disabled})=>React.createElement('Pressable',{accessibilityLabel:title,onPress,disabled},React.createElement('Text',null,title));
const file=path.resolve(__dirname,'../components/ServiceChecklist.js'),moduleUnderTest={exports:{}};
const requireMock=name=>{
  if(name.startsWith('@babel/runtime/'))return require(name);
  if(name==='react')return React;
  if(name==='react-native')return{View:'View',Text:'Text',Pressable:'Pressable'};
  if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({permissions:{canManage:manager}})};
  if(name.endsWith('/theme/ThemeProvider'))return{useTheme:()=>({palette:{text:'#FFF',secondary:'#CCC',accent:'#0F0'}})};
  if(name.endsWith('/services/workspaceApi'))return{callWorkspace:async(_name,data)=>data.action==='catalog'?{templates:[template]}:server};
  if(name.endsWith('/services/offline'))return{cachedRead:(_key,loader)=>loader(),queuedWork:async()=>rows,subscribeOffline:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},saveServiceFormOffline:async(job,record)=>{if(failure)throw failure;saves.push({job,record});rows=[{id:'saved',kind:'service-form',jobId:job.id,record,state:'pending'}];}};
  if(name==='../../functions/shared/serviceFormSchema')return require('../../functions/shared/serviceFormSchema');
  if(name==='./MobileUI')return{Card:panel,SectionHeader:panel,PrimaryButton:button,SecondaryButton:button,FormField:({label,...props})=>React.createElement('TextInput',{accessibilityLabel:label,...props}),InlineNotice:({message})=>React.createElement('Text',null,message)};
  throw new Error(name);
};
new Function('require','module','exports',babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,configFile:false,babelrc:false,presets:[[require.resolve('babel-preset-expo'),{jsxRuntime:'classic'}]],plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code)(requireMock,moduleUnderTest,moduleUnderTest.exports);
const Checklist=moduleUnderTest.exports.default,job={id:'assigned',companyId:'acme',assignedTo:'member',status:'in-progress',totalCost:9999};
const props=()=>({job,onDraftChange:value=>drafts.push(value),onBusyChange:value=>busyStates.push(value)});
async function render(){await act(async()=>{tree=create(React.createElement(Checklist,props()));});}
const control=label=>tree.root.findAll(node=>node.type==='Pressable'&&node.props.accessibilityLabel===label)[0];
async function press(label){const node=control(label);assert.ok(node,label);assert.notEqual(node.props.disabled,true);await act(async()=>node.props.onPress());}
async function input(label,value){await act(async()=>tree.root.findByProps({accessibilityLabel:label}).props.onChangeText(value));}
const text=()=>JSON.stringify(tree.toJSON());
beforeEach(()=>{tree=null;manager=false;server={enabled:true,form:{template,assignmentVersion:1,responseVersion:0,serviceDate:'2026-11-13',answers:{},status:'draft'},reports:[],photos:[{id:'private-photo-id',caption:'Equipment inspection'}]};rows=[];listeners=new Set();drafts=[];busyStates=[];saves=[];failure=null;});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());assert.equal(listeners.size,0);});
test('technician service form renders safe units, choices and private photo labels without management or pricing',async()=>{
  await render();assert.match(text(),/Free chlorine/);assert.match(text(),/ppm/);assert.match(text(),/Equipment inspection/);assert.doesNotMatch(text(),/9999|private-photo-id|Use Pool maintenance/);
  assert.ok(control('Normal'));assert.ok(control('Skimmed'));assert.equal(tree.root.findByProps({accessibilityLabel:'Equipment inspection'}).props.accessibilityRole,'checkbox');
});
test('required validation and persistence errors retain answers until a durable service report is queued',async()=>{
  await render();await press('Finalize service report');assert.match(text(),/pH reading is required/);assert.equal(saves.length,0);
  await input('pH reading','7.4');await input('Free chlorine','3');await press('Normal');assert.equal(drafts.at(-1),true);
  failure=new Error('Device storage unavailable.');await press('Finalize service report');assert.match(text(),/Device storage unavailable/);assert.equal(drafts.at(-1),true);
  failure=null;await press('Finalize service report');assert.equal(saves.length,1);assert.equal(saves[0].record.answers.ph,7.4);assert.equal(saves[0].record.templateVersion,1);assert.equal(saves[0].record.status,'completed');
  assert.equal(drafts.at(-1),false);assert.equal(busyStates.at(-1),false);assert.match(text(),/Service report pending/);assert.equal(control('Finalize service report'),undefined);
});
test('refresh preserves an unsaved draft and changed template requires explicit review',async()=>{
  await render();await input('pH reading','7.8');server={...server,form:{...server.form,answers:{ph:7.2}}};await press('Refresh service checklist');
  assert.equal(tree.root.findByProps({accessibilityLabel:'pH reading'}).props.value,'7.8');
  server={...server,form:{...server.form,assignmentVersion:2}};await press('Refresh service checklist');assert.match(text(),/assigned template changed online/);assert.equal(drafts.at(-1),true);
});
test('disabled or closed jobs keep read-only reports without service submission controls',async()=>{
  server.enabled=false;await render();assert.match(text(),/not enabled yet/);assert.equal(control('Save service draft'),undefined);assert.equal(control('Finalize service report'),undefined);
});
