import React, { useState, useRef } from 'react';
import toast from 'react-hot-toast';
import { uploadJobPhoto, listJobPhotos, deleteJobPhoto } from '../services/photoService';
import { canManage } from '../services/tenancy';
import { useConfirm } from './ConfirmProvider';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import AuthorizedPhotoPreview from './AuthorizedPhotoPreview';

const JobPhotos = ({ job }) => {
  const photosQuery = useWorkspaceQuery(['job-photos', job.id], () => listJobPhotos(job.id));
  const photos = photosQuery.data || [];
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const confirm = useConfirm();

  const load = () => photosQuery.refetch();

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
      photosQuery.setData(previous => (previous || []).filter(row => row.id !== photo.id));
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
      {photosQuery.error && <p role="alert" className="text-sm text-red-700">{photosQuery.error.message} <button className="underline" onClick={load}>Retry photo list</button></p>}
      {photos.length === 0 ? (
        <p className="text-sm text-gray-500">No photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo) => (
            <figure key={photo.id} className="relative min-w-0 rounded-lg border border-gray-200 p-2">
              <AuthorizedPhotoPreview photo={photo} />
              <figcaption className="mt-2 truncate text-xs text-gray-700" title={photo.caption || 'Job evidence'}>{photo.caption || 'Job evidence'}</figcaption>
              {canManage() && (
                <button
                  type="button"
                  onClick={() => remove(photo)}
                  className="mt-2 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                  aria-label="Delete photo"
                >
                  Delete photo
                </button>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobPhotos;
