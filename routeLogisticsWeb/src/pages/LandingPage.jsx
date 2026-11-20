import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Bars3Icon, BellAlertIcon, CalendarDaysIcon, CameraIcon, CheckCircleIcon,
  ClipboardDocumentCheckIcon, CloudArrowUpIcon, DevicePhoneMobileIcon,
  DocumentMagnifyingGlassIcon, MapIcon, MapPinIcon, SignalIcon, TruckIcon,
  UserGroupIcon, UsersIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import './LandingPage.css';

const FEATURES = [
  { icon: UsersIcon, title: 'Customer and job management', description: 'Keep service properties, job instructions, visit history, and field evidence connected to the right customer.' },
  { icon: CalendarDaysIcon, title: 'Scheduling and dispatch', description: 'Plan appointments, check staff availability, assign field work, and respond to schedule changes from one workspace.' },
  { icon: DevicePhoneMobileIcon, title: 'iOS and Android field apps', description: 'Give technicians a focused mobile experience for assigned work, schedules, routes, and visit evidence.' },
  { icon: CloudArrowUpIcon, title: 'Offline field capture', description: 'Save notes, photos, arrival and departure evidence on the device, then synchronize safely when connectivity returns.' },
  { icon: MapIcon, title: 'Technician location history', description: 'Review consented, on-duty GPS fixes, observed stops, and recorded tracking gaps without fabricating routes.' },
  { icon: CameraIcon, title: 'Photo evidence and completion', description: 'Attach supporting photos, complete guided visit steps, and preserve an auditable service record.' },
  { icon: ClipboardDocumentCheckIcon, title: 'Managed estimate review', description: 'Let field teams capture scope while authorized management reviews pricing and controls customer delivery.' },
  { icon: BellAlertIcon, title: 'Management attention', description: 'Surface missed visits, quote-needed work, unassigned jobs, and other unresolved operational priorities.' },
];

const INDUSTRIES = [
  { title: 'Pest Control', description: 'Coordinate recurring and one-time visits, field evidence, estimates, and technician activity.' },
  { title: 'Landscaping', description: 'Organize properties, crews, schedules, photos, and follow-up work across a growing service area.' },
  { title: 'Cleaning Services', description: 'Keep assignments, access notes, completion evidence, and changing schedules visible to the team.' },
  { title: 'General Field Services', description: 'Adapt one connected workflow to inspections, maintenance, repairs, and other mobile service teams.' },
];

const WORKFLOW_STEPS = [
  ['01', 'Add your company and complete onboarding', 'Set up the business profile, services, hours, and operating area in a resumable guided flow.'],
  ['02', 'Invite employees and configure services', 'Bring managers and technicians into the correct workspace with role-aware access.'],
  ['03', 'Schedule and dispatch jobs', 'Choose the service property, find available field staff, and keep the day visible as plans change.'],
  ['04', 'Complete visits and manage follow-up', 'Capture field evidence, synchronize completed work, and route estimates or exceptions to management.'],
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', name: 'Route Logistics', url: 'https://route-logistics.com/', logo: 'https://route-logistics.com/route-logistics-mark.svg' },
    {
      '@type': 'SoftwareApplication', name: 'Route Logistics', url: 'https://route-logistics.com/',
      applicationCategory: 'BusinessApplication', operatingSystem: 'Web, iOS, Android',
      description: 'Field service operations software for scheduling, dispatch, mobile visit evidence, location history, estimates, and management follow-up.',
      publisher: { '@type': 'Organization', name: 'Route Logistics', url: 'https://route-logistics.com/' },
    },
  ],
};

function BrandMark() { return <span className="marketing-brand-mark" aria-hidden="true">RL</span>; }
function DemoLabel() { return <span className="marketing-demo-label">Product preview · synthetic demo data</span>; }

