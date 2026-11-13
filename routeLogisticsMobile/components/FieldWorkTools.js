import React, { useState } from 'react';
import { View, Text, TextInput, Button, Linking, Alert } from 'react-native';
import { JobService } from '../services/firebase';
import { saveApplicationOffline } from '../services/offline';
import { getClaims } from '../services/tenancy';
import { useTheme } from '../theme/ThemeProvider';

export default function FieldWorkTools({ job, onChanged }) {
  const { palette } = useTheme();
  const [notes, setNotes] = useState(job?.workNotes || (getClaims()?.role === 'technician' ? job?.notes : '') || ''), [form, setForm] = useState(null), [busy, setBusy] = useState(false);
  if (!job?.id) return null;
  const inputStyle = { color: palette.text, borderColor: palette.secondary, borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 5 };
  const save = async patch => {
    setBusy(true);
    try { const result = await JobService.updateJob(job.id, patch); if (!result.success) throw new Error(result.error?.message || result.error || 'Unable to save work.'); Alert.alert('Work saved', 'Saved on this device. Authorization is checked again during synchronization.'); onChanged?.(); }
    catch (e) { Alert.alert('Could not save work', e.message); } finally { setBusy(false); }
  };
  const address = [job.address, job.city, job.state, job.zipCode].filter(value => typeof value === 'string').join(', ');
  const destination = typeof job.latitude === 'number' && typeof job.longitude === 'number' ? `${job.latitude},${job.longitude}` : address;
  return <View style={{ gap: 8, marginVertical: 16 }}>
    {!!destination && <Button title="Navigate to job" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`).catch(e => Alert.alert('Navigation unavailable', e.message))} />}
    {job.status === 'scheduled' && <Button title="Mark en route" disabled={busy} onPress={() => save({ status: 'en-route' })} />}
    {['scheduled', 'en-route'].includes(job.status) && <Button title="Start work" disabled={busy} onPress={() => save({ status: 'in-progress' })} />}
    <Text style={{ color: palette.text, fontWeight: '700' }}>Work notes</Text>
    <TextInput accessibilityLabel="Work notes" value={notes} onChangeText={setNotes} multiline style={inputStyle} />
    <Button title="Save work notes" disabled={busy} onPress={() => save({ notes })} />
    {!form ? <Button title="Record product application" onPress={() => setForm({ product: '', targetPest: '', amount: '', unit: '', epaRegNo: '', areaTreated: '', method: '', applicatorLicense: '', notes: '' })} /> : <View>
      {Object.entries({ product: 'Product', targetPest: 'Target pest', amount: 'Quantity', unit: 'Unit', epaRegNo: 'EPA registration', areaTreated: 'Area treated', method: 'Method', applicatorLicense: 'Applicator license', notes: 'Application notes' }).map(([key, label]) => <View key={key}><Text style={{ color: palette.text }}>{label}</Text><TextInput accessibilityLabel={label} value={form[key]} onChangeText={value => setForm(previous => ({ ...previous, [key]: value }))} keyboardType={key === 'amount' ? 'decimal-pad' : 'default'} style={inputStyle} /></View>)}
      <Button title="Save application" disabled={busy} onPress={async () => {
        if (!form.product.trim() || !form.targetPest.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) return Alert.alert('Application details required', 'Enter product, pest and a positive quantity.');
        setBusy(true); try { await saveApplicationOffline(job.id, { ...form, amount: Number(form.amount) }); setForm(null); Alert.alert('Application saved', 'The record will synchronize while the app is open and connected.'); } catch (e) { Alert.alert('Could not save application', e.message); } finally { setBusy(false); }
      }} /><Button title="Cancel application" onPress={() => setForm(null)} />
    </View>}
  </View>;
}
