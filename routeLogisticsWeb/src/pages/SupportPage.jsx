import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import ThemeControl from '../components/ThemeControl';

export default function SupportPage() {
  return <main className="mx-auto max-w-3xl space-y-5 p-6 py-12">
    <Helmet><title>Support | Route Logistics</title><meta name="description" content="Contact Route Logistics support for app and account help." /><link rel="canonical" href="https://route-logistics.com/support" /></Helmet>
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/" className="text-primary-700">Route Logistics</Link><ThemeControl /></div>
    <h1 className="text-3xl font-bold">Route Logistics support</h1>
    <p>For help with sign-in, company access, the mobile app, or your Route Logistics account, email <a className="underline" href="mailto:notifications@worksidesoftware.com">notifications@worksidesoftware.com</a>.</p>
    <p>When reporting a mobile issue, include your device model, the app version shown under Settings → Legal &amp; account → About Route Logistics, and a description of what happened. Do not send passwords, sign-in codes, or customer records by email.</p>
    <p>For questions about an appointment, service, or invoice, contact the service provider shown on your service documents.</p>
    <nav aria-label="Legal pages" className="flex gap-4"><Link className="underline" to="/privacy">Privacy policy</Link><Link className="underline" to="/terms">Terms of service</Link></nav>
  </main>;
}
