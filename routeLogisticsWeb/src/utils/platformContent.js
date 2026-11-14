export const CONTENT_TYPES = {
  faq: { label: 'FAQs', singular: 'FAQ', path: '/faqs', description: 'Answers to questions about Route Logistics and its field service workflows.' },
  testimonial: { label: 'Testimonials', singular: 'Testimonial', path: '/testimonials', description: 'Customer experiences shared with permission.' },
  story: { label: 'Success stories', singular: 'Success story', path: '/success-stories', description: 'Published stories about how teams use Route Logistics.' },
};

export const CONTENT_STATUSES = ['draft', 'published', 'archived'];

export function contentPath(type, slug) {
  const base = CONTENT_TYPES[type]?.path || '/faqs';
  return slug ? `${base}/${encodeURIComponent(slug)}` : base;
}

export function normaliseContent(item = {}, type = 'faq') {
  return {
    ...(item.id ? { id: item.id } : {}),
    type: item.type || type,
    status: item.status || 'draft',
    title: item.title || '',
    slug: item.slug || '',
    summary: item.summary || '',
    body: item.body || '',
    attributionName: item.attributionName || '',
    attributionRole: item.attributionRole || '',
    companyName: item.companyName || '',
    imageId: item.imageId || '',
    imageAlt: item.imageAlt || '',
    seo: {
      title: item.seo?.title || '', description: item.seo?.description || '',
      canonicalUrl: item.seo?.canonicalUrl || '', ogTitle: item.seo?.ogTitle || '',
      ogDescription: item.seo?.ogDescription || '',
    },
    authenticity: { confirmed: item.authenticity?.confirmed === true, reference: item.authenticity?.reference || '' },
    ...(item.isSynthetic ? { isSynthetic: true } : {}),
  };
}

export function contentSnapshot(item) { return JSON.stringify(normaliseContent(item, item?.type)); }

export function contentSlug(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
}

export function readableDate(value) {
  const at = Date.parse(value || '');
  return Number.isFinite(at) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(at)) : '';
}

export function publicContentMeta(type, item) {
  const category = CONTENT_TYPES[type] || CONTENT_TYPES.faq;
  const title = item?.seo?.title || (item ? `${item.title} | Route Logistics` : `${category.label} | Route Logistics`);
  const description = item?.seo?.description || item?.summary || category.description;
  return {
    title, description, canonical: item?.seo?.canonicalUrl || `https://route-logistics.com${contentPath(type, item?.slug)}`,
    ogTitle: item?.seo?.ogTitle || title, ogDescription: item?.seo?.ogDescription || description,
  };
}

export function publicContentStructuredData(type, items = [], item = null) {
  const category = CONTENT_TYPES[type] || CONTENT_TYPES.faq;
  const origin = 'https://route-logistics.com';
  const rows = item ? [item] : items;
  const breadcrumbs = [{ '@type': 'ListItem', position: 1, name: 'Route Logistics', item: origin }, { '@type': 'ListItem', position: 2, name: category.label, item: origin + category.path }];
  if (item) breadcrumbs.push({ '@type': 'ListItem', position: 3, name: item.title, item: origin + contentPath(type, item.slug) });
  const graph = [{ '@type': 'BreadcrumbList', itemListElement: breadcrumbs }];
  if (type === 'faq' && rows.length) graph.push({ '@type': 'FAQPage', mainEntity: rows.map(row => ({ '@type': 'Question', name: row.title, acceptedAnswer: { '@type': 'Answer', text: row.body } })) });
  else if (type === 'story' && item) graph.push({ '@type': 'Article', headline: item.title, description: item.summary || '', ...(item.publishedAt ? { datePublished: item.publishedAt } : {}), ...(item.updatedAt ? { dateModified: item.updatedAt } : {}), ...(item.imageUrl ? { image: item.imageUrl } : {}), mainEntityOfPage: origin + contentPath(type, item.slug), publisher: { '@type': 'Organization', name: 'Route Logistics', url: origin } });
  else graph.push({ '@type': item ? 'WebPage' : 'CollectionPage', name: item?.title || category.label, url: origin + contentPath(type, item?.slug), ...(!item && rows.length ? { mainEntity: { '@type': 'ItemList', itemListElement: rows.map((row, index) => ({ '@type': 'ListItem', position: index + 1, name: row.title, url: origin + contentPath(type, row.slug) })) } } : {}) });
  return { '@context': 'https://schema.org', '@graph': graph };
}