function HeroWorkspacePreview() {
  return <figure className="marketing-hero-preview" aria-label="Synthetic Route Logistics management dashboard preview">
    <figcaption className="sr-only">A demonstration management dashboard with attention counts and a dispatch schedule. No production data is shown.</figcaption>
    <div className="marketing-preview-topbar">
      <div className="marketing-preview-brand"><BrandMark /><span><strong>Demo workspace</strong><small>Field operations overview</small></span></div>
      <span className="marketing-live-pill"><SignalIcon /> Live workspace</span>
    </div>
    <div className="marketing-preview-body">
      <aside className="marketing-preview-sidebar" aria-hidden="true"><span className="is-active">Overview</span><span>Dispatch</span><span>Customers</span><span>Estimates</span><span>Team</span></aside>
      <div className="marketing-preview-main">
        <div className="marketing-preview-heading"><span><small>Wednesday operations</small><strong>Management attention</strong></span><DemoLabel /></div>
        <div className="marketing-metric-grid">
          <div><span>Quote needed</span><strong>3</strong><small>Completed estimate visits</small></div>
          <div><span>Awaiting review</span><strong>2</strong><small>Submitted field drafts</small></div>
          <div><span>Schedule action</span><strong>1</strong><small>Missed service window</small></div>
        </div>
        <div className="marketing-dispatch-strip">
          <div className="marketing-strip-header"><strong>Today’s field work</strong><span>5 scheduled · 2 active</span></div>
          <div className="marketing-job-row"><span className="marketing-time">9:00</span><span className="marketing-job-dot is-green" /><span><strong>Sample service visit</strong><small>Technician A · completed</small></span><span className="marketing-status is-complete">Complete</span></div>
          <div className="marketing-job-row"><span className="marketing-time">11:30</span><span className="marketing-job-dot is-amber" /><span><strong>Property inspection</strong><small>Technician B · in progress</small></span><span className="marketing-status is-active">Active</span></div>
          <div className="marketing-job-row"><span className="marketing-time">14:15</span><span className="marketing-job-dot" /><span><strong>Estimate visit</strong><small>Technician A · scheduled</small></span><span className="marketing-status">Scheduled</span></div>
        </div>
      </div>
    </div>
  </figure>;
}

function DispatchPreview() {
  return <figure className="marketing-product-frame marketing-product-frame-wide" aria-labelledby="dispatch-preview-title">
    <div className="marketing-frame-heading"><span><small>WEB WORKSPACE</small><h3 id="dispatch-preview-title">Dispatch Board</h3></span><DemoLabel /></div>
    <div className="marketing-dispatch-demo">
      <div className="marketing-demo-filters"><span>Today</span><span>All technicians</span><span>All statuses</span></div>
      <div className="marketing-demo-map" role="img" aria-label="Synthetic dispatch map with two service jobs and two technicians">
        <span className="marketing-map-road road-one" /><span className="marketing-map-road road-two" />
        <span className="marketing-map-pin pin-job-one"><MapPinIcon /></span><span className="marketing-map-pin pin-job-two"><MapPinIcon /></span>
        <span className="marketing-map-truck truck-one"><TruckIcon /></span><span className="marketing-map-truck truck-two"><TruckIcon /></span>
        <span className="marketing-map-note">2 service visits · 2 on-duty staff</span>
      </div>
    </div>
    <figcaption>See scheduled work, current assignments, and consented on-duty positions together before making a dispatch decision.</figcaption>
  </figure>;
}

function MobileWorkflowPreview() {
  const steps = [
    [CheckCircleIcon, 'Arrival', 'Saved to server', 'is-done'],
    [ClipboardDocumentCheckIcon, 'Work details', 'Saved on device', 'is-current'],
    [CameraIcon, 'Photos and evidence', '2 photos ready', ''],
    [MapPinIcon, 'Departure', 'Not recorded', ''],
    [CheckCircleIcon, 'Review and completion', 'Review when ready', ''],
  ];
  return <figure className="marketing-product-frame marketing-mobile-frame" aria-labelledby="mobile-preview-title">
    <div className="marketing-frame-heading"><span><small>FIELD APP</small><h3 id="mobile-preview-title">Guided visit workflow</h3></span><DemoLabel /></div>
    <div className="marketing-phone-shell">
      <div className="marketing-phone-status"><span>9:41</span><span>● ● ▰</span></div>
      <div className="marketing-phone-content">
        <div className="marketing-phone-title"><span><small>Assigned work order</small><strong>Sample inspection</strong></span><span className="marketing-duty-pill">On duty</span></div>
        <p>Five focused steps keep field work clear and preserve progress on the device.</p>
        <ol className="marketing-mobile-steps">{steps.map(([Icon,title,status,state]) => <li key={title} className={state}>{React.createElement(Icon)}<span><strong>{title}</strong><small>{status}</small></span></li>)}</ol>
      </div>
    </div>
    <figcaption>Technicians move through Arrival, Work details, Evidence, Departure, and Review without scrolling through unrelated forms.</figcaption>
  </figure>;
}

