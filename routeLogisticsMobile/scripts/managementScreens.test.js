const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),React=require(path.join(root,'node_modules/react')), {act,create}=require(path.join(root,'node_modules/react-test-renderer'));
const babel=require(path.join(root,'node_modules/@babel/core'));global.IS_REACT_ACT_ENVIRONMENT=true;
const palette={text:'#123',secondary:'#456',accent:'#087',surface:'#fff',input:'#eee',border:'#ddd',danger:'#a00',background:'#fff',button:'#087',glow:'#dfd'};
let tree,user,permissions,context,data,calls,routeData,operations,view,interactions,mapFits,platform;
const native={View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',RefreshControl:'RefreshControl',ActivityIndicator:'ActivityIndicator',TextInput:'TextInput',StyleSheet:{create:x=>x},Linking:{openURL:async url=>calls.push(['web',url])},Platform:{get OS(){return platform;}}};
const modules=new Map();
function load(relative){
 const file=path.join(root,relative);if(modules.has(file))return modules.get(file).exports;const module={exports:{}};modules.set(file,module);
 const importer=name=>{
  if(name==='react')return React;if(name==='react-native')return native;
  if(name==='@expo/vector-icons')return{Ionicons:'Icon'};if(name==='react-native-safe-area-context')return{SafeAreaView:'SafeAreaView',useSafeAreaInsets:()=>({top:0,right:0,bottom:0,left:0})};
  if(name==='@react-native-community/datetimepicker')return{__esModule:true,default:'DateTimePicker'};
  if(name==='expo-constants')return{__esModule:true,default:{expoConfig:{extra:{nativeMaps:{androidConfigured:false}}}}};
  if(name==='react-native-maps')return{__esModule:true,default:React.forwardRef((props,ref)=>{React.useImperativeHandle(ref,()=>({fitToCoordinates:(...args)=>mapFits.push(args)}));return React.createElement('MapView',props,props.children);}),Marker:'Marker'};
  if(name.includes('theme/ThemeProvider'))return{useTheme:()=>({palette,isDark:false})};
  if(name.includes('contexts/WorkQueryProvider'))return{useWorkQueryScope:()=>context};
  if(name.endsWith('/useManagementQueries'))return{useManagementData:(date,options)=>{calls.push(['query',date,options]);return data;},useManagementRoute:(memberId,date,options)=>{calls.push(['route',memberId,date,options]);return routeData;}};
  if(name.endsWith('/managementOperations'))return{checkManagementAssignment:(...args)=>operations.check(...args),saveManagementAssignment:(...args)=>operations.assign(...args),saveStaffAvailability:(...args)=>operations.availability(...args)};
  if(name.endsWith('/jobExceptionOperations'))return{newExceptionOperationId:()=> 'review-operation-12345',reviewJobReassignment:async(...args)=>{calls.push(['request-review',...args]);return operations.review?.(...args)||{};}};
  if(name.startsWith('.')){const resolved=path.resolve(path.dirname(file),name);return load(path.relative(root,resolved)+(path.extname(resolved)?'':'.js'));}return require(name);
 };
 const result=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,babelrc:false,configFile:false,presets:[[require.resolve(path.join(root,'node_modules/@babel/preset-react')),{runtime:'classic'}]],plugins:[require.resolve(path.join(root,'node_modules/@babel/plugin-transform-modules-commonjs'))]});
 new Function('require','module','exports',result.code)(importer,module,module.exports);return module.exports;
}
const Management=load('screens/ManagementScreen.js').default,TeamMap=load('components/ManagementTeamMap.js').default,AvailabilityEditor=load('components/StaffAvailabilityEditor.js').default;
const q=(data)=>({data,isSuccess:true,isLoading:false,isFetching:false,error:null,refetch:async()=>{calls.push(['refetch']);},invalidate:async()=>{calls.push(['invalidate']);}});
const job=(id,assignedTo,extras={})=>({id,companyId:'acme',customerName:`Customer ${id}`,assignedTo,date:'2026-11-15',time:'09:00',status:'scheduled',serviceType:'Inspection',address:'1 Synthetic Street',estimatedDuration:1,updatedAt:'v1',...extras});
function App(){const[state,setState]=React.useState(view);return React.createElement(Management,{user,permissions,active:true,view:state,onViewChange:setState,onOpenJob:job=>calls.push(['open',job.id]),onChanged:async()=>calls.push(['changed']),onInteractionChange:next=>interactions.push(next)});}
async function settle(){for(let i=0;i<4;i++)await act(async()=>{await Promise.resolve();});}
async function render(){await act(async()=>{tree=create(React.createElement(App));});await settle();}
const texts=()=>tree.root.findAllByType('Text').map(node=>node.children.filter(value=>typeof value==='string'||typeof value==='number').join('')).join('\n');
const button=label=>tree.root.findAll(node=>node.type==='Pressable'&&node.props.accessibilityLabel===label)[0];
async function press(label){const node=button(label);assert.ok(node,`Missing '${label}'`);assert.notEqual(node.props.disabled,true,`Disabled '${label}'`);await act(async()=>{await node.props.onPress();});await settle();}
beforeEach(()=>{
 tree=null;platform='ios';calls=[];interactions=[];mapFits=[];view='overview';
 user={id:'owner',companyId:'acme',role:'owner',companyName:'Synthetic Acme'};permissions={can:()=>true};
 context={day:'2026-11-15',online:true,active:true,canReadWork:true,accessStatus:'ready',refreshAccess:async()=>{calls.push(['access']);}};
 const team=[{id:'owner',name:'Company owner',role:'owner'},{id:'manager',name:'Manager',role:'manager'},{id:'tech',name:'Luis',role:'technician'}];
 const roster=[{memberId:'owner',dutyStatus:'off-duty',availability:{state:'normal',active:false,revision:0,scheduled:0}},{memberId:'manager',dutyStatus:'off-duty',availability:{state:'normal',active:false,revision:0,scheduled:0}},{memberId:'tech',dutyStatus:'on-duty',availability:{state:'normal',active:false,revision:0,scheduled:0}}];
 data={jobs:q({jobs:[job('own','owner'),job('tech','tech'),job('done','tech',{status:'completed'}),job('open',null)]}),team:q({team}),positions:q({roster,locations:[],policy:{freshAfterSeconds:300}}),refresh:async()=>calls.push(['refresh'])};
 routeData=q({stops:[{id:'tech',customerName:'Customer tech',time:'09:00',address:'1 Synthetic Street'}],saved:{jobIds:['tech']}});
 operations={check:async(...args)=>{calls.push(['check',...args]);return{available:true};},assign:async(...args)=>{calls.push(['assign',...args]);return{assignedTo:args[1]};},availability:async(...args)=>{calls.push(['availability',...args]);return{};}};
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());});
test('overview counts recorded shifts independently of GPS and links web creation',async()=>{
 await render();assert.match(texts(),/On duty now\n1|1\nOff duty now/);assert.match(texts(),/selected service|Selected-day overview|Saved jobs/);assert.doesNotMatch(texts(),/No active team/);
 await press('Schedule new work on web');assert.equal(calls.find(row=>row[0]==='web')[1],'https://route-logistics.com/jobs');
 data.positions.error=new Error('Location access denied');await act(async()=>tree.update(React.createElement(App)));assert.match(texts(),/Location access denied/);assert.match(texts(),/—/);
});

