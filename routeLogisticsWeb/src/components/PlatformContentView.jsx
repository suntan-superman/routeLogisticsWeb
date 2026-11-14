import { Link } from 'react-router-dom';
import { CONTENT_TYPES, readableDate } from '../utils/platformContent';

export function PublicContentFrame({ children }) {
  return <div className="min-h-screen bg-white text-gray-900">
    <a href="#public-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-4">Skip to content</a>
    <header className="border-b border-gray-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-8">
        <Link to="/" className="text-xl font-bold text-primary-700">Route Logistics</Link>
        <nav aria-label="Public website" className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
          {Object.values(CONTENT_TYPES).map(item => <Link key={item.path} to={item.path} className="text-gray-700 underline-offset-4 hover:underline">{item.label}</Link>)}
          <Link to="/portal" className="text-primary-700 hover:underline">Customer portal</Link>
          <Link to="/login" className="font-semibold text-primary-700 hover:underline">Sign in</Link>
        </nav>
      </div>
    </header>
    <main id="public-content" className="mx-auto max-w-6xl px-5 py-12 sm:px-8">{children}</main>
    <footer className="border-t border-gray-200 bg-gray-50">
      <nav aria-label="Footer" className="mx-auto flex max-w-6xl flex-wrap gap-5 px-5 py-7 text-sm text-gray-600 sm:px-8">
        <Link to="/">Route Logistics</Link><Link to="/privacy">Privacy notice</Link>
        {Object.values(CONTENT_TYPES).map(item => <Link key={item.path} to={item.path}>{item.label}</Link>)}
      </nav>
    </footer>
  </div>;
}

export function PlatformContentArticle({ item, imageUrl, preview = false }) {
  const image = imageUrl || item.imageUrl;
  return <article className="min-w-0 space-y-6 break-words">
    <header className="space-y-3">
      {preview && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Private preview · {item.status || 'draft'} · This content is not published by previewing it.</p>}
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{item.title || 'Untitled content'}</h1>
      {item.summary && <p className="text-lg leading-relaxed text-gray-600">{item.summary}</p>}
      {item.publishedAt && <p className="text-sm text-gray-500">Published <time dateTime={item.publishedAt}>{readableDate(item.publishedAt)}</time></p>}
    </header>
    {image && <img src={image} alt={item.imageAlt || ''} className="max-h-[32rem] w-full rounded-2xl object-cover" loading="lazy" />}
    {item.type === 'testimonial' ? <figure className="rounded-2xl border border-primary-100 bg-primary-50 p-6 sm:p-8">
      <blockquote className="space-y-4 text-lg leading-relaxed">{String(item.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p className="whitespace-pre-line" key={index}>{paragraph}</p>)}</blockquote>
      {(item.attributionName || item.companyName) && <figcaption className="mt-6 text-sm font-medium text-gray-700">{[item.attributionName, item.attributionRole, item.companyName].filter(Boolean).join(' · ')}</figcaption>}
    </figure> : <div className="space-y-5 text-base leading-8 text-gray-700">{String(item.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p className="whitespace-pre-line" key={index}>{paragraph}</p>)}</div>}
    {item.type === 'story' && item.companyName && <p className="text-sm text-gray-500">Company: {item.companyName}</p>}
  </article>;
}
