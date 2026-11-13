import React, { useEffect, useState } from 'react';
import { View, Text, Button, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../constants/firebase';
import { scopeWhere } from '../services/tenancy';
import { cachedRead, savePhotoOffline, queuedWork, subscribeOffline } from '../services/offline';

export default function JobPhotos({ job }) {
  const [photos, setPhotos] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    try {
      const saved = await cachedRead(`photos:${job.id}`, async () => { const snap = await getDocs(query(collection(db, 'photos'), scopeWhere(), where('jobId', '==', job.id), limit(100))); return snap.docs.map((d) => ({ id: d.id, ...d.data() })); }).catch(() => []);
      const local = (await queuedWork()).filter((row) => row.kind === 'photo' && row.jobId === job.id && !['synced', 'discarded'].includes(row.state)).map((row) => ({ id: row.id, url: row.localUri, caption: `Photo ${row.state}` }));
      setPhotos([...saved, ...local.filter((row) => !saved.some((photo) => photo.id === row.id))]);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (job?.id) load(); return subscribeOffline(load); }, [job?.id]);
  const capture = async (camera) => {
    setBusy(true); setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access in Settings to take a job photo.');
      const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], quality: 0.85, exif: false, allowsMultipleSelection: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const dimension = asset.width >= asset.height ? 'width' : 'height';
      const compressed = await manipulateAsync(asset.uri, [{ resize: { [dimension]: Math.min(1600, asset[dimension]) } }], { compress: 0.8, format: SaveFormat.JPEG });
      await savePhotoOffline(job, compressed.uri);
      await load();
    } catch (e) { setError(e.message); Alert.alert('Could not save photo', e.message); }
    finally { setBusy(false); }
  };
  if (!job?.id) return null;
  return <View style={{ marginVertical: 16 }}>
    <Text style={{ fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Job photos</Text>
    <View style={{ flexDirection: 'row', gap: 12 }}><Button title={busy ? 'Saving…' : 'Take photo'} disabled={busy} onPress={() => capture(true)} /><Button title="Choose photo" disabled={busy} onPress={() => capture(false)} /></View>
    <Text style={{ color: '#64748b', marginVertical: 6 }}>Photos stay on this device until uploaded. Sync resumes while the app is open and connected.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text>}
    <ScrollView horizontal>{photos.map((photo) => <Image key={photo.id} accessibilityLabel={photo.caption || 'Job photo'} source={{ uri: photo.url }} style={{ width: 140, height: 140, margin: 5, borderRadius: 8 }} />)}</ScrollView>
  </View>;
}
