import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../services/firebase';
import { previewCustomers } from '../utils/customerCsv';

export default function CustomerImport({ onComplete }) {
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const readFile = async (event) => {
    setPreview(null); setMessage(''); setProgress(0);
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 5_000_000) throw new Error('Choose a CSV file under 5 MB.');
      setPreview(previewCustomers(await file.text()));
    } catch (error) { setMessage(error.message); }
  };
  const importRows = async () => {
    setBusy(true); setMessage('');
    let created = 0, skipped = 0;
    try {
      for (let i = 0; i < preview.customers.length; i += 100) {
        const { data } = await httpsCallable(functions, 'bulkImportCustomers')({ customers: preview.customers.slice(i, i + 100) });
        created += data.created; skipped += data.skipped; setProgress(Math.min(i + 100, preview.customers.length));
      }
      setMessage(`Imported ${created} customers; skipped ${skipped} already present. ${preview.duplicates} duplicates removed from the file.`);
      setPreview(null);
      await onComplete();
    } catch (error) { setMessage(`Import interrupted: ${error.message} Completed rows are saved. Retrying safely skips existing records.`); }
    finally { setBusy(false); }
  };
  return <details className="rounded-lg border bg-white p-4">
    <summary className="cursor-pointer font-medium">Import customers from CSV</summary>
    <p className="my-3 text-sm text-gray-600">Headers: Name (required), Email, Phone, Address, City, State, ZIP, Notes. Up to 5,000 rows. Existing records are kept.</p>
    <input aria-label="Customer CSV file" type="file" accept=".csv,text/csv" disabled={busy} onChange={readFile} />
    {preview && <div className="mt-4">
      <p>{preview.customers.length} customers ready, {preview.duplicates} duplicates in file.</p>
      {preview.errors.length > 0 ? <ul role="alert" className="text-red-700">{preview.errors.slice(0, 20).map((error) => <li key={error}>{error}</li>)}</ul> : <>
        <div className="my-3 overflow-auto"><table className="text-sm"><thead><tr><th className="pr-6 text-left">Name</th><th className="text-left">Email</th></tr></thead><tbody>{preview.customers.slice(0, 5).map((c, i) => <tr key={i}><td className="pr-6">{c.name}</td><td>{c.email}</td></tr>)}</tbody></table></div>
        <button disabled={busy || !preview.customers.length} className="rounded bg-primary-600 px-4 py-2 text-white disabled:opacity-50" onClick={importRows}>{busy ? `Importing… ${progress}/${preview.customers.length}` : 'Import customers'}</button>
      </>}
    </div>}
    {message && <p role="status" className="mt-3">{message}</p>}
  </details>;
}
