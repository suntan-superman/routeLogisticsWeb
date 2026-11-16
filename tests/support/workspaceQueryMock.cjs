// Legacy renderer suites test form/navigation behavior without a QueryProvider.
// Polling, cache deduplication and authorization use the real shared-hook suites.
function createWorkspaceQueryMock(React,{scopeId='test-workspace',onInvalidate=null}={}){
 const active=new Set();
 const invalidate=async resources=>{
  if(onInvalidate)return onInvalidate(resources);
  const scope=typeof scopeId==='function'?scopeId():scopeId;
  return Promise.all([...active].filter(entry=>entry.scope===scope&&(!resources?.length||resources.includes(entry.resource))).map(entry=>entry.refetch()));
 };
 function useWorkspaceQuery(key,loader,{enabled=true}={}){
  const scope=typeof scopeId==='function'?scopeId():scopeId,id=JSON.stringify([scope,...key]);
  const load=React.useRef(loader),current=React.useRef({id,live:true});load.current=loader;current.current.id=id;
  const[state,setState]=React.useState({id,data:undefined,error:null,fetching:false});
  const refetch=React.useCallback(async()=>{
   if(!current.current.live||current.current.id!==id)return{data:undefined};
   setState(previous=>({...previous,id,fetching:true}));
   try{const data=await load.current();if(data?.success===false)throw Object.assign(Error(typeof data.error==='string'?data.error:data.error?.message||'Read failed.'),{code:data.code||data.error?.code});
    if(current.current.live&&current.current.id===id)setState({id,data,error:null,fetching:false});return{data};
   }catch(error){if(current.current.live&&current.current.id===id)setState(previous=>({id,data:previous.id===id?previous.data:undefined,error,fetching:false}));return{error};}
  },[id]);
  React.useEffect(()=>{current.current.live=true;return()=>{current.current.live=false;};},[]);
  React.useEffect(()=>{if(enabled)void refetch();},[id,enabled,refetch]);
  React.useEffect(()=>{if(!enabled)return;const entry={scope,resource:key[0],refetch};active.add(entry);return()=>active.delete(entry);},[id,enabled,refetch,scope,key[0]]);
  return{scopeId:scope,readable:true,canRead:true,data:state.id===id?state.data:undefined,error:state.id===id?state.error:null,
   isLoading:enabled&&(!state.data||state.id!==id)&&!state.error,isPending:enabled&&(!state.data||state.id!==id)&&!state.error,isSuccess:state.id===id&&!!state.data&&!state.error,isError:state.id===id&&!!state.error,isFetching:state.fetching,
   refetch,invalidate:()=>onInvalidate?onInvalidate([key[0]]):refetch(),setData:updater=>{if(current.current.live&&current.current.id===id)setState(previous=>({...previous,id,data:typeof updater==='function'?updater(previous.id===id?previous.data:undefined):updater}));}};
 }
 return{useWorkspaceQuery,useInvalidateWorkspace:()=>invalidate};
}
const selectControlMock=React=>({children,...props})=>React.createElement('select',props,children);
module.exports={createWorkspaceQueryMock,selectControlMock};
