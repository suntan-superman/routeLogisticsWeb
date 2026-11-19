import { callWorkspace, readWorkspace } from './workspaceApi';
export async function readManagementJobs(date) {
  const jobs=[];let after=null,page;
  do {
    page=await readWorkspace('jobs',{date,limit:500,...(after?{after}:{})});
    jobs.push(...page.jobs);after=page.lastDoc;
  } while(page.hasMore&&after&&jobs.length<5000);
  return {jobs,hasMore:page.hasMore};
}
export const readManagementAttention=()=>readWorkspace('managementAttention');
export const readManagementTeam=()=>callWorkspace('rlGetRoutingTeam');
export const readManagementLocations=()=>callWorkspace('rlGetTeamLocations');
export const readManagementRoute=(memberId,date)=>callWorkspace('rlGetDailyRoute',{memberId,date});
export const checkManagementAssignment=(job,memberId)=>memberId?callWorkspace('rlCheckAvailability',{action:'check',memberId,date:job.date,time:job.time,estimatedDuration:Number(job.estimatedDuration??job.duration??1),jobId:job.id}):Promise.resolve({available:true});
export const saveManagementAssignment=(job,memberId,options={})=>callWorkspace('rlManageJob',{action:'assign',id:job.id,memberId:memberId||null,expectedVersion:job.updatedAt||null,...(options.reviewStartedWork===true?{reviewStartedWork:true}:{})});
export const saveStaffAvailability=options=>callWorkspace('rlManageStaffAvailability',options);