test('management schedule and reassignment show estimate kind, outcome and inquiry without adding financial actions',async()=>{
 view='schedule';data.jobs.data.jobs=[job('estimate','tech',{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'quote_needed',inquiryId:'inquiry-one',servicePropertyId:'rental'})];
 await render();assert.match(texts(),/Estimate Visit/);assert.match(texts(),/quote needed/);assert.match(texts(),/Inquiry reference: inquiry-one/);assert.doesNotMatch(texts(),/Create Invoice|Approve estimate/);
 await press('Assign job estimate');assert.match(texts(),/Estimate Visit/);assert.match(texts(),/Inquiry inquiry-one/);await press('Assign to Manager');await press('Check assignment availability');await press('Confirm job assignment');const saved=calls.find(row=>row[0]==='assign');assert.equal(saved[1].appointmentKind,'estimate_visit');assert.equal(saved[1].billable,false);assert.equal(saved[1].inquiryId,'inquiry-one');assert.equal(saved[2],'manager');
});

test('manager scheduled metric opens matching jobs and reassigns through availability and explicit confirmation',async()=>{
 user={...user,id:'manager',role:'manager',membershipId:'manager-member'};
 data.team.data={team:[...data.team.data.team,{id:'other-tech',name:'Rosa',role:'technician'}]};
 data.positions.data={...data.positions.data,roster:[...data.positions.data.roster,{memberId:'other-tech',dutyStatus:'off-duty',availability:{state:'normal',active:false}}]};
 operations.assign=async(record,target)=>{calls.push(['assign',record,target]);data.jobs.data={...data.jobs.data,jobs:data.jobs.data.jobs.map(row=>row.id===record.id?{...row,assignedTo:target,updatedAt:'v2'}:row)};return{id:record.id,updatedAt:'v2'};};
 await render();assert.equal(button('View scheduled jobs').props.accessibilityRole,'button');await press('View scheduled jobs');
 assert.equal(button('Scheduled').props.accessibilityState.checked,true);
 assert.ok(tree.root.findAll(node=>node.type==='Pressable'&&node.props.testID==='job-card-tech')[0]);
 assert.equal(tree.root.findAll(node=>node.type==='Pressable'&&node.props.testID==='job-card-done').length,0);
 await press('Assign job tech');
 assert.ok(tree.root.findAll(node=>node.type==='View'&&node.props.testID==='management-assignment-dialog')[0]);
 assert.ok(tree.root.findAll(node=>node.type==='View'&&node.props.accessibilityElementsHidden===true&&node.props.pointerEvents==='none')[0]);
 assert.equal(button('Previous day').props.disabled,true);assert.equal(interactions.at(-1).hasDraft,true);
 await press('Assign to Rosa');assert.equal(calls.some(row=>row[0]==='assign'),false,'selection alone cannot reassign a job');
 await press('Check assignment availability');
 const checked=calls.find(row=>row[0]==='check');assert.equal(checked[1].id,'tech');assert.equal(checked[2],'other-tech');
 assert.equal(calls.some(row=>row[0]==='assign'),false,'preflight must still require explicit confirmation');
 await press('Confirm job assignment');
 const saved=calls.find(row=>row[0]==='assign');assert.equal(saved[1].id,'tech');assert.equal(saved[1].updatedAt,'v1');assert.equal(saved[2],'other-tech');
 assert.equal(saved[1].date,'2026-11-15');assert.equal(saved[1].time,'09:00');assert.equal(saved[1].status,'scheduled');
 assert.match(texts(),/Job assignment saved|Assigned: Rosa/);assert.equal(button('Cancel assignment'),undefined);assert.equal(interactions.at(-1).hasDraft,false);
 assert.equal(calls.filter(row=>row[0]==='changed').length,1);assert.equal(user.role,'manager');
});

