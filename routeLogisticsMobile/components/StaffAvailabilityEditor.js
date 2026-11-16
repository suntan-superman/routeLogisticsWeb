import React, { useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeProvider';
import { Card, SectionHeader, PrimaryButton, SecondaryButton, InlineNotice } from './MobileUI';
import QuarterHourTimeField from './QuarterHourTimePicker';
import { localDay } from '../services/workQueryPolicy';
import { localDate, validDay, instantFromLocal, availabilityLabel } from '../services/managementPolicy';
import { dayLabel } from '../services/workPresentation';

export default function StaffAvailabilityEditor({member,busy,onSave,onCancel,onDraftChange}){
  const {palette}=useTheme(),[reason,setReason]=useState('sick'),[startDate,setStartDate]=useState(localDay),[endDate,setEndDate]=useState(localDay);
  const [expectedRevision]=useState(()=>member.availability?.revision||0);
  const [initialFieldWork]=useState(()=>member.fieldWorkEnabled!==false&&member.availability?.fieldWorkEnabled!==false);
  const [fieldWorkEnabled,setFieldWorkEnabled]=useState(initialFieldWork),[availabilityEdited,setAvailabilityEdited]=useState(false);
  const fieldWorkDirty=fieldWorkEnabled!==initialFieldWork,temporaryDisabled=busy||fieldWorkDirty;
  const now=new Date(),nextQuarter=Math.floor((now.getHours()*60+now.getMinutes())/15)*15;
  const [startTime,setStartTime]=useState(()=>`${String(Math.min(23,Math.floor(nextQuarter/60))).padStart(2,'0')}:${String(nextQuarter>=1440?45:nextQuarter%60).padStart(2,'0')}`);
  const [endTime,setEndTime]=useState('23:45'),[picker,setPicker]=useState(null),[confirm,setConfirm]=useState(null);
  const start=instantFromLocal(startDate,startTime),end=instantFromLocal(endDate,endTime),valid=!!start&&!!end&&Date.parse(end)>Date.parse(start);
  const edited=()=>{setConfirm(null);setAvailabilityEdited(true);onDraftChange?.(true);};
  const status=reason==='emergency'?'available':'unavailable';
  const labels={sick:'Sick leave',vacation:'Vacation','off-duty':'Off duty',emergency:'Emergency available',other:'Other unavailability'};
  const save=()=>onSave({memberId:member.id,action:'set',status,reason,startsAt:start,endsAt:end,expectedRevision});
  return <Card><SectionHeader title={`Availability · ${member.name}`} subtitle={availabilityLabel(member.availability)}/>
    <SectionHeader title="Field work settings" subtitle={initialFieldWork?'Field work enabled':'Office only'}/>
    <Pressable accessibilityRole="checkbox" accessibilityLabel="Can be assigned field work" accessibilityState={{checked:fieldWorkEnabled,disabled:busy||availabilityEdited}} disabled={busy||availabilityEdited}
      onPress={()=>{setFieldWorkEnabled(value=>!value);setConfirm(null);setPicker(null);onDraftChange?.(true);}}
      style={{padding:12,minHeight:48,borderWidth:1,borderColor:fieldWorkEnabled?palette.accent:palette.border,borderRadius:12,backgroundColor:fieldWorkEnabled?palette.glow:palette.input}}><Text style={{color:palette.text,lineHeight:22}}>{fieldWorkEnabled?'☑':'☐'} Can be assigned field work</Text></Pressable>
    <Text style={{color:palette.secondary,lineHeight:22}}>Office-only staff keep their role, management access and existing appointments. This setting controls new field assignments; it does not start or end a shift, change location consent, or change temporary leave.</Text>
    {availabilityEdited&&<InlineNotice message="Save or cancel the temporary availability changes before changing field-work settings."/>}
    <PrimaryButton title="Save field work setting" disabled={busy||!fieldWorkDirty||availabilityEdited} onPress={()=>setConfirm('field-work')}/>
    {confirm==='field-work'&&<><InlineNotice message={`${fieldWorkEnabled?'Allow':'Stop offering'} new field assignments for ${member.name}? Existing appointments, role, duty and location consent stay unchanged.`}/>
      <PrimaryButton title="Confirm field work setting" busy={busy} onPress={()=>onSave({memberId:member.id,action:'set-field-work',fieldWorkEnabled,expectedRevision})}/><SecondaryButton title="Keep editing field work setting" disabled={busy} onPress={()=>setConfirm(null)}/></>}
    <SectionHeader title="Temporary availability"/>
    <InlineNotice message="This changes scheduling availability only. It does not change account access, start a shift or enable GPS. An emergency window temporarily overrides leave; the leave resumes afterward."/>
    <View accessibilityRole="radiogroup" accessibilityLabel="Availability reason" style={{gap:8}}>{Object.entries(labels).map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:reason===value,disabled:temporaryDisabled}} disabled={temporaryDisabled} onPress={()=>{edited();setReason(value);}}
      style={{padding:12,minHeight:46,borderWidth:1,borderColor:reason===value?palette.accent:palette.border,borderRadius:12,backgroundColor:reason===value?palette.glow:palette.input}}><Text style={{color:palette.text,fontWeight:reason===value?'700':'400'}}>{label}</Text></Pressable>)}</View>
    <SecondaryButton title={`Starts: ${dayLabel(startDate)}`} disabled={temporaryDisabled} onPress={()=>setPicker('start')}/>
    <QuarterHourTimeField label="Availability start time" value={startTime} disabled={temporaryDisabled} onChange={value=>{edited();setStartTime(value);}}/>
    <SecondaryButton title={`Ends: ${dayLabel(endDate)}`} disabled={temporaryDisabled} onPress={()=>setPicker('end')}/>
    <QuarterHourTimeField label="Availability end time" value={endTime} disabled={temporaryDisabled} onChange={value=>{edited();setEndTime(value);}}/>
    {picker&&!fieldWorkDirty&&<><DateTimePicker value={localDate(picker==='start'?startDate:endDate)} mode="date" display={Platform.OS==='ios'?'inline':'default'} disabled={busy} onChange={(event,date)=>{
      if(event.type==='dismissed'){setPicker(null);return;}
      if(!date)return;
      const day=localDay(date);
      if(validDay(day)){edited();(picker==='start'?setStartDate:setEndDate)(day);if(Platform.OS!=='ios')setPicker(null);}
    }}/><SecondaryButton title="Done choosing date" onPress={()=>setPicker(null)}/></>}
    <Text style={{color:palette.secondary,lineHeight:22}}>Times use this device’s local time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Both endpoints are sent as exact instants.</Text>
    {!valid&&<InlineNotice tone="error" message="Choose a valid end date and time after the start. Unavailable daylight-saving times cannot be selected."/>}
    {!confirm&&<><PrimaryButton title="Review availability change" disabled={temporaryDisabled||!valid} onPress={()=>setConfirm('set')}/><SecondaryButton title="Restore normal availability" disabled={temporaryDisabled||!(member.availability?.scheduled>0||member.availability?.active)} onPress={()=>setConfirm('clear')}/></>}
    {['set','clear'].includes(confirm)&&<><InlineNotice message={confirm==='clear'?`Remove all manual availability windows for ${member.name}? Shift and location consent will stay unchanged.`:`Set ${member.name} ${status} from ${new Date(start).toLocaleString()} to ${new Date(end).toLocaleString()}? Existing appointments remain for dispatcher review.`}/>
      <PrimaryButton title="Confirm availability change" busy={busy} onPress={()=>confirm==='clear'?onSave({memberId:member.id,action:'clear',expectedRevision}):save()}/><SecondaryButton title="Keep editing availability" disabled={busy} onPress={()=>setConfirm(null)}/></>}
    <SecondaryButton title="Cancel availability changes" disabled={busy} onPress={onCancel}/>
  </Card>;
}
