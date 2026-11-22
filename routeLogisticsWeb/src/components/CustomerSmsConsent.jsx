import SelectControl from './SelectControl';
import { useEffect, useRef, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import { SMS_PURPOSE_LABELS } from '../utils/smsLabels';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';

export default function CustomerSmsConsent({customer}) {
  const [purposes,setPurposes]=useState([]),[source,setSource]=useState('written'),[evidence,setEvidence]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[refreshMessage,setRefreshMessage]=useState(''),[attempted,setAttempted]=useState(false);
  const baseline = useRef('[]'), draft = useRef(false);
  const missing = [!purposes.length && 'select at least one message purpose', !evidence.trim() && 'enter an evidence reference', !accepted && 'confirm the customer agreed'].filter(Boolean);
  draft.current = accepted || !!evidence.trim() || source !== 'written' || JSON.stringify(purposes) !== baseline.current;
  const consentQuery = useWorkspaceQuery(['sms-consent', customer.id], () => callWorkspace('rlSmsCustomerConsent', { action: 'status', customerId: customer.id }));
  const data = consentQuery.data;
  useEffect(()=>{setPurposes([]);setAccepted(false);setEvidence('');setSource('written');setError('');setMessage('');setRefreshMessage('');setAttempted(false);baseline.current='[]';draft.current=false;},[customer.id]);
  useEffect(()=>{if(data && !draft.current){const next=data.consent?.purposes||[];baseline.current=JSON.stringify(next);setPurposes(next);}},[data]);
  const save=async action=>{setAttempted(true);setError('');setMessage('');if(action==='grant'&&missing.length)return;setBusy(true);try{const result=await callWorkspace('rlSmsCustomerConsent',{action,customerId:customer.id,...(action==='grant'?{purposes,source,evidence,disclosureAccepted:accepted,disclosure:data.disclosure}:{})});consentQuery.setData(previous=>({...previous,consent:result.consent}));const next=result.consent?.purposes||[];baseline.current=JSON.stringify(next);setPurposes(next);setAccepted(false);setEvidence('');setSource('written');setAttempted(false);setMessage(result.ambiguous?'Preferences recorded, but this phone is associated with multiple companies. Delivery stays blocked for operator review.':action==='grant'?'Customer consent saved. No message was sent.':'Customer SMS consent revoked. No message was sent.');}catch(failure){setError(failure.message);}finally{setBusy(false);}};
  return <section aria-label="Customer SMS consent" className="mt-6 border-t pt-4 space-y-3">
    <h4 className="font-semibold">SMS preferences and consent</h4><p className="text-sm">Recording a customer phone number does not provide permission to text. Select only purposes the customer explicitly agreed to.</p>
    {consentQuery.error&&<p role="alert" className="text-red-700">{consentQuery.error.message}</p>}
    {data&&<><p>Consent: {data.consent?.status||'Not recorded'}{data.consent?.grantedAt?` · Recorded ${new Date(data.consent.grantedAt).toLocaleString()}`:''}</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={async()=>{setRefreshMessage('');const result=await consentQuery.refetch();setRefreshMessage(result.error?`Could not refresh SMS status: ${result.error.message}`:'SMS status refreshed. No message was sent.');}}>Refresh SMS status</button>
      {refreshMessage&&<p role={refreshMessage.startsWith('Could not')?'alert':'status'} className={refreshMessage.startsWith('Could not')?'text-red-700':'text-emerald-700'}>{refreshMessage}</p>}
      {data.suppressed&&<p role="alert">This number opted out. Staff cannot override STOP. The customer must reply START or UNSTOP to the approved sender, then give fresh Route Logistics consent. START alone does not restore consent. Refresh SMS status after the provider confirms the reply; shared-company numbers require operator review.</p>}
      {data.ambiguous&&<p role="alert">This phone is associated with multiple companies. Delivery stays blocked until an operator reviews its messaging association.</p>}
      <fieldset disabled={busy||data.suppressed} className="space-y-3">
        <p className="rounded bg-gray-50 p-3 text-sm">{data.disclosure}</p>
        {Object.entries(SMS_PURPOSE_LABELS).map(([purpose,label])=><label className="flex gap-2" key={purpose}><input type="checkbox" checked={purposes.includes(purpose)} onChange={event=>setPurposes(previous=>event.target.checked?[...previous,purpose]:previous.filter(value=>value!==purpose))}/>{label}</label>)}
        <label className="block">Consent source<SelectControl className="input-field block" value={source} onChange={event=>setSource(event.target.value)}><option value="written">Written form</option><option value="web-form">Customer web form</option><option value="verbal">Recorded verbal agreement</option></SelectControl></label>
        <label className="block">Evidence reference<input aria-label="SMS consent evidence reference" className="input-field w-full" maxLength={500} value={evidence} onChange={event=>setEvidence(event.target.value)} placeholder="Form reference or dated agreement record; no sensitive information"/></label>
        <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>I confirm the customer received this disclosure and explicitly agreed to the selected purposes.</label>
        {!!missing.length&&(data.consent?.status!=='granted'||attempted||draft.current)&&<p role={attempted?'alert':'status'} className={attempted?'text-sm text-red-700':'text-sm text-amber-700'}>Before recording consent: {missing.join('; ')}. No new consent has been saved.</p>}
        <button type="button" className="btn-secondary" disabled={busy} onClick={()=>save('grant')}>Record customer consent</button>
        {error&&<p role="alert" className="text-sm text-red-700">Consent was not saved: {error}</p>}{message&&<p role="status" className="text-sm text-emerald-700">{message}</p>}
      </fieldset>
      {data.consent&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>save('revoke')}>Revoke SMS consent</button>}
      {!!data.history?.length&&<div><h5 className="font-medium">Recent service-message history</h5><ul>{data.history.map(row=><li key={row.id} className="text-sm">{SMS_PURPOSE_LABELS[row.purpose]||row.purpose} · {row.status}{row.failureCode?` · ${row.failureCode}`:''} · {new Date(row.createdAt).toLocaleString()}</li>)}</ul></div>}
    </>}
  </section>;
}