test('job metric drilldown preserves its selected service date and supports clearing the status filter',async()=>{
 await render();await press('Next day');await press('View scheduled jobs');
 assert.equal(calls.filter(row=>row[0]==='query').at(-1)[1],'2026-11-16');
 assert.doesNotMatch(texts(),/Customer done/);await press('All job statuses');assert.match(texts(),/Customer done/);
 await press('Completed');assert.match(texts(),/Customer done/);assert.doesNotMatch(texts(),/Customer own|Customer open/);
 assert.equal(button('Assign job done'),undefined,'historical details must not gain a reassignment action');
 const details=tree.root.findAll(node=>node.type==='Pressable'&&node.props.testID==='job-card-done')[0];
 await act(async()=>details.props.onPress());assert.deepEqual(calls.find(row=>row[0]==='open'),['open','done']);
});

test('scheduled metric is disabled until its count is loaded and zero matching jobs have a clear empty state',async()=>{
 data.jobs.isSuccess=false;data.jobs.isLoading=true;await render();assert.equal(button('View scheduled jobs').props.disabled,true);
 data.jobs=q({jobs:[job('done','tech',{status:'completed'})]});await act(async()=>tree.update(React.createElement(App)));await settle();
 assert.equal(button('View scheduled jobs').props.disabled,false);await press('View scheduled jobs');assert.match(texts(),/No jobs for this selection/);
 assert.doesNotMatch(texts(),/Customer done/);assert.equal(calls.some(row=>row[0]==='assign'),false);
});
test('team schedule filters staff and handles previous next day without UTC shifts',async()=>{
 view='schedule';await render();assert.match(texts(),/Customer own|Customer tech|Customer open/);
 await press('Luis');assert.match(texts(),/Customer tech/);assert.doesNotMatch(texts(),/Customer own|Customer open/);
 await press('Next day');assert.equal(calls.filter(row=>row[0]==='query').at(-1)[1],'2026-11-16');
 await press('Previous day');assert.equal(calls.filter(row=>row[0]==='query').at(-1)[1],'2026-11-15');
 const card=tree.root.findAll(node=>node.type==='Pressable'&&node.props.testID==='job-card-tech')[0];await act(async()=>card.props.onPress());assert.deepEqual(calls.find(row=>row[0]==='open'),['open','tech']);
});
test('technician detail shares route/job navigation and exposes owner availability controls',async()=>{
 view='team';await render();await press('Details for Luis');assert.match(texts(),/On duty|No authorized position/);
 await press('View daily route');assert.equal(calls.filter(row=>row[0]==='route').at(-1)[1],'tech');await press('Open route stop 1');assert.deepEqual(calls.find(row=>row[0]==='open'),['open','tech']);
 await press('Change staff availability');assert.match(texts(),/does not change account access|Emergency available/);assert.equal(interactions.at(-1).hasDraft,true);
 await press('Cancel availability changes');assert.equal(interactions.at(-1).hasDraft,false);
});
test('assignment checks availability, confirms intent, saves once and refreshes once',async()=>{
 view='schedule';await render();await press('Assign job open');await press('Assign to Manager');await press('Check assignment availability');assert.equal(calls.find(row=>row[0]==='check')[2],'manager');
 let resolve;operations.assign=async(...args)=>{calls.push(['assign',...args]);return new Promise(done=>{resolve=done;});};
 const confirm=button('Confirm job assignment');await act(async()=>{confirm.props.onPress();confirm.props.onPress();await Promise.resolve();});
 assert.equal(calls.filter(row=>row[0]==='assign').length,1);await act(async()=>{resolve({});await Promise.resolve();});await settle();
 assert.match(texts(),/Job assignment saved/);assert.equal(calls.filter(row=>row[0]==='changed').length,1);assert.equal(calls.filter(row=>row[0]==='invalidate').length,0);
});
test('conflicts and failed assignment retain context and actionable retry feedback',async()=>{
 view='schedule';operations.check=async()=>({available:false,reason:'Unavailable: vacation'});await render();await press('Assign job open');await press('Assign to Luis');await press('Check assignment availability');assert.match(texts(),/Unavailable: vacation/);assert.equal(button('Confirm job assignment'),undefined);await press('Cancel assignment');
 operations.check=async()=>({available:true});operations.assign=async()=>{throw new Error('Schedule changed. Refresh and retry.');};await press('Assign job open');await press('Assign to Manager');await press('Check assignment availability');await press('Confirm job assignment');assert.match(texts(),/Schedule changed.*Refresh and retry/);assert.ok(button('Cancel assignment'));assert.equal(interactions.at(-1).hasDraft,true);
 const dialog=tree.root.findAll(node=>node.type==='View'&&node.props.testID==='management-assignment-dialog')[0];
 assert.ok(dialog.findAllByType('Text').some(node=>node.children.join('').includes('Schedule changed. Refresh and retry.')),'assignment failure must be visible within the foreground dialog');
});
test('technicians cannot load management and revoked access hides prior private company data',async()=>{
 permissions={can:()=>false};user.role='technician';await render();assert.match(texts(),/does not permit management/);assert.equal(calls.find(row=>row[0]==='query')[2].enabled,false);assert.doesNotMatch(texts(),/Customer own/);
 permissions={can:()=>true};user.role='owner';context.canReadWork=false;context.accessStatus='revoked';await act(async()=>tree.update(React.createElement(App)));assert.doesNotMatch(texts(),/Customer own|Luis|Company owner/);assert.ok(button('Retry management access'));
});
test('native map exposes authorized markers, selection details and manual fit without refresh recentering',async()=>{
 const at=new Date().toISOString(),team=[{id:'tech',name:'Luis',dutyStatus:'on-duty',location:{lat:35,lng:-119,sharing:true,state:'live',updatedAt:at,accuracy:12}},{id:'off',name:'Off duty',dutyStatus:'off-duty',location:{lat:35,lng:-119,sharing:true,state:'live',updatedAt:at}}];
 await act(async()=>{tree=create(React.createElement(TeamMap,{team,jobs:data.jobs.data.jobs,policy:{freshAfterSeconds:300},onOpenSchedule:id=>calls.push(['schedule',id])}));});
 assert.equal(tree.root.findAllByType('Marker').length,1);const map=tree.root.findByType('MapView');assert.equal(map.props.showsUserLocation,false);
 await act(async()=>map.props.onMapReady());await settle();assert.equal(mapFits.length,1);
 await act(async()=>tree.root.findByType('Marker').props.onPress());assert.match(texts(),/Accuracy: ±12 m|Last updated/);await press('Open technician schedule');assert.deepEqual(calls.find(row=>row[0]==='schedule'),['schedule','tech']);
 await act(async()=>tree.update(React.createElement(TeamMap,{team:[{...team[0],location:{...team[0].location,lat:35.1}}],jobs:[],policy:{freshAfterSeconds:300},onOpenSchedule:()=>{}})));assert.equal(mapFits.length,1);await press('Fit visible team');assert.equal(mapFits.length,2);
});
test('Android missing-key guard never constructs the native map and preserves an actionable message',async()=>{
 platform='android';await act(async()=>{tree=create(React.createElement(TeamMap,{team:[],jobs:[],policy:{},onOpenSchedule:()=>{}}));});assert.equal(tree.root.findAllByType('MapView').length,0);assert.match(texts(),/EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY/);
});
test('availability confirmation retains the opened revision across polling updates',async()=>{
 const values=[],member={id:'tech',name:'Luis',availability:{state:'unavailable',active:true,reason:'vacation',revision:2,scheduled:1}};
 const props={member,busy:false,onSave:value=>values.push(value),onCancel:()=>{}};
 await act(async()=>{tree=create(React.createElement(AvailabilityEditor,props));});await press('Restore normal availability');
 await act(async()=>{tree.update(React.createElement(AvailabilityEditor,{...props,member:{...member,availability:{...member.availability,revision:3}}}));});
 await press('Confirm availability change');assert.equal(values[0].expectedRevision,2);assert.equal(values[0].action,'clear');assert.equal(values[0].memberId,'tech');
});
test('admin retains existing management visibility without owner-only availability changes',async()=>{
 user.role='admin';view='team';await render();await press('Details for Luis');assert.ok(button('View daily route'));assert.equal(button('Change staff availability'),undefined);
});
test('a staff departure during availability editing leaves an explicit cancel path',async()=>{
 view='team';await render();await press('Details for Luis');await press('Change staff availability');
 data.team.data={team:data.team.data.team.filter(row=>row.id!=='tech')};await act(async()=>tree.update(React.createElement(App)));await settle();
 assert.match(texts(),/no longer in the active team/);await press('Cancel unavailable staff changes');assert.equal(interactions.at(-1).hasDraft,false);
});
test('field-work eligibility defaults enabled and changes only after explicit save and confirmation',async()=>{
 const values=[],props={member:{id:'manager',name:'Manager',availability:{revision:4,state:'unavailable',active:true,reason:'vacation',scheduled:1}},busy:false,onSave:value=>values.push(value),onCancel:()=>{}};
 await act(async()=>{tree=create(React.createElement(AvailabilityEditor,props));});
 assert.equal(button('Can be assigned field work').props.accessibilityState.checked,true);assert.equal(button('Save field work setting').props.disabled,true);
 await press('Can be assigned field work');assert.equal(values.length,0);assert.equal(button('Save field work setting').props.disabled,false);assert.equal(button('Review availability change').props.disabled,true);
 await press('Save field work setting');assert.equal(values.length,0);assert.match(texts(),/Existing appointments, role, duty and location consent stay unchanged/);
 await press('Confirm field work setting');assert.deepEqual(values,[{memberId:'manager',action:'set-field-work',fieldWorkEnabled:false,expectedRevision:4}]);
});
test('field-work save remains dirty-only and keeps its opening revision across polling',async()=>{
 const values=[],member={id:'manager',name:'Manager',fieldWorkEnabled:false,availability:{revision:5,fieldWorkEnabled:false,state:'normal'}},props={member,busy:false,onSave:value=>values.push(value),onCancel:()=>{}};
 await act(async()=>{tree=create(React.createElement(AvailabilityEditor,props));});assert.match(texts(),/Office only/);assert.equal(button('Can be assigned field work').props.accessibilityState.checked,false);
 await press('Can be assigned field work');await press('Can be assigned field work');assert.equal(button('Save field work setting').props.disabled,true);assert.equal(values.length,0);
 await press('Can be assigned field work');await press('Save field work setting');
 await act(async()=>tree.update(React.createElement(AvailabilityEditor,{...props,member:{...member,availability:{...member.availability,revision:6}}})));
 await press('Confirm field work setting');assert.equal(values[0].expectedRevision,5);assert.equal(values[0].fieldWorkEnabled,true);assert.equal('role'in values[0],false);assert.equal('reason'in values[0],false);
});
test('office-only staff retain visible schedules and membership role but cannot receive a new mobile assignment',async()=>{
 view='team';data.team.data={team:data.team.data.team.map(row=>row.id==='manager'?{...row,fieldWorkEnabled:false}:row)};await render();await press('Details for Manager');assert.match(texts(),/manager|Office only.*Existing appointments/);assert.ok(button('Change staff availability'));
 await press('Back to team');await press('Details for Luis');await press('Back to team');
 await act(async()=>tree.unmount());tree=null;view='schedule';await render();await press('Assign job open');assert.equal(button('Assign to Manager'),undefined);assert.ok(button('Assign to Luis'));assert.equal(calls.some(row=>row[0]==='assign'),false);
});
test('polling can revoke assignment eligibility after preflight without discarding the job or allowing confirm',async()=>{
 view='schedule';await render();await press('Assign job open');await press('Assign to Manager');await press('Check assignment availability');assert.ok(button('Confirm job assignment'));
 data.positions.data={...data.positions.data,roster:data.positions.data.roster.map(row=>row.memberId==='manager'?{...row,availability:{...row.availability,fieldWorkEnabled:false}}:row)};
 await act(async()=>tree.update(React.createElement(App)));await settle();assert.equal(button('Confirm job assignment'),undefined);assert.match(texts(),/office only or no longer eligible/);assert.ok(button('Cancel assignment'));assert.equal(calls.some(row=>row[0]==='assign'),false);
});
test('a manager can explicitly change field eligibility without triggering assignment, shift or location actions',async()=>{
 user.role='manager';view='team';await render();await press('Details for Luis');await press('Change staff availability');await press('Can be assigned field work');await press('Save field work setting');assert.equal(calls.some(row=>row[0]==='availability'),false);
 await press('Confirm field work setting');const saved=calls.find(row=>row[0]==='availability');assert.equal(saved[1].action,'set-field-work');assert.equal(saved[1].fieldWorkEnabled,false);assert.match(texts(),/Field work setting saved/);assert.equal(calls.some(row=>row[0]==='assign'),false);assert.equal(interactions.at(-1).hasDraft,false);
});

