const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT=true;
let tree,owner=true,calls=[],data;
const modules=new Map();
function load(relative){const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(modules.has(file))return modules.get(file);const module={exports:{}};const mock=name=>{
  if(name==='react')return React;
  if(name.endsWith('/AuthContext'))return {useAuth:()=>({company:{id:'co',ownerId:'owner'},currentUser:{uid:owner?'owner':'manager'}})};
  if(name.endsWith('/workspaceApi'))return {callWorkspace:async(name,params)=>{calls.push({name,params});return data;}};
  if(name.startsWith('.')){const resolved=path.resolve(path.dirname(file),name);return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),path.extname(resolved)?resolved:fs.existsSync(resolved+'.jsx')?resolved+'.jsx':resolved+'.js'));}
  throw Error('Unexpected dependency '+name);
};const {code}=transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.jsx')?'jsx':'js',format:'cjs'});new Function('React','require','module','exports',code)(React,mock,module,module.exports);modules.set(file,module.exports);return module.exports;}
const Settings=load('components/SmsSettings.jsx').default,Consent=load('components/CustomerSmsConsent.jsx').default;
const text=()=>JSON.stringify(tree.toJSON());
const labels=['appointment-confirmation','pre-visit','en-route','service-completed','service-follow-up'];
const status=()=>({settings:{enabled:false,timeZone:'America/Los_Angeles',reminderMinutes:1440,followUpMinutes:1440,purposes:labels.slice(0,4),templates:Object.fromEntries(labels.map(p=>[p,'Your service visit update.']))},delivery:{active:false,senderApproved:false,automationApproved:false},consent:null,disclosure:'Synthetic customer SMS disclosure.',history:[]});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;owner=true;calls=[];});
test('SMS settings cannot activate live delivery and managers cannot edit owner configuration',async()=>{
  owner=false;data=status();await act(async()=>{tree=create(React.createElement(Settings));});assert.equal(calls.length,0);assert.match(text(),/owner manages SMS/);assert.equal(tree.root.findAllByType('input').length,0);
  await act(async()=>tree.unmount());tree=null;owner=true;
  await act(async()=>{tree=create(React.createElement(Settings));});assert.match(text(),/Disabled or awaiting operator approval/);assert.match(text(),/Saving these settings cannot activate/);
  assert.equal(tree.root.findAll(node=>node.type==='button'&&/send/i.test(node.children.join(''))).length,0);
});
test('customer consent starts unselected and requires disclosure, purpose and evidence rather than phone presence',async()=>{
  data=status();await act(async()=>{tree=create(React.createElement(Consent,{customer:{id:'customer',phone:'+16615550101'}}));});
  const inputs=tree.root.findAllByType('input');assert.ok(inputs.filter(node=>node.props.type==='checkbox').every(node=>node.props.checked===false));
  const record=()=>tree.root.findAll(node=>node.type==='button'&&node.children.includes('Record customer consent'))[0];assert.equal(record().props.disabled,true);
  await act(async()=>inputs[0].props.onChange({target:{checked:true}}));
  await act(async()=>tree.root.findByProps({'aria-label':'SMS consent evidence reference'}).props.onChange({target:{value:'Signed form reference'}}));
  await act(async()=>tree.root.findAllByType('input').filter(node=>node.props.type==='checkbox').at(-1).props.onChange({target:{checked:true}}));assert.equal(record().props.disabled,false);
  data={consent:{status:'granted',purposes:['appointment-confirmation']}};await act(async()=>record().props.onClick());
  const grant=calls.find(call=>call.params.action==='grant');assert.deepEqual(grant.params.purposes,['appointment-confirmation']);assert.equal(grant.params.disclosureAccepted,true);assert.equal(grant.params.disclosure,'Synthetic customer SMS disclosure.');assert.match(text(),/No message was sent/);
});
test('suppressed customer numbers cannot be silently reconsented by staff',async()=>{
  data={...status(),suppressed:true,consent:{status:'stopped',purposes:['pre-visit']}};await act(async()=>{tree=create(React.createElement(Consent,{customer:{id:'customer'}}));});
  assert.match(text(),/Staff cannot override STOP/);assert.equal(tree.root.findByType('fieldset').props.disabled,true);assert.equal(calls.some(call=>call.params.action==='grant'),false);
});
