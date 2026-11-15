import React, { useEffect, useRef, useState } from 'react';
import { Text, View, Platform } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import Constants from 'expo-constants';
import { useTheme } from '../theme/ThemeProvider';
import { Card, EmptyState, InlineNotice, LoadingState, SecondaryButton, SectionHeader } from './MobileUI';
import { visibleTeamMarkers, nextScheduledJob } from '../services/managementPolicy';

export const updatedLabel=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString():'Not available';};
export default function ManagementTeamMap({team=[],jobs=[],policy={},onOpenSchedule}){
  const {palette,isDark}=useTheme(),map=useRef(null),fitted=useRef(false),[ready,setReady]=useState(false),[selected,setSelected]=useState(null),[error,setError]=useState('');
  const markers=visibleTeamMarkers(team,policy,Date.now()),selectedRow=markers.find(row=>row.id===selected);
  const fit=()=>{if(!ready||!markers.length)return;try{map.current?.fitToCoordinates(markers.map(row=>row.coordinate),{edgePadding:{top:55,right:40,bottom:55,left:40},animated:true});setError('');}catch{setError('The map could not fit these locations. Try again.');}};
  useEffect(()=>{if(ready&&!fitted.current&&markers.length){fitted.current=true;fit();}},[ready,markers.length]);
  const first=markers[0]?.coordinate;
  if(Platform.OS==='web')return <InlineNotice message="The team map is available in the native iOS and Android applications. Use Team to inspect authorized location details here."/>;
  if(Platform.OS==='android'&&Constants.expoConfig?.extra?.nativeMaps?.androidConfigured!==true)return <InlineNotice tone="error" message="The Android build needs its restricted Google Maps Android API key. Configure EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY on the build machine, then rebuild locally. Team schedules and location status remain available in Team."/>;
  if(!markers.length)return <EmptyState title="No shareable team locations" message="Locations appear after staff start a shift and explicitly share work location. Off-duty and stopped-sharing positions are hidden. Being on duty does not guarantee a GPS fix."/>;
  const next=selectedRow?nextScheduledJob(jobs,selectedRow.id):null;
  return <View style={{gap:14}}>
    <InlineNotice message="Last updated positions, not continuous live tracking. Grey markers are stale last-known positions. Opening this map never activates your location."/>
    {!ready&&<LoadingState message="Loading team map…"/>}
    {!!error&&<InlineNotice tone="error" message={error}/>}
    <View style={{height:350,borderRadius:20,overflow:'hidden',borderWidth:1,borderColor:palette.border}}>
      <MapView ref={map} testID="management-team-map" style={{flex:1}} userInterfaceStyle={isDark?'dark':'light'} loadingEnabled loadingIndicatorColor={palette.accent} loadingBackgroundColor={palette.surface}
        initialRegion={{...first,latitudeDelta:0.12,longitudeDelta:0.12}} showsUserLocation={false} showsMyLocationButton={false}
        onMapReady={()=>setReady(true)} accessibilityLabel="Authorized on-duty team locations">
        {markers.map(row=><Marker key={row.id} identifier={row.id} coordinate={row.coordinate} title={row.name}
          description={`${row.locationState==='fresh'?'Last updated':'Stale last known'}: ${updatedLabel(row.location.capturedAt||row.location.updatedAt)}`}
          pinColor={row.locationState==='fresh'?'#087B55':'#66756E'} onPress={()=>setSelected(row.id)}/>) }
      </MapView>
    </View>
    <SecondaryButton title="Fit visible team" disabled={!ready} onPress={fit}/>
    {selectedRow&&<Card><SectionHeader title={selectedRow.name} subtitle={selectedRow.locationState==='fresh'?'On duty · recent authorized position':'On duty · stale last-known position'}/>
      <Text style={{color:palette.secondary,lineHeight:22}}>Last updated: {updatedLabel(selectedRow.location.capturedAt||selectedRow.location.updatedAt)}</Text>
      {Number.isFinite(selectedRow.location.accuracy)&&<Text style={{color:palette.secondary}}>Accuracy: ±{Math.round(selectedRow.location.accuracy)} m</Text>}
      <Text style={{color:palette.text,lineHeight:22}}>{next?`Next selected-day visit: ${next.time||'Time not set'} · ${next.customerName||'Customer'}`:'No remaining job in the selected-day schedule.'}</Text>
      <SecondaryButton title="Open technician schedule" onPress={()=>onOpenSchedule(selectedRow.id)}/>
    </Card>}
    <Text style={{color:palette.secondary,lineHeight:22}}>Select a marker for its update time, accuracy and schedule. Use Fit visible team to recenter; refresh does not move your map.</Text>
  </View>;
}
