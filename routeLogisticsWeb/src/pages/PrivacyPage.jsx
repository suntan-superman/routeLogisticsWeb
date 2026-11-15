import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl space-y-5 p-6 py-12">
    <Helmet><title>Privacy notice | Route Logistics</title><meta name="description" content="How Route Logistics handles account, service and work-location information." /><link rel="canonical" href="https://route-logistics.com/privacy" /></Helmet>
    <Link to="/" className="text-primary-700">Route Logistics</Link>
    <h1 className="text-3xl font-bold">Privacy notice</h1>
    <p>Updated November 15, 2026. Route Logistics is provided by Workside Software LLC.</p>
    <p>Route Logistics stores account details and the service information entered by your provider, including customer contact details, appointments, job notes, service records, photos, and invoices. Your provider manages the records for its business.</p>
    <h2 className="text-xl font-semibold">How information is used</h2>
    <p>Information supports scheduling, job documentation, team access, invoicing, and customer portal access. Job photos are shared with the provider’s authorized team. Customer portal access is limited to records associated with the email address you verify.</p>
    <h2 className="text-xl font-semibold">Service providers and device storage</h2>
    <p>The app uses Google Firebase for authentication, database storage, photo storage, and notifications. Transactional emails are sent through the configured email provider. Error reporting and performance monitoring may be enabled by the app operator. The web app caches service data on the device for offline use; use a trusted device and sign out when you finish.</p>
    <h2 className="text-xl font-semibold">Your choices</h2>
    <p>Work location sharing starts when you choose Start shift and grant location permission. The company owner chooses the reporting interval (1, 3, or 5 minutes). App-open sharing reports while the app is open; optional background sharing requires additional permission and can continue during the shift while the app is in the background. End shift, signing out, or shift expiry stops sharing. Authorized dispatchers can view your reported position, age and accuracy, and job arrival/departure records. The company owner chooses a location visibility period of 1–168 hours (24 hours by default); expired positions are removed by an hourly cleanup. Location availability also depends on connectivity and operating-system limits.</p>
    <p>The mobile app saves viewed jobs, essential customer details, pending edits and photos on this device. Work is separated by account and company, and uploads resume when the app is open and connected. Signing out removes the cached session; pending work is retained for the same account to prevent accidental loss. Removing the app or clearing its data can remove unsynced work.</p>
    <p>Route calculations send selected stop addresses or coordinates to Google Maps when requested. Configured card payments use Stripe, which handles card entry directly. A company owner can connect QuickBooks to exchange selected accounting records. Test payments and sandbox accounting checks do not settle production invoices.</p>
    <p>You can decline push notification and camera permissions. Camera and photo library access is requested when you choose to add a photo. Automatic invoice reminder emails require the provider to enable reminders and record customer email consent.</p>
    <h2 className="text-xl font-semibold">Access, corrections, and retention</h2>
    <p>Contact your service provider using the contact information on your invoice to request access, corrections, or removal of your service records. Your provider determines how long business records are retained, including any records it needs to keep for accounting or service documentation.</p>
    <h2 className="text-xl font-semibold">Account deletion</h2>
    <p>In the mobile app, open Settings → Legal &amp; account → Delete account to initiate and confirm deletion. A recent verified sign-in is required. Owners with other active staff must first transfer company ownership in the web company settings. A sole owner can delete their account without transferring ownership to anyone.</p>
    <p>Deletion removes your sign-in account and personal Route Logistics profile, revokes company access and pending invitations for that account, and removes its registered notification devices and live location information. It signs you out of Route Logistics on web and mobile. Local cached account data and queued work on the device used to delete the account are removed after confirmation; you must explicitly approve discarding any unsynced work.</p>
    <p>Company-owned customer, appointment, job, invoice, service-photo, and business audit records remain with the provider. A minimal account-deletion record is retained to prevent old sessions from regaining access. Customer-portal identities and records for other people are separate and are not deleted when a staff member deletes their account. Copies already stored on another device may remain there until cleared, but cannot be synchronized using the deleted account.</p>
    <p>For Route Logistics privacy or account questions, contact <a className="underline" href="mailto:notifications@worksidesoftware.com">notifications@worksidesoftware.com</a>.</p>
    <nav aria-label="Legal pages"><Link className="underline" to="/terms">Terms of use</Link></nav>
  </main>;
}
