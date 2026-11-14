import { useEffect, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import { SMS_PURPOSE_LABELS } from '../utils/smsLabels';

export default function CustomerSmsConsent({customer}) {
  const [data,setData]=useState(null),[purposes,setPurposes]=useState([]),[source,setSource]=useState('written'),[evidence,setEvidence]=useState(''),[accepted,setAccepted]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=>{let current=true;setData(null);setPurposes([]);setAccepted(false);setEvidence('');setError('');
    callWorkspace('rlSmsCustomerConsent',{action:'status',customerId:customer.id}).then(value=>{if(current){setData(value);setPurposes(value.consent?.purposes||[]);}}).catch(failure=>{if(current)setError(failure.message);});return()=>{current=false;};
  },[customer.id]);
  const save=async action=>{setBusy(true);setError('');setMessage('');try{const result=await callWorkspace('rlSmsCustomerConsent',{action,customerId:customer.id,...(action==='grant'?{purposes,source,evidence,disclosureAccepted:accepted,disclosure:data.disclosure}:{})});setData(previous=>({...previous,consent:result.consent}));setAccepted(false);setEvidence('');setMessage(result.ambiguous?'Preferences recorded, but this phone is associated with multiple companies. Delivery stays blocked for operator review.':action==='grant'?'Consent evidence recorded. No message was sent.':'Customer SMS consent revoked. No message was sent.');}catch(failure){setError(failure.message);}finally{setBusy(false);}};
  return <section aria-label="Customer SMS consent" className="mt-6 border-t pt-4 space-y-3">
    <h4 className="font-semibold">SMS preferences and consent</h4><p className="text-sm">Recording a customer phone number does not provide permission to text. Select only purposes the customer explicitly agreed to.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}{message&&<p role="status">{message}</p>}
    {data&&<><p>Consent: {data.consent?.status||'Not recorded'}{data.consent?.grantedAt?` · Recorded ${new Date(data.consent.grantedAt).toLocaleString()}`:''}</p>
      {data.suppressed&&<p role="alert">This number opted out. Staff cannot override STOP. The customer must reply START to the approved sender; shared-company numbers require operator review.</p>}
      {data.ambiguous&&<p role="alert">This phone is associated with multiple companies. Delivery stays blocked until an operator reviews its messaging association.</p>}
      <fieldset disabled={busy||data.suppressed} className="space-y-3">
        <p className="rounded bg-gray-50 p-3 text-sm">{data.disclosure}</p>
        {Object.entries(SMS_PURPOSE_LABELS).map(([purpose,label])=><label className="flex gap-2" key={purpose}><input type="checkbox" checked={purposes.includes(purpose)} onChange={event=>setPurposes(previous=>event.target.checked?[...previous,purpose]:previous.filter(value=>value!==purpose))}/>{label}</label>)}
        <label className="block">Consent source<select className="input-field block" value={source} onChange={event=>setSource(event.target.value)}><option value="written">Written form</option><option value="web-form">Customer web form</option><option value="verbal">Recorded verbal agreement</option></select></label>
        <label className="block">Evidence reference<input aria-label="SMS consent evidence reference" className="input-field w-full" maxLength={500} value={evidence} onChange={event=>setEvidence(event.target.value)} placeholder="Form reference or dated agreement record; no sensitive information"/></label>
        <label className="flex gap-2"><input type="checkbox" checked={accepted} onChange={event=>setAccepted(event.target.checked)}/>I confirm the customer received this disclosure and explicitly agreed to the selected purposes.</label>
        <button className="btn-secondary" disabled={!accepted||!purposes.length||!evidence.trim()} onClick={()=>save('grant')}>Record customer consent</button>
      </fieldset>
      {data.consent&&<button className="btn-secondary" disabled={busy} onClick={()=>save('revoke')}>Revoke SMS consent</button>}
      {!!data.history?.length&&<div><h5 className="font-medium">Recent service-message history</h5><ul>{data.history.map(row=><li key={row.id} className="text-sm">{SMS_PURPOSE_LABELS[row.purpose]||row.purpose} · {row.status}{row.failureCode?` · ${row.failureCode}`:''} · {new Date(row.createdAt).toLocaleString()}</li>)}</ul></div>}
    </>}
  </section>;
}
