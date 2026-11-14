import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { callWorkspace } from '../services/workspaceApi';
import { CONTENT_TYPES, contentPath, publicContentMeta, publicContentStructuredData, readableDate } from '../utils/platformContent';
import { PlatformContentArticle, PublicContentFrame } from '../components/PlatformContentView';

export default function PublicContentPage({ type = 'faq' }) {
  const { slug } = useParams();
  const [result, setResult] = useState({ key: '', loading: true, items: [], item: null, error: '', missing: false, nextCursor: null, moreError: '' });
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const key = `${type}:${slug || ''}`;
  useEffect(() => {
    let current = true;
    callWorkspace('rlReadPublicContent', { action: slug ? 'get' : 'list', type, ...(slug ? { slug } : {}) }).then(value => {
      if (current) setResult({ key, loading: false, items: value.items || [], item: value.item || null, error: '', missing: !!slug && !value.item, nextCursor: value.nextCursor || null, moreError: '' });
    }).catch(error => {
      if (current) setResult({ key, loading: false, items: [], item: null, error: error.code === 'functions/not-found' ? '' : 'We could not load this page. Please try again.', missing: error.code === 'functions/not-found' });
    });
    return () => { current = false; };
  }, [key, slug, type, retry]);
  const page = result.key === key ? result : { loading: true, items: [], item: null, error: '', missing: false };
  const category = CONTENT_TYPES[type] || CONTENT_TYPES.faq;
  const meta = publicContentMeta(type, page.item);
  const loadMore = async () => {
    if (!page.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const value = await callWorkspace('rlReadPublicContent', { action: 'list', type, cursor: page.nextCursor });
      setResult(previous => previous.key !== key ? previous : { ...previous, items: [...previous.items, ...(value.items || []).filter(item => !previous.items.some(old => old.id === item.id))], nextCursor: value.nextCursor || null, moreError: '' });
    } catch { setResult(previous => previous.key !== key ? previous : { ...previous, moreError: 'More content could not be loaded. Please try again.' }); }
    finally { setLoadingMore(false); }
  };
  return <PublicContentFrame>
    <Helmet>
      <title>{page.missing ? 'Page not found | Route Logistics' : meta.title}</title>
      <meta name="description" content={meta.description} /><link rel="canonical" href={meta.canonical} />
      <meta name="robots" content={page.missing || page.error ? 'noindex,follow' : 'index,follow'} />
      <meta property="og:title" content={meta.ogTitle} /><meta property="og:description" content={meta.ogDescription} />
      <meta property="og:url" content={meta.canonical} /><meta property="og:type" content={page.item ? 'article' : 'website'} />
      {page.item?.imageUrl && <meta property="og:image" content={page.item.imageUrl} />}
      {!page.loading && !page.error && !page.missing && <script type="application/ld+json">{JSON.stringify(publicContentStructuredData(type, page.items, page.item)).replace(/</g, '\\u003c')}</script>}
    </Helmet>
    {page.loading ? <p role="status" className="py-12 text-gray-600">Loading {category.label.toLowerCase()}…</p> : page.error ? <section className="space-y-4 rounded-2xl border border-red-100 bg-red-50 p-6"><h1 className="text-2xl font-bold">Content is temporarily unavailable</h1><p role="alert">{page.error}</p><button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></section> : page.missing ? <section className="space-y-5"><h1 className="text-3xl font-bold">This page is not available</h1><p>It may have moved or may no longer be published.</p><Link to={category.path} className="text-primary-700 underline">Browse {category.label.toLowerCase()}</Link></section> : slug && page.item ? <div className="mx-auto max-w-3xl space-y-8"><Link to={category.path} className="text-sm font-semibold text-primary-700">← All {category.label.toLowerCase()}</Link><PlatformContentArticle item={page.item} /></div> : <section className="space-y-9">
      <header className="max-w-3xl space-y-4"><p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Route Logistics</p><h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{category.label}</h1><p className="text-lg leading-relaxed text-gray-600">{category.description}</p></header>
      {!page.items.length ? <p className="rounded-2xl border border-gray-200 bg-gray-50 p-6 text-gray-700">{type === 'faq' ? 'No FAQs have been published yet. Please check back soon.' : type === 'testimonial' ? 'No customer testimonials have been published yet. We publish experiences shared with permission.' : 'No success stories have been published yet. We will share approved customer stories here.'}</p> : type === 'faq' ? <div className="max-w-4xl divide-y divide-gray-200 rounded-2xl border border-gray-200 px-5">{page.items.map(item => <details className="group py-5" key={item.id}><summary className="cursor-pointer text-lg font-semibold leading-relaxed text-gray-900">{item.title}</summary><div className="space-y-4 pb-2 pt-4 text-gray-700">{String(item.body || '').split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p className="whitespace-pre-line leading-relaxed" key={index}>{paragraph}</p>)}<Link to={contentPath(type, item.slug)} className="inline-block text-sm font-medium text-primary-700 underline">View this answer</Link></div></details>)}</div> : <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{page.items.map(item => <article key={item.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {item.imageUrl && <img src={item.imageUrl} alt={item.imageAlt || ''} className="aspect-[16/10] w-full object-cover" loading="lazy" />}
        <div className="flex flex-1 flex-col gap-4 p-6"><h2 className="break-words text-xl font-semibold"><Link to={contentPath(type, item.slug)} className="text-gray-900 hover:text-primary-700">{item.title}</Link></h2><p className="break-words leading-relaxed text-gray-600">{item.summary || (type === 'testimonial' ? String(item.body || '').slice(0, 240) : '')}</p>{type === 'testimonial' && <p className="text-sm text-gray-500">{[item.attributionName, item.companyName].filter(Boolean).join(' · ')}</p>}{item.publishedAt && <time className="text-sm text-gray-500" dateTime={item.publishedAt}>{readableDate(item.publishedAt)}</time>}<Link to={contentPath(type, item.slug)} className="mt-auto text-sm font-semibold text-primary-700">{type === 'story' ? 'Read the story' : 'Read the experience'} →</Link></div>
      </article>)}</div>}
      {page.moreError && <p role="alert" className="text-red-700">{page.moreError}</p>}{page.nextCursor && <button type="button" className="btn-secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading more…' : `Load more ${category.label.toLowerCase()}`}</button>}
      <aside className="rounded-2xl bg-primary-50 p-6 text-primary-900"><h2 className="text-lg font-semibold">Explore Route Logistics</h2><p className="mt-2">Learn about field service scheduling, customer history and service workflows.</p><div className="mt-4 flex flex-wrap gap-4"><Link to="/" className="font-semibold underline">See the platform</Link>{Object.entries(CONTENT_TYPES).filter(([name]) => name !== type).map(([name, item]) => <Link key={name} to={item.path} className="font-semibold underline">{item.label}</Link>)}</div></aside>
    </section>}
  </PublicContentFrame>;
}