function LocationHistoryPreview() {
  const points = [['30','160'],['112','130'],['190','124'],['238','95'],['315','76'],['390','82'],['430','95'],['510','78'],['610','30']];
  return <figure className="marketing-product-frame" aria-labelledby="history-preview-title">
    <div className="marketing-frame-heading"><span><small>OPERATIONS HISTORY</small><h3 id="history-preview-title">Recorded location history</h3></span><DemoLabel /></div>
    <div className="marketing-history-demo">
      <div className="marketing-history-summary"><span><strong>18</strong><small>recorded fixes</small></span><span><strong>1</strong><small>observed stop</small></span><span><strong>3 min</strong><small>target interval</small></span></div>
      <svg viewBox="0 0 640 200" role="img" aria-label="Synthetic observed GPS fixes connected by a path with one recorded stop">
        <path className="marketing-route-shadow" d="M30 160 C120 120 170 145 238 95 S365 65 430 95 S530 70 610 30" />
        <path className="marketing-route-line" d="M30 160 C120 120 170 145 238 95 S365 65 430 95 S530 70 610 30" />
        {points.map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="6" />)}<circle className="marketing-stop-ring" cx="315" cy="76" r="25" />
      </svg>
      <div className="marketing-stop-card"><MapPinIcon /><span><strong>Observed stop · 24 min</strong><small>Estimated from recorded fixes; no road-matched route is fabricated.</small></span></div>
    </div>
    <figcaption>Managers can review recorded fixes, stop detection, and tracking gaps while the product preserves explicit location-sharing controls.</figcaption>
  </figure>;
}

function EstimatePreview() {
  return <figure className="marketing-product-frame" aria-labelledby="estimate-preview-title">
    <div className="marketing-frame-heading"><span><small>MANAGEMENT REVIEW</small><h3 id="estimate-preview-title">Estimate handoff</h3></span><DemoLabel /></div>
    <div className="marketing-estimate-demo">
      <div className="marketing-estimate-status"><span>Draft estimate</span><strong>Awaiting management review</strong></div>
      <div className="marketing-evidence-grid"><span><CameraIcon /><strong>3 photos</strong><small>Inspection evidence</small></span><span><DocumentMagnifyingGlassIcon /><strong>Scope ready</strong><small>Field notes attached</small></span></div>
      <div className="marketing-estimate-lines"><span><strong>Inspection findings</strong><small>Prepared by field staff</small></span><span><strong>Pricing review</strong><small>Management controlled</small></span><span><strong>Customer delivery</strong><small>Requires authorization</small></span></div>
    </div>
    <figcaption>Technicians submit field scope and evidence; authorized management controls final pricing, versions, PDF review, and customer delivery.</figcaption>
  </figure>;
}

function AttentionPreview() {
  const rows = [
    [ClipboardDocumentCheckIcon, 'Completed estimate visits', '3 visits require a quotation', '3', 'is-emerald'],
    [DocumentMagnifyingGlassIcon, 'Drafts awaiting review', '2 field estimates submitted', '2', 'is-mint'],
    [CalendarDaysIcon, 'Schedule action', '1 missed visit needs attention', '1', 'is-amber'],
    [UserGroupIcon, 'Assignment needed', '1 job is currently unassigned', '1', 'is-slate'],
  ];
  return <figure className="marketing-product-frame marketing-attention-frame" aria-labelledby="attention-preview-title">
    <div className="marketing-frame-heading"><span><small>DAILY PRIORITIES</small><h3 id="attention-preview-title">Management attention</h3></span><DemoLabel /></div>
    <div className="marketing-attention-list">{rows.map(([Icon,title,subtitle,count,state]) => <div key={title}><span className={`marketing-attention-icon ${state}`}>{React.createElement(Icon)}</span><span><strong>{title}</strong><small>{subtitle}</small></span><b>{count}</b></div>)}</div>
    <figcaption>Authoritative, tenant-scoped counts lead owners and managers directly to unresolved work without duplicating alerts.</figcaption>
  </figure>;
}

