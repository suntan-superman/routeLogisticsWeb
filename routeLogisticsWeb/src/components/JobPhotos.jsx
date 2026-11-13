import React, { useEffect, useState, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { uploadJobPhoto, listJobPhotos, deleteJobPhoto, readJobPhoto } from '../services/photoService';
import { canManage } from '../services/tenancy';
import { useConfirm } from './ConfirmProvider';

const JobPhotos = ({ job }) => {
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    try {
      setPhotos(await listJobPhotos(job.id));
    } catch (error) {
      console.error(error);
      toast.error('Could not load photos');
    }
  }, [job.id]);

  useEffect(() => {
    load();
  }, [load]);

  const onFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    let failed = 0;
    for (const file of files) {
      try {
        await uploadJobPhoto(job, file);
      } catch (error) {
        failed += 1;
        console.error(error);
        toast.error(`${file.name}: ${error.message}`);
      }
    }
    setBusy(false);
    if (files.length > failed) toast.success(`${files.length - failed} photo(s) uploaded`);
    load();
  };

  const remove = async (photo) => {
    const ok = await confirm({ title: 'Delete photo?', message: "This photo will be permanently removed from the job.", confirmText: 'Delete photo' });
    if (!ok) return;
    try {
      await deleteJobPhoto(photo);
      setPhotos((p) => p.filter((x) => x.id !== photo.id));
    } catch (error) {
      toast.error(error.message || 'Could not delete photo');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-medium text-gray-700">Photos ({photos.length})</h5>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="px-3 py-1 text-sm bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
        >
          {busy ? 'Uploading…' : 'Add photos'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple capture="environment" className="hidden" onChange={onFiles} />
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group">
              <PrivatePhoto photo={photo} />
              {canManage() && (
                <button
                  type="button"
                  onClick={() => remove(photo)}
                  className="absolute top-1 right-1 hidden group-hover:block bg-red-600 text-white text-xs px-1.5 rounded"
                  aria-label="Delete photo"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobPhotos;

function PrivatePhoto({ photo }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  return <div>{url ? <img src={url} alt={photo.caption || 'Job photo'} className="max-h-96 w-full object-contain rounded" /> : <button className="w-full rounded border p-5 text-sm underline" onClick={async () => { try { setUrl((await readJobPhoto(photo.id)).dataUri); } catch (e) { setError(e.message); } }}>View photo</button>}{error && <p role="alert">{error}</p>}</div>;
}
