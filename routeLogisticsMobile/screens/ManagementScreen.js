import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, RefreshControl, Linking, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { useWorkQueryScope } from '../contexts/WorkQueryProvider';
import { useManagementData, useManagementRoute } from '../services/useManagementQueries';
import { checkManagementAssignment, saveManagementAssignment, saveStaffAvailability } from '../services/managementOperations';
import { localDay } from '../services/workQueryPolicy';
import { mergeTeam, shiftDay, localDate, jobCounts, teamSummary, locationStatus, availabilityLabel, orderedRouteStops, apparentConflict } from '../services/managementPolicy';
import { sortJobs, dayLabel } from '../services/workPresentation';
import { ScreenHeader, SectionHeader, Card, InlineNotice, LoadingState, EmptyState, PrimaryButton, SecondaryButton, JobCard, ActionDialog } from '../components/MobileUI';
import ManagementTeamMap, { updatedLabel } from '../components/ManagementTeamMap';
import StaffAvailabilityEditor from '../components/StaffAvailabilityEditor';
import { GlassInput } from '../components/Glass';
import { deriveJobExceptions, REASSIGNMENT_REASONS } from '../../functions/shared/jobExceptions';
import { newExceptionOperationId, reviewJobReassignment } from '../services/jobExceptionOperations';
import { isEstimateVisit, estimateOutcomeLabel } from '../services/estimateVisitPolicy';

