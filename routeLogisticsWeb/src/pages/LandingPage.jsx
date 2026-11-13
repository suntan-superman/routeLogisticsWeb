import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  CalendarDaysIcon,
  CameraIcon,
  DocumentTextIcon,
  BellAlertIcon,
  MapPinIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';

// Headline/subcopy variants per ad source so Meta/Reddit/Google traffic each see
// messaging tuned to that channel. Selected via ?src=meta|reddit|google.
const VARIANTS = {
  meta: {
    eyebrow: 'For pest control & field service teams',
    headline: 'Stop running your pest control business out of a notebook.',
    sub: 'Route Logistics puts scheduling, customers, invoices and your crew in one simple dashboard — built for teams who are done juggling spreadsheets.',
  },
  reddit: {
    eyebrow: 'Built for pest control workflows',
    headline: 'Field service software that doesn\u2019t make you hate Mondays.',
    sub: 'No bloated enterprise suite. Just scheduling, jobs, invoices and customer history that actually works for a small pest control crew.',
  },
  google: {
    eyebrow: 'Field service management software',
    headline: 'Scheduling, invoicing and customer management for pest control companies.',
    sub: 'Route Logistics is field service software built around real pest control workflows: recurring service plans, job photos, and invoices your customers can view.',
  },
  default: {
    eyebrow: 'Field service management, simplified',
    headline: 'Run your pest control business from one dashboard.',
    sub: 'Scheduling, customers, estimates, invoices, service plans and your crew\u2014all in one place built for field service teams.',
  },
};

const FEATURES = [
  { icon: CalendarDaysIcon, title: 'Scheduling & calendar', desc: 'Drag-and-drop job scheduling with a calendar your whole crew can see.' },
  { icon: DocumentTextIcon, title: 'Estimates & invoices', desc: 'Send professional estimates, convert to invoices, and track what\u2019s paid.' },
  { icon: CameraIcon, title: 'Job photos', desc: 'Technicians attach before/after photos right from the job.' },
  { icon: BellAlertIcon, title: 'Push notifications', desc: 'Your team is notified the moment a job is assigned.' },
  { icon: MapPinIcon, title: 'Customer history', desc: 'Every customer, every past job and every invoice, searchable in seconds.' },
  { icon: CheckCircleIcon, title: 'Recurring service plans', desc: 'Set a cadence once; jobs get generated automatically.' },
];

const LandingPage = () => {
  const [variantKey, setVariantKey] = useState('default');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const src = (params.get('src') || params.get('utm_source') || '').toLowerCase();
    if (VARIANTS[src]) {
      setVariantKey(src);
      sessionStorage.setItem('rl_utm_source', src);
    } else {
      const stored = sessionStorage.getItem('rl_utm_source');
      if (stored && VARIANTS[stored]) setVariantKey(stored);
    }
  }, []);

  const v = VARIANTS[variantKey];

  return (
    <div className="min-h-screen bg-white">
      <Helmet>
        <title>Route Logistics | Field Service Management for Pest Control & Home Services</title>
        <meta
          name="description"
          content="Route Logistics is field service management software for pest control and home service companies: scheduling, customers, estimates, invoices and service plans in one dashboard."
        />
      </Helmet>

      {/* Top nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">RL</span>
            </div>
            <span className="font-bold text-gray-900 text-lg">Route Logistics</span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/portal" className="text-sm text-primary-700">Customer portal</Link>
            <Link to="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2">
              Log in
            </Link>
            <Link
              to="/signup"
              className="text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-md px-4 py-2 transition-colors"
            >
              Sign up free
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-20 text-center">
        <p className="text-primary-600 font-semibold text-sm uppercase tracking-wide">{v.eyebrow}</p>
        <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight max-w-3xl mx-auto">
          {v.headline}
        </h1>
        <p className="mt-6 text-lg text-gray-600 max-w-2xl mx-auto">{v.sub}</p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            to="/signup"
            className="text-base font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-md px-6 py-3 transition-colors"
          >
            Get started free
          </Link>
          <Link to="/login" className="text-base font-semibold text-gray-700 hover:text-gray-900 px-6 py-3">
            Log in &rarr;
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center">Everything your crew needs, in one place</h2>
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-4">
                <f.icon className="h-7 w-7 text-primary-600 shrink-0" />
                <div>
                  <h3 className="font-semibold text-gray-900">{f.title}</h3>
                  <p className="mt-1 text-sm text-gray-600">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900">Built for pest control. Works for any field service business.</h2>
        <p className="mt-3 text-gray-600">Create your company account in minutes &mdash; no credit card required.</p>
        <Link
          to="/signup"
          className="mt-6 inline-block text-base font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-md px-6 py-3 transition-colors"
        >
          Create your account
        </Link>
      </section>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-6 text-sm text-gray-500 flex items-center justify-between">
          <span>&copy; {new Date().getFullYear()} Route Logistics</span>
          <span>route-logistics.com</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
