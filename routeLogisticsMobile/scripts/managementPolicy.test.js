const test=require('node:test'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const policy=require('../services/managementPolicy');
test('team merge never introduces a retained location without an active authorized roster row',()=>{
 const rows=policy.mergeTeam([{id:'tech',name:'Luis'}],[{memberId:'tech',dutyStatus:'on-duty'},{memberId:'revoked',dutyStatus:'on-duty'}],[{memberId:'revoked',lat:1,lng:2}]);
 assert.equal(rows.length,1);assert.equal(rows[0].id,'tech');assert.equal(rows[0].dutyStatus,'on-duty');assert.equal(rows[0].location,null);
});
test('duty remains independent of GPS and missing counts are unknown rather than zero',()=>{
 const team=[{dutyStatus:'on-duty',location:null},{dutyStatus:'off-duty'},{dutyStatus:'unknown'}];
 assert.equal(policy.locationStatus(team[0]),'unavailable');
 assert.deepEqual(policy.teamSummary([{status:'scheduled',assignedTo:null},{status:'completed',assignedTo:'x'}],team),{onDuty:1,offDuty:1,unknownDuty:1,scheduled:1,completed:1,inProgress:0,unassigned:1,truncated:false});
 assert.equal(policy.teamSummary([],[],{jobsReady:false,rosterReady:false}).scheduled,null);
 assert.equal(policy.teamSummary([],[],{jobsReady:false,rosterReady:false}).onDuty,null);
});
test('map permits only on-duty authorized fresh/stale coordinates, and labels stopped/off-duty safely',()=>{
 const now=Date.parse('2026-11-15T19:00:00Z'),fix={lat:35,lng:-119,updatedAt:'2026-11-15T18:59:00Z',sharing:true,state:'live'};
 const rows=[{id:'fresh',dutyStatus:'on-duty',location:fix},{id:'stale',dutyStatus:'on-duty',location:{...fix,updatedAt:'2026-11-15T18:00:00Z',state:'stale',stale:true,sharing:false}},{id:'off',dutyStatus:'off-duty',location:fix},{id:'stopped',dutyStatus:'on-duty',location:{...fix,state:'sharing-disabled',sharing:false}},{id:'invalid',dutyStatus:'on-duty',location:{...fix,lat:999}}];
 assert.deepEqual(policy.visibleTeamMarkers(rows,{freshAfterSeconds:300},now).map(row=>[row.id,row.locationState]),[['fresh','fresh'],['stale','stale']]);
 assert.equal(policy.locationStatus(rows[2],{},now),'off-duty');assert.equal(policy.locationStatus(rows[3],{},now),'sharing-disabled');
});
test('availability windows distinguish normal, future leave, sick leave and emergency overrides',()=>{
 assert.match(policy.availabilityLabel({state:'normal',active:false,scheduled:1}),/scheduled availability/);
 assert.match(policy.availabilityLabel({state:'unavailable',active:true,reason:'sick'}),/Unavailable.*Sick/);
 assert.match(policy.availabilityLabel({state:'available',active:true,reason:'emergency'}),/Available.*Emergency/);
});
test('offline positions expire at tenant retention and manual unavailable windows suppress cached markers',()=>{
 const at=Date.parse('2026-11-15T18:00:00Z'),row={id:'tech',dutyStatus:'on-duty',location:{lat:35,lng:-119,updatedAt:new Date(at).toISOString(),sharing:true,state:'live'}};
 assert.equal(policy.locationStatus(row,{retentionHours:1},at+3600000),'expired');
 assert.deepEqual(policy.visibleTeamMarkers([row],{retentionHours:1},at+3600000),[]);
 assert.deepEqual(policy.visibleTeamMarkers([{...row,availability:{active:true,state:'unavailable'}}],{},at+1000),[]);
 assert.deepEqual(policy.visibleTeamMarkers([{...row,location:{...row.location,updatedAt:'invalid'}}],{},at+1000),[]);
});
test('agenda and assignments handle date boundaries and detect loaded overlap without inventing server eligibility',()=>{
 assert.equal(policy.shiftDay('2026-12-31',1),'2027-01-01');assert.equal(policy.shiftDay('2026-03-01',-1),'2026-02-28');assert.equal(policy.shiftDay('2026-02-30',1),null);
 const job={id:'one',date:'2026-11-15',time:'09:00',estimatedDuration:1};
 assert.equal(policy.apparentConflict(job,[{id:'two',date:job.date,time:'09:30',estimatedDuration:1,status:'scheduled',assignedTo:'tech'}],'tech'),true);
 assert.equal(policy.apparentConflict(job,[{id:'two',date:job.date,time:'10:00',estimatedDuration:1,status:'scheduled',assignedTo:'tech'}],'tech'),false);
 assert.equal(policy.apparentConflict(job,[{id:'two',date:job.date,time:'09:30',estimatedDuration:1,status:'completed',assignedTo:'tech'}],'tech'),false);
});
test('saved route order retains newly assigned stops and ignores removed stop IDs',()=>{
 const route={saved:{jobIds:['removed','second','first']},stops:[{id:'first',time:'09:00'},{id:'new',time:'08:00'},{id:'second',time:'10:00'}]};
 assert.deepEqual(policy.orderedRouteStops(route).map(row=>row.id),['second','first','new']);
});
test('calendar dates are stable across Pacific, Eastern and UTC, including daylight-saving boundaries',()=>{
 for(const TZ of ['America/Los_Angeles','America/New_York','UTC']){
  const script=`const assert=require('node:assert/strict');const p=require('./services/managementPolicy');for(const day of ['2026-03-08','2026-11-01']){const date=p.localDate(day);assert.equal(date.getDate(),Number(day.slice(-2)));assert.equal(p.shiftDay(p.shiftDay(day,1),-1),day);}assert.equal(p.instantFromLocal('2026-02-30','10:00'),null);assert.equal(p.instantFromLocal('2026-11-15','10:07'),null);`;
  const result=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,TZ},encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
 }
});
