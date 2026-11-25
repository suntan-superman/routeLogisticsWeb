import { useEffect, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import { readJobPhoto } from '../services/photoService';

// Both job evidence and property references stay private. The thumbnail and
// viewer use the same authorized read operation; no public Storage URL is made.
export default function AuthorizedPhotoPreview({ photo, kind = 'job', customerId, propertyId, jobId, readable = true }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const available = readable && !['archived', 'rejected'].includes(photo.status);
  const caption = photo.caption || (kind === 'property' ? 'Property reference photo' : 'Job evidence photo');

  useEffect(() => {
    if (!available) return;
    let current = true;
    const load = kind === 'property'
      ? callWorkspace('rlPropertyProfile', { action: 'readPhoto', customerId, propertyId, ...(jobId ? { jobId } : {}), photoId: photo.id })
      : readJobPhoto(photo.id);
    load.then(result => { if (current) setImage(result.dataUri || ''); })
      .catch(failure => { if (current) setError(failure.message || 'Photo unavailable.'); });
    return () => { current = false; };
  }, [available, kind, customerId, propertyId, jobId, photo.id]);

  return <>
    {available ? <button type="button" aria-label={`View ${caption}`} className="block w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-600" onClick={() => image && setOpen(true)} disabled={!image}>
      {image ? <img src={image} alt={caption} className="h-32 w-full object-cover" /> : <span className="flex h-32 items-center justify-center px-3 text-sm text-gray-600">{error || 'Loading private photo…'}</span>}
    </button> : <div className="flex h-32 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">{photo.status === 'archived' ? 'Archived reference' : photo.status === 'rejected' ? 'Rejected proposal' : 'Awaiting management approval'}</div>}
    {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    {open && <div role="dialog" aria-modal="true" aria-label={caption} className="fixed inset-0 z-[90] flex flex-col bg-black/90 p-4 text-white" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }}>
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 pb-3"><p className="truncate text-sm">{caption}</p><button type="button" autoFocus className="rounded border border-white px-3 py-2" onClick={() => setOpen(false)}>Close photo</button></div>
      <img src={image} alt={caption} className="min-h-0 w-full flex-1 object-contain" />
    </div>}
  </>;
}
