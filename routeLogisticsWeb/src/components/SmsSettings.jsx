import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import { SMS_PURPOSE_LABELS } from '../utils/smsLabels';
export default function SmsSettings() {
  const { company, currentUser } = useAuth(), owner = !!company && company.ownerId === currentUser?.uid;
  const [data,setData] = useState(null), [settings,setSettings] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  useEffect(() => {
    let current=true;
    if(owner) callWorkspace('rlSmsConfig',{action:'status',companyId:company.id}).then(value=>{if(current){setData(value);setSettings(value.settings);}}).catch(failure=>{if(current)setError(failure.message);});
    return ()=>{current=false;};
  },[owner,company?.id]);
  if(!owner) return <section className="rounded border bg-white p-6"><h2 className="text-xl font-semibold">Customer SMS</h2><p>The company owner manages SMS templates and timing. Customer consent is managed in Customer Details.</p></section>;
  const save=async()=>{setBusy(true);setError('');setMessage('');try{const value=await callWorkspace('rlSmsConfig',{action:'save',companyId:company.id,settings});setData(value);setSettings(value.settings);setMessage('SMS settings saved. Customer delivery still requires the server and registered sender approvals shown above.');}catch(failure){setError(failure.message);}finally{setBusy(false);}};
  const patch=value=>setSettings(previous=>({...previous,...value}));
  return <section aria-label="Customer SMS settings" className="rounded border bg-white p-6 space-y-4">
    <h2 className="text-xl font-semibold">Customer SMS</h2>
    <p>Messages use explicit consent for each selected purpose. Existing customers are never opted in automatically.</p>
    {data && <div role="status" className="rounded bg-gray-50 p-3"><p>Customer delivery: {data.delivery.active && data.delivery.senderApproved && settings?.enabled ? 'Approved for consented individual service messages' : 'Disabled or awaiting operator approval'}</p><p>Registered Route Logistics sender: {data.delivery.senderApproved?'Approved':'Not approved'} · Scheduled automation: {data.delivery.automationApproved?'Approved':'Not approved'}</p></div>}
    <p className="text-sm text-gray-600">Saving these settings cannot activate server delivery, register a messaging campaign, or send a text. No bulk-send action is available.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}
    {!settings && !error && <p>Loading SMS settings…</p>}
    {settings && <fieldset disabled={busy} className="space-y-4">
      <label className="flex gap-2"><input type="checkbox" checked={settings.enabled} onChange={event=>patch({enabled:event.target.checked})}/>Prepare company service messaging</label>
      <label className="block">Company time zone<input className="input-field block" value={settings.timeZone} onChange={event=>patch({timeZone:event.target.value})}/></label>
      <label className="block">Pre-visit reminder<select className="input-field block" value={settings.reminderMinutes} onChange={event=>patch({reminderMinutes:Number(event.target.value)})}>{[[30,'30 minutes'],[60,'1 hour'],[120,'2 hours'],[1440,'1 day']].map(([value,label])=><option key={value} value={value}>{label} before the visit</option>)}</select></label>
      <label className="block">Optional follow-up<select className="input-field block" value={settings.followUpMinutes} onChange={event=>patch({followUpMinutes:Number(event.target.value)})}>{[[60,'1 hour'],[1440,'1 day'],[2880,'2 days']].map(([value,label])=><option key={value} value={value}>{label} after completion</option>)}</select></label>
      <p className="text-sm text-gray-600">Templates support {'{date}'} and {'{time}'}. The company name and STOP/HELP instructions are added automatically. Keep customer details, account information, financial content and links out of templates.</p>
      {Object.entries(SMS_PURPOSE_LABELS).map(([purpose,label])=><div key={purpose} className="space-y-2"><label className="flex gap-2"><input type="checkbox" checked={settings.purposes.includes(purpose)} onChange={event=>patch({purposes:event.target.checked?[...settings.purposes,purpose]:settings.purposes.filter(value=>value!==purpose)})}/>{label}</label><textarea aria-label={`${label} template`} className="input-field w-full" maxLength={300} value={settings.templates[purpose]} onChange={event=>patch({templates:{...settings.templates,[purpose]:event.target.value}})}/></div>)}
      <button className="btn-primary" onClick={save}>Save SMS settings</button>
    </fieldset>}
  </section>;
}
