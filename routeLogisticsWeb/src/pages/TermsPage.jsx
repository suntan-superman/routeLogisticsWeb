import ThemeControl from '../components/ThemeControl';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function TermsPage() {
  return <main className="mx-auto max-w-3xl space-y-5 p-6 py-12">
    <Helmet><title>Terms of use | Route Logistics</title><meta name="description" content="Terms for using Route Logistics web and mobile applications." /><link rel="canonical" href="https://route-logistics.com/terms" /></Helmet>
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/" className="text-primary-700">Route Logistics</Link><ThemeControl /></div>
    <h1 className="text-3xl font-bold">Terms of use</h1>
    <p>Updated November 15, 2026.</p>
    <p>These terms govern your use of the Route Logistics web and mobile applications provided by Workside Software LLC. By using Route Logistics, you agree to these terms and the <Link className="underline" to="/privacy">privacy notice</Link>.</p>
    <h2 className="text-xl font-semibold">Accounts and company access</h2>
    <p>Provide accurate account information, keep your sign-in credentials secure, and use only accounts and company records you are authorized to access. Company owners manage staff invitations, roles, and business settings. Accepting an invitation does not make a staff member the company owner.</p>
    <h2 className="text-xl font-semibold">Responsible use</h2>
    <p>Use Route Logistics lawfully. Do not attempt to access another company’s data, bypass security controls, send unsolicited messages, or upload content you do not have permission to use. Your company is responsible for the accuracy of its service records, customer permissions, scheduling, charges, and compliance obligations.</p>
    <h2 className="text-xl font-semibold">Service records and permissions</h2>
    <p>Route Logistics helps providers schedule and document work. Your provider remains responsible for the services it supplies and any agreement with its customers. Location sharing requires the technician’s permission and an active work shift. Device permissions can be declined or revoked; some features then become unavailable.</p>
    <h2 className="text-xl font-semibold">Connected services</h2>
    <p>Google Maps, payment processing, accounting, email, and messaging features depend on their respective providers and your company’s configuration. Connecting a service authorizes the configured exchange of information. Route estimates and device location reports can be inaccurate and should not replace safe driving or independent verification.</p>
    <h2 className="text-xl font-semibold">Availability and offline work</h2>
    <p>Service availability and delivery times depend on networks and third-party systems. Unsynced work remains on your device until synchronization succeeds. Check synchronization before signing out, deleting your account, removing the app, or clearing device data. Route Logistics does not provide emergency dispatch services.</p>
    <h2 className="text-xl font-semibold">Deleting your account</h2>
    <p>In the mobile app, open Settings → Legal &amp; account → Delete account. Confirm the deletion in the app. A recent verified sign-in is required. If you own a company with active staff, transfer ownership in the web company settings first. Deletion removes your sign-in account and personal Route Logistics profile and revokes your access on web and mobile.</p>
    <p>Company-owned customer, job, invoice, service-photo, and business audit records are retained by the provider; deleting a staff account does not delete the company’s records or other people’s accounts. A sole owner’s historical company records are retained without granting ownership to anyone else. You will be warned before discarding unsynced work on the device. See the <Link className="underline" to="/privacy">privacy notice</Link> for more information.</p>
    <h2 className="text-xl font-semibold">Questions</h2>
    <p>For questions about these terms or your Route Logistics account, contact <a className="underline" href="mailto:notifications@worksidesoftware.com">notifications@worksidesoftware.com</a>. For questions about a service visit, invoice, or your provider’s records, contact the provider listed on your service documentation.</p>
    <nav aria-label="Legal pages"><Link className="underline" to="/privacy">Privacy notice</Link></nav>
  </main>;
}
