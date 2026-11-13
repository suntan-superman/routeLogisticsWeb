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
    <p>Work location sharing starts only when you choose it for a job in progress. It stops when you stop sharing or leave the app. Managers can view the last reported position, its age and accuracy. The company owner chooses a visibility period of 1–168 hours (24 hours by default); expired positions are removed by an hourly cleanup. If the device loses connectivity, the server sharing indicator expires within five minutes.</p>
    <p>The mobile app saves viewed jobs, essential customer details, pending edits and photos on this device. Work is separated by account and company, and uploads resume when the app is open and connected. Signing out removes the cached session; pending work is retained for the same account to prevent accidental loss. Removing the app or clearing its data can remove unsynced work.</p>
    <p>Route calculations send selected stop addresses or coordinates to Google Maps when requested. Configured card payments use Stripe, which handles card entry directly. A company owner can connect QuickBooks to exchange selected accounting records. Test payments and sandbox accounting checks do not settle production invoices.</p>
    <p>You can decline push notification and camera permissions. Camera and photo library access is requested when you choose to add a photo. Automatic invoice reminder emails require the provider to enable reminders and record customer email consent.</p>
    <h2 className="text-xl font-semibold">Access, corrections, and retention</h2>
    <p>Contact your service provider using the contact information on your invoice to request access, corrections, or removal of your service records. Your provider determines how long business records are retained, including any records it needs to keep for accounting or service documentation.</p>
  </main>;
}
