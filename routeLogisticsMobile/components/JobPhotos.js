import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import React, { useEffect, useState } from 'react';
import { View, Text, Button, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { cachedRead, savePhotoOffline, queuedWork, subscribeOffline } from '../services/offline';
import { useTheme } from '../theme/ThemeProvider';

export default function JobPhotos({ job }) {
  const { palette } = useTheme();
  const [photos, setPhotos] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    try {
      const saved = await cachedRead(`photos:${job.id}`, async () => { const data = await readWorkspace('photos', { jobId: job.id }); return data.photos; }).catch(() => []);
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
    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Job photos</Text>
    <View style={{ flexDirection: 'row', gap: 12 }}><Button title={busy ? 'Saving…' : 'Take photo'} disabled={busy} onPress={() => capture(true)} /><Button title="Choose photo" disabled={busy} onPress={() => capture(false)} /></View>
    <Text style={{ color: palette.secondary, marginVertical: 6 }}>Photos stay on this device until uploaded. Sync resumes while the app is open and connected.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}
    <ScrollView horizontal>{photos.map((photo) => <PrivatePhoto key={photo.id} photo={photo} style={{ width: 140, height: 140, margin: 5, borderRadius: 8 }} />)}</ScrollView>
  </View>;
}

function PrivatePhoto({ photo, style }) {
  const [uri, setUri] = useState(photo.url || ''), [error, setError] = useState('');
  return <View>{uri ? <Image source={{ uri }} style={style} /> : <Button title="View photo" onPress={async () => { try { setUri((await callWorkspace('rlJobPhoto', { action: 'read', photoId: photo.id })).dataUri); } catch (e) { setError(e.message); } }} />}{!!error && <Text>{error}</Text>}</View>;
}
