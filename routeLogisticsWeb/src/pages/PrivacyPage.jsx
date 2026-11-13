import { Link } from 'react-router-dom';
export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl space-y-5 p-6 py-12">
    <Link to="/" className="text-primary-700">Route Logistics</Link>
    <h1 className="text-3xl font-bold">Privacy notice</h1>
    <p>Updated November 12, 2026.</p>
    <p>Route Logistics stores account details and the service information entered by your provider, including customer contact details, appointments, job notes, service records, photos, and invoices. Your provider manages the records for its business.</p>
    <h2 className="text-xl font-semibold">How information is used</h2>
    <p>Information supports scheduling, job documentation, team access, invoicing, and customer portal access. Job photos are shared with the provider’s authorized team. Customer portal access is limited to records associated with the email address you verify.</p>
    <h2 className="text-xl font-semibold">Service providers and device storage</h2>
    <p>The app uses Google Firebase for authentication, database storage, photo storage, and notifications. Transactional emails are sent through the configured email provider. Error reporting and performance monitoring may be enabled by the app operator. The web app caches service data on the device for offline use; use a trusted device and sign out when you finish.</p>
    <h2 className="text-xl font-semibold">Your choices</h2>
    <p>You can decline push notification and camera permissions. Camera and photo library access is requested when you choose to add a photo. Automatic invoice reminder emails require the provider to enable reminders and record customer email consent.</p>
    <h2 className="text-xl font-semibold">Access, corrections, and retention</h2>
    <p>Contact your service provider using the contact information on your invoice to request access, corrections, or removal of your service records. Your provider determines how long business records are retained, including any records it needs to keep for accounting or service documentation.</p>
  </main>;
}
