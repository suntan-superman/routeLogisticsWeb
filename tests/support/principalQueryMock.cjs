const {createWorkspaceQueryMock}=require('./workspaceQueryMock.cjs');
// Form suites keep a lightweight cache adapter; the real principal-hook suite
// separately exercises React Query, authentication changes and access denial.
function createPrincipalQueryMock(React){
 const hooks=createWorkspaceQueryMock(React);
 function usePrincipalQuery(namespace,principal,resource,loader,{enabled=true,current=()=>true}={}){
  const readable=!!principal&&enabled;
  const valid=()=>readable&&current(principal);
  const query=hooks.useWorkspaceQuery([namespace,principal||'',...resource],async()=>{
   if(!valid())throw Object.assign(Error('Your sign-in changed.'),{code:'auth/user-changed'});
   const result=await loader();
   if(!valid())throw Object.assign(Error('Your sign-in changed.'),{code:'auth/user-changed'});
   return result;
  },{enabled:readable});
  const denied=['permission-denied','unauthenticated','not-found','user-changed'].includes(String(query.error?.code||'').split('/').pop());
  return{...query,data:valid()&&!denied?query.data:undefined,refetch:()=>valid()?query.refetch():Promise.resolve({data:undefined}),setData:update=>{if(valid())query.setData(update);}};
 }
 return{usePrincipalQuery,refresh:hooks.useInvalidateWorkspace()};
}
module.exports={createPrincipalQueryMock};