function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const closeOnEscape = event => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);
  const closeMenu = () => setMenuOpen(false);

  return <div className="marketing-home">
    <Helmet>
      <title>Route Logistics | Connected Field Service Operations</title>
      <meta name="description" content="Schedule and dispatch field work, guide technicians through mobile visits, capture offline evidence, review location history, and manage estimates with Route Logistics." />
      <link rel="canonical" href="https://route-logistics.com/" />
      <meta property="og:type" content="website" /><meta property="og:site_name" content="Route Logistics" />
      <meta property="og:title" content="Route Logistics | Connected Field Service Operations" />
      <meta property="og:description" content="Run scheduling, dispatch, mobile field visits, evidence capture, location history, and management follow-up in one connected platform." />
      <meta property="og:url" content="https://route-logistics.com/" /><meta name="twitter:card" content="summary" />
      <meta name="theme-color" content="#061b16" /><script type="application/ld+json">{JSON.stringify(structuredData).replace(/</g, '\\u003c')}</script>
    </Helmet>
    <a className="marketing-skip-link" href="#main-content">Skip to main content</a>
    <header className="marketing-header">
      <div className="marketing-nav-shell">
        <Link className="marketing-logo" to="/" aria-label="Route Logistics home"><BrandMark /><span>Route Logistics</span></Link>
        <nav className="marketing-desktop-nav" aria-label="Primary navigation"><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#industries">Industries</a></nav>
        <div className="marketing-desktop-actions"><Link className="marketing-login-link" to="/login">Log In</Link><Link className="marketing-nav-cta" to="/signup?intent=company">Add Your Company</Link></div>
        <button className="marketing-menu-button" type="button" aria-expanded={menuOpen} aria-controls="marketing-mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <XMarkIcon /> : <Bars3Icon />}</button>
      </div>
      <nav id="marketing-mobile-menu" className={`marketing-mobile-menu ${menuOpen ? 'is-open' : ''}`} aria-label="Mobile navigation" hidden={!menuOpen}>
        <a href="#features" onClick={closeMenu}>Features</a><a href="#how-it-works" onClick={closeMenu}>How It Works</a><a href="#industries" onClick={closeMenu}>Industries</a>
        <Link to="/login" onClick={closeMenu}>Log In</Link><Link className="marketing-mobile-cta" to="/signup?intent=company" onClick={closeMenu}>Add Your Company</Link>
      </nav>
    </header>

    <main id="main-content">
      <section className="marketing-hero">
        <div className="marketing-hero-glow" aria-hidden="true" />
        <div className="marketing-section-shell marketing-hero-copy">
          <p className="marketing-eyebrow">FIELD OPERATIONS, CONNECTED</p><h1>Run your field operations from one place.</h1>
          <p className="marketing-hero-text">Schedule jobs, dispatch technicians, track field activity, capture service evidence, and manage estimates—all in one connected platform.</p>
          <div className="marketing-hero-actions"><Link className="marketing-primary-cta" to="/signup?intent=company">Add Your Company</Link><a className="marketing-secondary-cta" href="#features">Explore Features</a></div>
          <ul className="marketing-proof-list" aria-label="Platform availability"><li><CheckCircleIcon /> Web management workspace</li><li><CheckCircleIcon /> iOS and Android field apps</li><li><CheckCircleIcon /> Offline-ready visit capture</li></ul>
          <HeroWorkspacePreview />
        </div>
      </section>

      <section id="features" className="marketing-section marketing-feature-section"><div className="marketing-section-shell">
        <div className="marketing-section-intro"><p className="marketing-kicker">ONE OPERATING PICTURE</p><h2>Keep the office and field team working from the same plan.</h2><p>Route Logistics connects the work before, during, and after a service visit without presenting unfinished integrations as generally available.</p></div>
        <div className="marketing-feature-grid">{FEATURES.map(feature => <article key={feature.title} className="marketing-feature-card"><span className="marketing-feature-icon"><feature.icon /></span><h3>{feature.title}</h3><p>{feature.description}</p></article>)}</div>
      </div></section>

      <section className="marketing-section marketing-showcase-section" aria-labelledby="showcase-title"><div className="marketing-section-shell">
        <div className="marketing-section-intro marketing-section-intro-light"><p className="marketing-kicker">REAL PRODUCT WORKFLOWS</p><h2 id="showcase-title">See the work that needs attention, then act on it.</h2><p>Each preview reflects implemented Route Logistics behavior and uses controlled synthetic demonstration data.</p></div>
        <div className="marketing-showcase-grid"><DispatchPreview /><MobileWorkflowPreview /><LocationHistoryPreview /><EstimatePreview /><AttentionPreview /></div>
      </div></section>

      <section id="how-it-works" className="marketing-section marketing-process-section"><div className="marketing-section-shell">
        <div className="marketing-section-intro"><p className="marketing-kicker">HOW IT WORKS</p><h2>From company setup to a completed field visit.</h2><p>A guided starting point helps new teams configure the essentials without changing how established companies operate.</p></div>
        <ol className="marketing-process-grid">{WORKFLOW_STEPS.map(([number,title,description]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        <div className="marketing-centered-action"><Link className="marketing-primary-cta marketing-primary-cta-dark" to="/signup?intent=company">Add Your Company</Link></div>
      </div></section>

      <section className="marketing-section marketing-mobile-section" aria-labelledby="mobile-heading"><div className="marketing-section-shell marketing-mobile-layout">
        <div className="marketing-mobile-copy"><p className="marketing-kicker">MOBILE FIELD EXPERIENCE</p><h2 id="mobile-heading">A focused workflow for work that happens away from the desk.</h2><p>Route Logistics supports iOS and Android field teams with a guided five-stage visit experience designed around evidence, clear status, and dependable synchronization.</p>
          <ul>
            <li><CheckCircleIcon /><span><strong>Guided visit stages</strong>Arrival, work details, photos, departure, and completion stay easy to revisit.</span></li>
            <li><CheckCircleIcon /><span><strong>Offline notes and photos</strong>Local work remains visible while it waits for a safe server acknowledgment.</span></li>
            <li><CheckCircleIcon /><span><strong>Location sharing controls</strong>Technicians explicitly control on-duty sharing while management sees freshness and gaps.</span></li>
            <li><CheckCircleIcon /><span><strong>Clear synchronization states</strong>Saved on device, synchronizing, synchronized, and needs-attention states stay distinct.</span></li>
          </ul>
        </div>
        <div className="marketing-mobile-visual" aria-hidden="true"><div className="marketing-mobile-orbit orbit-one" /><div className="marketing-mobile-orbit orbit-two" /><div className="marketing-mobile-card"><DevicePhoneMobileIcon /><span><strong>iOS + Android</strong><small>One connected field workflow</small></span></div><div className="marketing-mobile-card is-lower"><CloudArrowUpIcon /><span><strong>Offline-ready</strong><small>Evidence waits safely to sync</small></span></div></div>
      </div></section>

      <section id="industries" className="marketing-section marketing-industries-section"><div className="marketing-section-shell">
        <div className="marketing-section-intro"><p className="marketing-kicker">BUILT FOR SERVICE TEAMS</p><h2>Flexible enough for the work your crews already do.</h2><p>Configure services, people, territories, and schedules around the business rather than forcing every provider into one specialty workflow.</p></div>
        <div className="marketing-industries-grid">{INDUSTRIES.map((industry,index) => <article key={industry.title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{industry.title}</h3><p>{industry.description}</p></article>)}</div>
      </div></section>

      <section className="marketing-final-cta"><div className="marketing-section-shell marketing-final-cta-inner"><div><p className="marketing-kicker">READY TO GET ORGANIZED?</p><h2>Bring your field operations into one connected workspace.</h2><p>Create the company account, verify the owner, and continue through the existing seven-step onboarding flow. No payment information is required during setup.</p></div><Link className="marketing-primary-cta" to="/signup?intent=company">Add Your Company</Link></div></section>
    </main>

    <footer className="marketing-footer"><div className="marketing-section-shell marketing-footer-grid">
      <div><Link className="marketing-logo" to="/" aria-label="Route Logistics home"><BrandMark /><span>Route Logistics</span></Link><p>Connected operations for field service teams.</p></div>
      <nav aria-label="Product links"><strong>Product</strong><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#industries">Industries</a></nav>
      <nav aria-label="Account links"><strong>Account</strong><Link to="/login">Log In</Link><Link to="/signup?intent=company">Add Your Company</Link><Link to="/portal">Customer Portal</Link></nav>
      <nav aria-label="Resource links"><strong>Resources</strong><Link to="/faqs">FAQs</Link><Link to="/testimonials">Testimonials</Link><Link to="/success-stories">Success Stories</Link></nav>
      <nav aria-label="Legal links"><strong>Legal</strong><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></nav>
    </div><div className="marketing-section-shell marketing-footer-bottom"><span>© {new Date().getFullYear()} Route Logistics</span><span>Field service operations, connected.</span></div></footer>
  </div>;
}

export default LandingPage;
