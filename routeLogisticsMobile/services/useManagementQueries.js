import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkQueryScope } from '../contexts/WorkQueryProvider';
import { WORK_POLL_MS, accessError, workScopeKey } from './workQueryPolicy';
import { readManagementJobs, readManagementTeam, readManagementLocations, readManagementRoute } from './managementOperations';

export function useManagementRead(name,args,fetcher,{enabled=true}={}) {
  const context=useWorkQueryScope(),client=useQueryClient(),scope=JSON.stringify(context.scope);
  const visible=enabled&&!!context.user?.companyId,queryKey=[...context.scope,'management',name,...args],key=JSON.stringify(queryKey);
  useEffect(()=>visible?context.registerVisibleQuery(JSON.parse(key)):undefined,[context.registerVisibleQuery,key,visible]);
  const query=useQuery({queryKey,meta:{resource:`management-${name}`},enabled:visible&&context.canReadWork&&context.active,
    refetchInterval:state=>visible&&context.canReadWork&&context.active&&context.online&&!accessError(state.state.error)?WORK_POLL_MS:false,
    refetchOnWindowFocus:state=>!accessError(state.state.error),refetchOnReconnect:state=>!accessError(state.state.error),
    queryFn:async({signal})=>{const data=await fetcher();if(signal.aborted)throw Object.assign(new Error('Management read cancelled.'),{name:'AbortError'});return data;}});
  const refetch=useCallback(async()=>{
    if(!context.canReadWork){const result=await context.refreshAccess();if(!result?.success||!result.authoritative||JSON.stringify(workScopeKey(result.user))!==scope||result.accessStatus!=='ready')return;}
    return query.refetch();
  },[context.canReadWork,context.refreshAccess,scope,query.refetch]);
  const invalidate=useCallback(()=>client.invalidateQueries({queryKey:JSON.parse(scope)},{cancelRefetch:false}),[client,scope]);
  const readable=context.canReadWork&&!accessError(query.error);
  return {...query,data:readable?query.data:undefined,canReadWork:readable,accessStatus:context.accessStatus,accessError:context.accessError,online:context.online,refetch,invalidate};
}
export function useManagementData(date,{enabled=true,canViewLocations=true}={}){
  const jobs=useManagementRead('jobs',[date],()=>readManagementJobs(date),{enabled});
  const team=useManagementRead('team',[],readManagementTeam,{enabled});
  const positions=useManagementRead('locations',[],readManagementLocations,{enabled:enabled&&canViewLocations});
  const refresh=useCallback(()=>Promise.all([jobs.refetch(),team.refetch(),...(canViewLocations?[positions.refetch()]:[])]),[jobs.refetch,team.refetch,positions.refetch,canViewLocations]);
  return {jobs,team,positions,refresh};
}
export function useManagementRoute(memberId,date,{enabled=true}={}){
  return useManagementRead('route',[date,memberId],()=>readManagementRoute(memberId,date),{enabled:enabled&&!!memberId});
}