const freshnessLabels={fresh:'Recent authorized position',stale:'Stale last-known position','off-duty':'Off duty · no current position','sharing-disabled':'Location sharing is off',unavailable:'No authorized position',expired:'Location retention expired · no position shown'};
const statusChoices=[['all','All job statuses'],['scheduled','Scheduled'],['en-route','En route'],['in-progress','In progress'],['completed','Completed'],['cancelled','Cancelled']];
function Choice({title,selected,onPress,disabled=false}){
  const {palette}=useTheme();
  return <Pressable accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{checked:selected,disabled}} disabled={disabled} onPress={onPress}
    style={{padding:12,borderRadius:12,borderWidth:1,borderColor:selected?palette.accent:palette.border,backgroundColor:selected?palette.glow:palette.input,minHeight:46}}><Text style={{color:palette.text,fontWeight:selected?'700':'400',lineHeight:22}}>{title}</Text></Pressable>;
}
export default function ManagementScreen({user,permissions,active,onOpenJob,onChanged,onInteractionChange,view='overview',onViewChange}){
  const {palette}=useTheme(),context=useWorkQueryScope(),[date,setDate]=useState(()=>context.day||localDay()),[member,setMember]=useState('all'),[showDate,setShowDate]=useState(false);
  const [selected,setSelected]=useState(null),[showRoute,setShowRoute]=useState(false),[assignment,setAssignment]=useState(null),[availability,setAvailability]=useState(null),[target,setTarget]=useState(null);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(null),[check,setCheck]=useState(null),[checking,setChecking]=useState(false);
  const [now,setNow]=useState(Date.now);
  const [jobStatus,setJobStatus]=useState('all');
  const [exceptionFilter,setExceptionFilter]=useState('all'),[exceptionJob,setExceptionJob]=useState(null),[explanation,setExplanation]=useState('');
  const [reviewStartedWork,setReviewStartedWork]=useState(false);
  const reviewAttempt=useRef(null);
  const lifetime=useRef({alive:true,sequence:0,scope:'',pending:null}),scope=JSON.stringify([user?.id,user?.companyId,user?.role,user?.membershipId]);
  lifetime.current.scope=scope;
  const allowed=!!user?.companyId&&permissions.can('dispatch.manage'),canLocations=permissions.can('locations.viewTeam'),canAssign=permissions.can('jobs.assign'),canOverride=['owner','manager'].includes(user?.role);
  const data=useManagementData(date,{enabled:active&&allowed,canViewLocations:canLocations});
  const readable=allowed&&context.canReadWork;
  const team=useMemo(()=>readable?mergeTeam(data.team.data?.team,data.positions.data?.roster,data.positions.data?.locations).map(row=>({...row,fieldWorkEnabled:row.fieldWorkEnabled!==false&&row.availability?.fieldWorkEnabled!==false})):[],[readable,data.team.data,data.positions.data]);
  const jobs=readable?sortJobs(data.jobs.data?.jobs||[]):[],policy=data.positions.data?.policy||{};
  const current=team.find(row=>row.id===selected),availabilityMember=team.find(row=>row.id===availability);
  const route=useManagementRoute(selected,date,{enabled:active&&allowed&&!!selected&&showRoute&&view==='team'});
  const hasDraft=!!assignment||!!availability||!!exceptionJob;
  const exceptionOptions={now,timeZone:user.companyTimeZone||user.timeZone||'America/Los_Angeles'};
  const exceptionFor=job=>deriveJobExceptions(job,exceptionOptions);
  const exceptionCounts=jobs.reduce((value,job)=>{const result=exceptionFor(job);for(const key of ['potentiallyLate','overdue','reassignmentRequested'])if(result[key])value[key]++;return value;},{potentiallyLate:0,overdue:0,reassignmentRequested:0});
  const selectedRequest=exceptionJob&&jobs.find(job=>job.id===exceptionJob.id);
  const requestChanged=!!exceptionJob&&(!selectedRequest||selectedRequest.reassignmentRequest?.id!==exceptionJob.reassignmentRequest?.id||selectedRequest.reassignmentRequest?.revision!==exceptionJob.reassignmentRequest?.revision||selectedRequest.updatedAt!==exceptionJob.updatedAt);
  const targetMember=team.find(row=>row.id===target),targetEligible=!target||!!targetMember&&targetMember.fieldWorkEnabled!==false;
  // Retained hidden management pages must never clear the active work order's
  // draft/busy guard. Workspace owns transitions; report only while visible.
  useEffect(()=>{if(active)onInteractionChange?.({busy:busy||checking,hasDraft});},[active,busy,checking,hasDraft,onInteractionChange]);
  useEffect(()=>{const state=lifetime.current;state.alive=true;return()=>{state.alive=false;state.sequence++;};},[]);
  useEffect(()=>{if(!active||!context.active)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer);},[active,context.active]);
  useEffect(()=>{setSelected(null);setAssignment(null);setAvailability(null);setExceptionJob(null);setExceptionFilter('all');setNotice(null);setCheck(null);setShowRoute(false);setMember('all');setJobStatus('all');reviewAttempt.current=null;},[scope]);
  useEffect(()=>{if(!readable){lifetime.current.sequence++;lifetime.current.pending=null;setBusy(false);setChecking(false);setAssignment(null);setAvailability(null);setExceptionJob(null);setCheck(null);}},[readable]);
  const isCurrent=(ticket,expected)=>lifetime.current.alive&&lifetime.current.sequence===ticket&&lifetime.current.scope===expected;
  const mutate=async(task,message)=>{
    if(lifetime.current.pending||busy||checking||!readable||!context.online)return;
    lifetime.current.pending='save';const ticket=++lifetime.current.sequence,expected=scope;setBusy(true);setNotice(null);
    try{await task();if(!isCurrent(ticket,expected))return;setAssignment(null);setAvailability(null);setExceptionJob(null);reviewAttempt.current=null;setCheck(null);setNotice({tone:'success',message});
      try{if(onChanged)await onChanged();else await data.jobs.invalidate();}catch{if(isCurrent(ticket,expected))setNotice({tone:'info',message:`${message} A view could not refresh. Pull down to reload its latest data.`});}}
    catch(error){if(isCurrent(ticket,expected))setNotice({tone:'error',message:`${error.message||'The change could not be saved. Refresh and try again.'}${availability&&String(error.code||'').endsWith('aborted')?' Cancel these changes and reopen the availability editor to use the latest revision.':''}`});}
    finally{if(isCurrent(ticket,expected)){lifetime.current.pending=null;setBusy(false);}}
  };
  const beginAssignment=job=>{setShowDate(false);setAssignment(job);setTarget(job.assignedTo||null);setCheck(null);setNotice(null);setReviewStartedWork(false);};
  const openAssignment=job=>{if(!canAssign||busy||checking||hasDraft||['completed','cancelled','canceled'].includes(job.status))return;beginAssignment(job);};
  const openRequest=job=>{if(!canAssign||busy||checking||hasDraft||job.reassignmentRequest?.status!=='pending')return;setExceptionJob(job);setExplanation('');reviewAttempt.current=null;setNotice(null);};
  const reviewRequest=action=>{
    if(!exceptionJob||requestChanged||!canAssign||!context.online)return;
    if(explanation.trim().length>2000){setNotice({tone:'error',message:'Keep the explanation within 2,000 characters.'});return;}
    if(!reviewAttempt.current||reviewAttempt.current.action!==action)reviewAttempt.current={action,explanation:explanation.trim(),operationId:newExceptionOperationId()};
    return mutate(()=>reviewJobReassignment(exceptionJob,reviewAttempt.current),action==='dismiss'?'Reassignment request dismissed. The appointment and assignment are unchanged.':'Reassignment request resolved. The appointment and assignment are unchanged.');
  };
  const preflight=async()=>{
    if(!assignment||lifetime.current.pending||busy||checking||!readable||!context.online)return;
    if(!targetEligible){setCheck(null);setNotice({tone:'error',message:'This staff member is office only or no longer eligible for new field assignments. Choose another person or Unassigned.'});return;}
    lifetime.current.pending='check';const ticket=++lifetime.current.sequence,expected=scope;setChecking(true);setNotice(null);
    try{const result=await checkManagementAssignment(assignment,target);if(isCurrent(ticket,expected))setCheck(result);}
    catch(error){if(isCurrent(ticket,expected))setNotice({tone:'error',message:error.message||'The assignment could not be checked. Retry while online.'});}
    finally{if(isCurrent(ticket,expected)){lifetime.current.pending=null;setChecking(false);}}
  };
  const openSchedule=(status='all',assignee='all',exception='all')=>{if(busy||checking||hasDraft)return;setShowDate(false);setMember(assignee);setJobStatus(status);setExceptionFilter(exception);onViewChange?.('schedule');};
  const selectSchedule=id=>openSchedule('all',id);
  const visibleJobs=jobs.filter(job=>(member==='all'||(member==='unassigned'?!job.assignedTo:job.assignedTo===member))&&(jobStatus==='all'||(job.status==='canceled'?'cancelled':job.status)===jobStatus)&&(exceptionFilter==='all'||exceptionFor(job)[exceptionFilter]));
  const counts=teamSummary(jobs,team,{jobsReady:data.jobs.isSuccess&&!data.jobs.error,rosterReady:data.team.isSuccess&&!data.team.error&&data.positions.isSuccess&&!data.positions.error,truncated:!!data.jobs.data?.hasMore||!!data.positions.data?.truncated||!!data.team.data?.truncated});
  const refresh=async()=>{if(busy||checking)return;await data.refresh();if(showRoute&&selected)await route.refetch();};
  const openWeb=async()=>{try{await Linking.openURL('https://route-logistics.com/jobs');}catch{setNotice({tone:'error',message:'Open https://route-logistics.com/jobs in your browser to schedule new work.'});}};
  const jobList=(list,empty='No jobs for this selection')=><View style={{gap:12}}>{list.map(job=>{
    const assigned=team.find(row=>row.id===job.assignedTo),duration=Number(job.estimatedDuration??job.duration);
    return <View key={job.id} style={{gap:8}}><JobCard job={job} onPress={()=>{if(!busy&&!hasDraft)onOpenJob?.(job);}}/>
      <Text style={{color:palette.secondary,lineHeight:21}}>Assigned: {assigned?.name||job.assignedToName||(job.assignedTo?'Saved staff assignment':'Unassigned')}{Number.isFinite(duration)?` · ${duration} hour${duration===1?'':'s'}`:''}</Text>
      {isEstimateVisit(job) && !!job.inquiryId && <Text style={{color:palette.secondary,lineHeight:21}}>Inquiry reference: {job.inquiryId}</Text>}
      {(job.assignmentNeedsAttention||job.assignmentNeedsReview)&&<InlineNotice message={job.assignmentReview||job.assignmentReviewReason||'Assignment needs dispatcher review.'}/>}
      {exceptionFor(job).indicators.map(indicator=><InlineNotice key={indicator.code} message={`${indicator.label} · ${indicator.detail}`}/>)}
      {canAssign&&job.reassignmentRequest?.status==='pending'&&<SecondaryButton title="Review reassignment request" accessibilityLabel={`Review reassignment request ${job.id}`} disabled={busy||checking||hasDraft||!context.online} onPress={()=>openRequest(job)}/>}
      {canAssign&&!['completed','cancelled','canceled'].includes(job.status)&&<SecondaryButton title={job.assignedTo?'Reassign job':'Assign job'} accessibilityLabel={`Assign job ${job.id}`} disabled={busy||checking||hasDraft||!context.online} onPress={()=>openAssignment(job)}/>}
    </View>;
  })}{!list.length&&<EmptyState title={empty} message="Saved jobs for the selected service date appear here. New scheduling remains available on the web."/>}</View>;
  const memberRow=row=>{const list=jobs.filter(job=>job.assignedTo===row.id),stats=jobCounts(list),state=locationStatus(row,policy,now);return <Card key={row.id}>
    <SectionHeader title={row.name} subtitle={`${row.role||'Staff'} · ${row.dutyStatus==='on-duty'?'On duty':row.dutyStatus==='off-duty'?'Off duty':'Duty status not loaded'}`}/>
    <Text style={{color:palette.text,lineHeight:22}}>{data.jobs.isSuccess&&!data.jobs.error?`${stats.assigned} assigned · ${stats.completed} completed · ${stats.remaining} remaining`:'Schedule counts not loaded'}</Text>
    <Text style={{color:palette.secondary,lineHeight:22}}>{freshnessLabels[state]}</Text>
    {!!row.location&&<Text style={{color:palette.secondary,lineHeight:22}}>Last updated: {updatedLabel(row.location.capturedAt||row.location.updatedAt)}</Text>}
    <Text style={{color:row.availability?.state==='unavailable'&&row.availability?.active?palette.danger:palette.secondary,lineHeight:22}}>{availabilityLabel(row.availability)}</Text>
    <Text style={{color:palette.secondary,lineHeight:22}}>{row.fieldWorkEnabled?'Field work enabled':'Office only · Not offered for new field assignments'}</Text>
    <SecondaryButton title="Technician details" accessibilityLabel={`Details for ${row.name}`} disabled={busy||hasDraft} onPress={()=>{setSelected(row.id);setShowRoute(false);onViewChange?.('team');}}/>
  </Card>;};
  if(!allowed)return <InlineNotice tone="error" message="Your current role does not permit management operations."/>;
  if(!readable)return <View style={{padding:20,gap:16}}><ScreenHeader title="Management"/>{context.accessStatus==='checking'?<LoadingState message="Checking management access…"/>:<InlineNotice tone="error" message={context.accessError?.message||context.accessError||'Your company access could not be verified.'}/>}<SecondaryButton title="Retry management access" onPress={context.refreshAccess}/></View>;
  return <View style={{flex:1}}><View style={{flex:1}} pointerEvents={assignment||exceptionJob?'none':'auto'} accessibilityElementsHidden={!!assignment||!!exceptionJob} importantForAccessibility={assignment||exceptionJob?'no-hide-descendants':'auto'}><ScreenHeader title={view==='overview'?'Operations':view==='team'?'Team':view==='map'?'Team map':'Team schedule'} subtitle={user.companyName||'Company operations'}/>
    <ScrollView testID="management-scroll" keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={active&&[data.jobs,data.team,data.positions].some(query=>query.isFetching&&!query.isLoading)} onRefresh={refresh} tintColor={palette.accent}/>}
      contentContainerStyle={{paddingHorizontal:20,paddingBottom:28,gap:16,width:'100%',maxWidth:760,alignSelf:'center'}}>
      {!context.online&&<InlineNotice message="Offline: showing previously loaded company information. Assignment and availability changes require a connection; your saved fieldwork remains in the same offline queue."/>}
      {!!notice&&!assignment&&!exceptionJob&&<InlineNotice {...notice}/>}
      {!!availability&&!availabilityMember&&data.team.isSuccess&&<InlineNotice tone="error" message="This staff member is no longer in the active team. Availability cannot be changed for an inactive membership."><SecondaryButton title="Cancel unavailable staff changes" onPress={()=>{setAvailability(null);setSelected(null);}}/></InlineNotice>}
      {[data.jobs,data.team,...(canLocations?[data.positions]:[])].filter(query=>query.error).map((query,index)=><InlineNotice key={index} tone="error" message={query.error.message||'Company operations could not be loaded.'}><SecondaryButton title="Retry company data" onPress={refresh}/></InlineNotice>)}
      {[data.jobs,data.team].some(query=>query.isLoading)&&<LoadingState message="Loading company operations…"/>}
      {counts.truncated&&<InlineNotice message="This large company has more records than this view can load. Counts are partial; use the web dispatch board for full review."/>}
      <View style={{gap:8}}><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
        <SecondaryButton title="Previous day" disabled={busy||hasDraft} onPress={()=>setDate(value=>shiftDay(value,-1))}/><SecondaryButton title="Today" disabled={busy||hasDraft} onPress={()=>setDate(context.day||localDay())}/><SecondaryButton title="Next day" disabled={busy||hasDraft} onPress={()=>setDate(value=>shiftDay(value,1))}/>
      </View><SecondaryButton title={`Service date: ${dayLabel(date)}`} accessibilityLabel="Choose management service date" disabled={busy||hasDraft} onPress={()=>setShowDate(value=>!value)}/>
        {showDate&&<><DateTimePicker value={localDate(date)} mode="date" display={Platform.OS==='ios'?'inline':'default'} onChange={(event,value)=>{if(event.type==='dismissed'){setShowDate(false);return;}if(value)setDate(localDay(value));if(Platform.OS!=='ios')setShowDate(false);}}/><SecondaryButton title="Done choosing service date" onPress={()=>setShowDate(false)}/></>}
      </View>
      {(view==='overview'||view==='schedule')&&<Card><SectionHeader title="Needs attention" subtitle="Selected service date · No arrival confirmed does not mean a technician failed to arrive."/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{[['potentiallyLate','Potentially late'],['overdue','Overdue'],['reassignmentRequested','Reassignment requested']].map(([key,label])=><SecondaryButton key={key} title={`${label}: ${data.jobs.isSuccess?exceptionCounts[key]:'—'}`} disabled={busy||checking||hasDraft} onPress={()=>openSchedule('all','all',key)}/>)}</View>
      </Card>}
      {view==='overview'&&<><SectionHeader title={`Selected-day overview · ${dayLabel(date)}`} subtitle="Duty is based on recorded shifts, separately from location freshness."/>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[['On duty now',counts.onDuty],['Off duty now',counts.offDuty],['Scheduled jobs',counts.scheduled,'scheduled'],['Completed jobs',counts.completed,'completed'],['In progress',counts.inProgress,'in-progress'],['Unassigned jobs',counts.unassigned,'all','unassigned']].map(([label,count,status,assignee])=>{
          const style={flexBasis:'46%',flexGrow:1,padding:15,gap:8,borderRadius:16,borderWidth:1,borderColor:palette.border,backgroundColor:palette.surface};
          const content=<><Text style={{color:palette.secondary,fontSize:13,lineHeight:20}}>{label}</Text><Text style={{color:palette.text,fontSize:26,fontWeight:'700'}}>{count==null?'—':`${count}${counts.truncated?'+':''}`}</Text>{status&&<Text style={{color:palette.accent,fontSize:12,fontWeight:'600'}}>View jobs →</Text>}</>;
          return status?<Pressable key={label} testID={`management-metric-${label.toLowerCase().replace(/ /g,'-')}`} accessibilityRole="button" accessibilityLabel={`View ${label.toLowerCase()}`} accessibilityHint="Open matching appointments for the selected service date" accessibilityState={{disabled:count==null||busy||checking||hasDraft}} disabled={count==null||busy||checking||hasDraft} onPress={()=>openSchedule(status,assignee||'all')} style={style}>{content}</Pressable>:<View key={label} style={style}>{content}</View>;
        })}</View>
        {!!counts.unknownDuty&&<InlineNotice message={`${counts.unknownDuty} staff have no loaded duty status; they are not counted as off duty.`}/>}
        <SecondaryButton title="Open team schedule" onPress={()=>openSchedule()}/><SecondaryButton title="Inspect team locations" disabled={!canLocations} onPress={()=>onViewChange?.('map')}/>
        <InlineNotice message="Create new jobs and estimates on the web, where service-property validation and geographic eligibility are supported."/><SecondaryButton title="Schedule new work on web" onPress={openWeb}/>
      </>}
      {view==='team'&&!current&&<><SectionHeader title="Company field team" subtitle="Owners and managers can perform their own assigned fieldwork using the same account."/>{team.map(memberRow)}{data.team.isSuccess&&!team.length&&<EmptyState title="No active team members" message="Only active company staff are listed."/>}</>}
      {view==='team'&&current&&<><SecondaryButton title="Back to team" disabled={busy||hasDraft} onPress={()=>{setSelected(null);setShowRoute(false);}}/>
        <Card><SectionHeader title={current.name} subtitle={`${current.role} · ${current.dutyStatus==='on-duty'?'On duty':current.dutyStatus==='off-duty'?'Off duty':'Duty not loaded'}`}/>
          {!!current.shiftStartedAt&&<Text style={{color:palette.secondary,lineHeight:22}}>Shift started: {updatedLabel(current.shiftStartedAt)}</Text>}
          {!!current.shiftExpiresAt&&<Text style={{color:palette.secondary,lineHeight:22}}>Shift expires: {updatedLabel(current.shiftExpiresAt)}</Text>}
          <Text style={{color:palette.secondary,lineHeight:22}}>{freshnessLabels[locationStatus(current,policy,now)]}</Text>
          {!!current.location&&<><Text style={{color:palette.secondary,lineHeight:22}}>Last updated: {updatedLabel(current.location.capturedAt||current.location.updatedAt)}</Text>{Number.isFinite(current.location.accuracy)&&<Text style={{color:palette.secondary}}>Accuracy: ±{Math.round(current.location.accuracy)} m</Text>}</>}
          <Text style={{color:palette.text,lineHeight:22}}>{availabilityLabel(current.availability)}</Text>
          <Text style={{color:palette.secondary,lineHeight:22}}>{current.fieldWorkEnabled?'Field work enabled':'Office only · Existing appointments are preserved'}</Text>
          {current.availability?.active&&<Text style={{color:palette.secondary,lineHeight:22}}>Override ends: {updatedLabel(current.availability.endsAt)}</Text>}
          {!!current.availability?.nextChangeAt&&<Text style={{color:palette.secondary,lineHeight:22}}>Next availability change: {updatedLabel(current.availability.nextChangeAt)}</Text>}
          {canOverride&&<SecondaryButton title="Change staff availability" disabled={busy||hasDraft||!context.online} onPress={()=>{setShowDate(false);setAvailability(current.id);setNotice(null);}}/>}
          <SecondaryButton title={showRoute?'Hide daily route':'View daily route'} disabled={busy||hasDraft} onPress={()=>setShowRoute(value=>!value)}/>
        </Card>
        {!!availabilityMember&&<StaffAvailabilityEditor key={availabilityMember.id} member={availabilityMember} busy={busy} onSave={options=>mutate(()=>saveStaffAvailability(options),options.action==='set-field-work'?'Field work setting saved. Existing appointments and permissions are unchanged.':'Staff availability saved. Existing scheduled work remains visible for review.')} onCancel={()=>setAvailability(null)}/>}
        {showRoute&&<Card><SectionHeader title={`Daily route · ${dayLabel(date)}`}/>{route.isLoading?<LoadingState message="Loading this technician’s route…"/>:route.error?<InlineNotice tone="error" message={route.error.message}><SecondaryButton title="Retry daily route" onPress={route.refetch}/></InlineNotice>:!route.data?<InlineNotice message="Route not loaded. Refresh while online."/>:<>
          {orderedRouteStops(route.data).map((stop,index)=><View key={stop.id} style={{gap:6}}><Text style={{color:palette.text,lineHeight:22}}>{index+1}. {stop.time||'Time not set'} · {stop.customerName||'Customer'}</Text><Text style={{color:palette.secondary,lineHeight:22}}>{stop.address||'Property address not provided'}</Text><SecondaryButton title={`Open route stop ${index+1}`} onPress={()=>{if(!busy&&!hasDraft)onOpenJob?.({id:stop.id});}}/></View>)}
          {!route.data.stops?.length&&<Text style={{color:palette.secondary}}>No remaining eligible stops for this date.</Text>}
          {route.data.truncated&&<InlineNotice message="The first 100 eligible stops are shown."/>}
        </>}</Card>}
        <SectionHeader title="Selected-day assignments" subtitle={dayLabel(date)}/>{jobList(jobs.filter(job=>job.assignedTo===current.id),'No assigned jobs for this date')}
      </>}
      {view==='map'&&(canLocations?<>{data.positions.isLoading?<LoadingState message="Loading authorized team positions…"/>:data.positions.error?<InlineNotice tone="error" message="Team locations could not be retrieved. Retry to verify location access."/>:<ManagementTeamMap team={team} jobs={jobs} policy={policy} onOpenSchedule={selectSchedule}/>}</>:<InlineNotice tone="error" message="Your role does not permit team location access."/>)}
      {view==='schedule'&&<><SectionHeader title="Filter schedule"/>
        <ScrollView horizontal contentContainerStyle={{gap:8,paddingBottom:6}}><Choice title="All technicians" selected={member==='all'} disabled={hasDraft||busy} onPress={()=>setMember('all')}/><Choice title="Unassigned" selected={member==='unassigned'} disabled={hasDraft||busy} onPress={()=>setMember('unassigned')}/>{team.map(row=><Choice key={row.id} title={row.name} selected={member===row.id} disabled={hasDraft||busy} onPress={()=>setMember(row.id)}/>)}</ScrollView>
        <ScrollView horizontal contentContainerStyle={{gap:8,paddingBottom:6}}>{statusChoices.map(([status,label])=><Choice key={status} title={label} selected={jobStatus===status} disabled={hasDraft||busy||checking} onPress={()=>setJobStatus(status)}/>)}</ScrollView>
        <ScrollView horizontal contentContainerStyle={{gap:8,paddingBottom:6}}>{[['all','All exceptions'],['potentiallyLate','Potentially late'],['overdue','Overdue'],['reassignmentRequested','Reassignment requested']].map(([value,label])=><Choice key={value} title={label} selected={exceptionFilter===value} disabled={hasDraft||busy||checking} onPress={()=>setExceptionFilter(value)}/>)}</ScrollView>
        <SectionHeader title={jobStatus==='all'?'Selected-day appointments':`${statusChoices.find(([status])=>status===jobStatus)?.[1]||'Selected'} jobs`} subtitle={canAssign?'Open a job for details, or use Reassign job to choose another available staff member.':dayLabel(date)}/>
        {data.jobs.isSuccess&&jobList(visibleJobs)}
      </>}
      <SecondaryButton title="Refresh company operations" disabled={busy||checking} onPress={refresh}/>
    </ScrollView>
    </View>
      {assignment&&<ActionDialog title="Review job assignment" busy={busy||checking} onClose={()=>{setAssignment(null);setCheck(null);}} testID="management-assignment-dialog"><Card><SectionHeader title={assignment.customerName||'Customer'} subtitle={`${dayLabel(assignment.date)} · ${assignment.time||'Time not set'}`}/>
        {isEstimateVisit(assignment)&&<InlineNotice message={`Estimate Visit · ${estimateOutcomeLabel(assignment)}${assignment.inquiryId?' · Inquiry '+assignment.inquiryId:''}`}/>}
        {!!notice&&<InlineNotice {...notice}/>}
        <Text style={{color:palette.secondary,lineHeight:22}}>Choose active company staff. The server checks current membership, availability and calendar conflicts again when saving.</Text>
        <Choice title="Leave job unassigned" selected={!target} disabled={busy||checking} onPress={()=>{setTarget(null);setCheck(null);}}/>
        {team.filter(row=>(['owner','manager','technician'].includes(row.role)||row.id===assignment.assignedTo)&&row.fieldWorkEnabled).map(row=><Choice key={row.id} title={`Assign to ${row.name}`} selected={target===row.id} disabled={busy||checking} onPress={()=>{setTarget(row.id);setCheck(null);}}/>)}
        {!targetEligible&&<InlineNotice tone="error" message="This saved assignee is office only or no longer eligible for new field assignments. Existing work remains assigned; choose someone else to reassign this job."/>}
        {apparentConflict(assignment,jobs,target)&&!check&&<InlineNotice message="The loaded schedule suggests an overlapping visit. Check availability before confirming."/>}
        {!check&&<PrimaryButton title="Check assignment availability" busy={checking} disabled={busy||!targetEligible||target===(assignment.assignedTo||null)||!context.online} onPress={preflight}/>}
        {check&&!check.available&&<InlineNotice tone="error" message={check.reason||'This staff member is unavailable or has a schedule conflict. Choose someone else or change the appointment on the web.'}/>}
        {assignment.status==='in-progress'&&<><InlineNotice message="Work has started. Review saved notes, photos, visit evidence and any unsynchronized work with the technician before changing this assignment. Existing work is preserved; offline work on the previous assignment may require management reconciliation."/><Choice title="I reviewed the work already started" selected={reviewStartedWork} disabled={busy||checking} onPress={()=>setReviewStartedWork(value=>!value)}/></>}
        {check?.available&&targetEligible&&<><InlineNotice message={`Assign this appointment to ${team.find(row=>row.id===target)?.name||'Unassigned'}? Date, time and service property remain unchanged.`}/><PrimaryButton title="Confirm job assignment" busy={busy} disabled={assignment.status==='in-progress'&&!reviewStartedWork} onPress={()=>{if(targetEligible&&(assignment.status!=='in-progress'||reviewStartedWork))mutate(()=>saveManagementAssignment(assignment,target,{reviewStartedWork}),'Job assignment saved. The affected schedules have been refreshed.');}}/></>}
        <SecondaryButton title="Cancel assignment" disabled={busy||checking} onPress={()=>{setAssignment(null);setCheck(null);}}/>
      </Card></ActionDialog>}
      {exceptionJob&&<ActionDialog title="Review reassignment request" busy={busy} onClose={()=>{setExceptionJob(null);reviewAttempt.current=null;}} testID="management-exception-dialog">
        <SectionHeader title={exceptionJob.customerName||'Customer'} subtitle={`${dayLabel(exceptionJob.date)} · ${exceptionJob.time||'Time not set'}`}/>
        {!!notice&&<InlineNotice {...notice}/>}
        <Text style={{color:palette.text,lineHeight:22}}>Assigned: {team.find(row=>row.id===exceptionJob.assignedTo)?.name||exceptionJob.assignedToName||'Saved staff assignment'}</Text>
        <Text style={{color:palette.text,lineHeight:22}}>{REASSIGNMENT_REASONS[exceptionJob.reassignmentRequest.reason]||'Management review requested'}</Text>
        {!!exceptionJob.reassignmentRequest.notes&&<Text style={{color:palette.secondary,lineHeight:22}}>{exceptionJob.reassignmentRequest.notes}</Text>}
        {requestChanged?<InlineNotice tone="error" message="The request or job changed while this review was open. Close and reopen it to review the latest information."/>:<>
          <GlassInput label="Management explanation (optional)" multiline maxLength={2000} value={explanation} editable={!busy&&!reviewAttempt.current} onChangeText={setExplanation}/>
          <PrimaryButton title="Reassign this job" disabled={busy||!context.online} onPress={()=>{if(!busy&&!requestChanged){const latest=selectedRequest;setExceptionJob(null);reviewAttempt.current=null;beginAssignment(latest);}}}/>
          <SecondaryButton title="Resolve request without reassignment" disabled={busy||!context.online} onPress={()=>reviewRequest('resolve')}/>
          <SecondaryButton title="Dismiss request" disabled={busy||!context.online} onPress={()=>reviewRequest('dismiss')}/>
        </>}
        <SecondaryButton title="Close request review" disabled={busy} onPress={()=>{setExceptionJob(null);reviewAttempt.current=null;}}/>
      </ActionDialog>}
  </View>;
}