test('exception filter retains assignments and management dismissal does not invoke reassignment',async()=>{
 view='schedule';data.jobs.data.jobs[1]={...data.jobs.data.jobs[1],reassignmentRequest:{id:'request-1',status:'pending',revision:1,reason:'vehicle',notes:'Synthetic vehicle issue'}};
 await render();await press('Reassignment requested');assert.match(texts(),/Customer tech/);assert.doesNotMatch(texts(),/Customer done/);
 await press('Review reassignment request tech');assert.match(texts(),/Synthetic vehicle issue/);assert.equal(interactions.at(-1).hasDraft,true);
 const field=tree.root.findByProps({accessibilityLabel:'Management explanation (optional)'});await act(async()=>field.props.onChangeText('Office reviewed the test request'));
 await press('Dismiss request');const action=calls.find(row=>row[0]==='request-review');assert.equal(action[1].id,'tech');assert.equal(action[2].action,'dismiss');assert.equal(action[2].explanation,'Office reviewed the test request');
 assert.equal(calls.some(row=>row[0]==='assign'),false);assert.equal(data.jobs.data.jobs[1].assignedTo,'tech');assert.equal(interactions.at(-1).hasDraft,false);
});

test('polling a newer request cannot silently redirect an open management decision',async()=>{
 view='schedule';data.jobs.data.jobs[1]={...data.jobs.data.jobs[1],reassignmentRequest:{id:'request-1',status:'pending',revision:1,reason:'equipment'}};
 await render();await press('Review reassignment request tech');data.jobs.data.jobs[1]={...data.jobs.data.jobs[1],reassignmentRequest:{id:'request-2',status:'pending',revision:2,reason:'other'}};
 await act(async()=>tree.update(React.createElement(App)));await settle();assert.match(texts(),/request or job changed/);assert.equal(button('Dismiss request'),undefined);assert.equal(calls.some(row=>row[0]==='request-review'),false);
});

test('in-progress assignment requires explicit work review after ordinary availability checks',async()=>{
 view='schedule';data.jobs.data.jobs[1]={...data.jobs.data.jobs[1],status:'in-progress'};await render();await press('Assign job tech');await press('Assign to Manager');await press('Check assignment availability');
 assert.equal(button('Confirm job assignment').props.disabled,true);await press('I reviewed the work already started');await press('Confirm job assignment');
 const saved=calls.find(row=>row[0]==='assign');assert.deepEqual(saved[3],{reviewStartedWork:true});assert.equal(saved[1].status,'in-progress');
});
