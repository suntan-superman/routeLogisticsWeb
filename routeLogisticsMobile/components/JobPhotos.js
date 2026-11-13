import React, { useEffect, useState } from 'react';
import { View, Text, Button, Image, ScrollView, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { collection, doc, setDoc, getDocs, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../constants/firebase';
import { scopeWhere, tenantFields } from '../services/tenancy';

export default function JobPhotos({ job }) {
  const [photos, setPhotos] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    try {
      const snap = await getDocs(query(collection(db, 'photos'), scopeWhere(), where('jobId', '==', job.id), limit(100)));
      setPhotos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { if (job?.id) load(); }, [job?.id]);
  const capture = async (camera) => {
    setBusy(true); setError('');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access in Settings to take a job photo.');
      const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], quality: 0.85, exif: false, allowsMultipleSelection: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      const dimension = asset.width >= asset.height ? 'width' : 'height';
      const compressed = await manipulateAsync(asset.uri, [{ resize: { [dimension]: Math.min(1600, asset[dimension]) } }], { compress: 0.8, format: SaveFormat.JPEG });
      const response = await fetch(compressed.uri);
      const blob = await response.blob();
      try {
        if (blob.size >= 10 * 1024 * 1024) throw new Error('This image is too large. Choose a smaller photo.');
        const attribution = tenantFields();
        const metadata = doc(collection(db, 'photos'));
        const base = attribution.companyId ? `companies/${attribution.companyId}` : `users/${attribution.userId}`;
        const storagePath = `${base}/jobs/${job.id}/${metadata.id}.jpg`;
        const file = ref(storage, storagePath);
        await uploadBytes(file, blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(file);
        await setDoc(metadata, { ...attribution, jobId: job.id, customerId: job.customerId || null, storagePath, url, caption: '', createdAt: serverTimestamp() });
        await load();
      } finally { blob.close?.(); }
    } catch (e) { setError(e.message); Alert.alert('Photo upload failed', e.message); }
    finally { setBusy(false); }
  };
  if (!job?.id) return null;
  return <View style={{ marginVertical: 16 }}>
    <Text style={{ fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Job photos</Text>
    <View style={{ flexDirection: 'row', gap: 12 }}><Button title={busy ? 'Uploading…' : 'Take photo'} disabled={busy} onPress={() => capture(true)} /><Button title="Choose photo" disabled={busy} onPress={() => capture(false)} /></View>
    <Text style={{ color: '#64748b', marginVertical: 6 }}>Photos upload while online and are visible to your team on web and mobile.</Text>
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text>}
    <ScrollView horizontal>{photos.map((photo) => <Image key={photo.id} accessibilityLabel={photo.caption || 'Job photo'} source={{ uri: photo.url }} style={{ width: 140, height: 140, margin: 5, borderRadius: 8 }} />)}</ScrollView>
  </View>;
}
