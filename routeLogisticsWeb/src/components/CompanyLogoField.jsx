import React, { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';

const MAX_BYTES = 1024 * 1024;
const allowed = ['image/png', 'image/jpeg', 'image/webp'];
const call = httpsCallable(functions, 'rlCompanyLogo');
const base64For = buffer => {
  const bytes = new Uint8Array(buffer); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};

async function logoPayload(file) {
  if (!allowed.includes(file.type) || file.size > MAX_BYTES || file.size === 0) throw new Error('Choose a PNG, JPEG or WebP image under 1 MB.');
  if (file.type !== 'image/webp') return { contentType: file.type, base64: base64For(await file.arrayBuffer()) };
    const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > MAX_BYTES) throw new Error('This WebP image is too large after conversion. Choose a smaller logo.');
    return { contentType: 'image/png', base64: base64For(await blob.arrayBuffer()) };
  } finally { bitmap.close(); }
}

export default function CompanyLogoField({ companyId, currentLogo = '', onSaved }) {
  const [preview, setPreview] = useState(/^https:\/\//i.test(currentLogo) || /^data:image\/(png|jpeg);base64,/i.test(currentLogo) ? currentLogo : '');
  const [url, setUrl] = useState(/^https:\/\//i.test(currentLogo) ? currentLogo : '');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => {
    if (!companyId) return;
    let active = true;
    call({ action: 'read' }).then(({ data }) => { if (active) { setPreview(data.preview || ''); setUrl(/^https:\/\//i.test(data.logo || '') ? data.logo : ''); } }).catch(error => { if (active) setMessage(error.message || 'Unable to load logo.'); });
    return () => { active = false; };
  }, [companyId, currentLogo]);
  const perform = async (action, extra = {}) => {
    setBusy(true); setMessage(action === 'upload' ? 'Uploading logo…' : 'Saving logo…');
    try {
      const { data } = await call({ action, ...extra });
      setPreview(data.preview || ''); setUrl(/^https:\/\//i.test(data.logo || '') ? data.logo : '');
      setMessage(action === 'remove' ? 'Logo removed.' : 'Logo saved. New documents will use this branding.');
      onSaved?.(data.logo || '');
    } catch (error) { setMessage(error.message || 'Logo could not be saved.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3" aria-label="Company logo setting">
    <div className="flex flex-wrap items-center gap-4">
      {preview ? <img src={preview} alt="Current company logo" className="h-16 w-16 rounded-lg border object-contain" /> : <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500">No logo</div>}
      <label className="btn-secondary cursor-pointer">Upload Logo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy || !companyId} onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { await perform('upload', await logoPayload(file)); } catch (error) { setMessage(error.message); } }} /></label>
      {preview && <button type="button" className="text-sm text-red-700 underline disabled:opacity-50" disabled={busy} onClick={() => perform('remove')}>Remove logo</button>}
    </div>
    <div className="flex flex-wrap items-end gap-3"><label className="min-w-[16rem] flex-1 text-sm">Or use an HTTPS logo URL<input type="url" className="input-field mt-1 block w-full" value={url} disabled={busy || !companyId} onChange={event => setUrl(event.target.value)} placeholder="https://example.com/logo.png" /></label><button type="button" className="btn-secondary" disabled={busy || !companyId || !url.trim()} onClick={() => perform('url', { url })}>Save URL</button></div>
    <p className="text-xs text-gray-500">PNG, JPEG and WebP, up to 1 MB. Uploaded logos are private. Existing logo URLs remain supported.</p>
    {message && <p role="status" className="text-sm">{message}</p>}
  </div>;
}
