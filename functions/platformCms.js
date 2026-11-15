const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { getStorage } = require('firebase-admin/storage');
const { requireAuth, requireAccountActive, documentId, rateLimit, hash } = require('./security');

const TYPES = ['faq', 'testimonial', 'story'];
const STATUSES = ['draft', 'published', 'archived'];
const ORIGIN = 'https://route-logistics.com';
const ROUTES = { faq: 'faqs', testimonial: 'testimonials', story: 'success-stories' };
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const IMAGE_LIMIT = 2 * 1024 * 1024;
const millis = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const iso = value => Number.isFinite(millis(value)) ? new Date(millis(value)).toISOString() : null;
const invalid = message => { throw new HttpsError('invalid-argument', message); };
const contentPath = item => `/${ROUTES[item.type]}/${item.slug}`;
const imageUrl = id => `${'https://us-central1-mi-factotum-field-service.cloudfunctions.net'}/rlPublicContentImage?id=${encodeURIComponent(id)}`;

function plain(value, maximum, label, required = false) {
  const text = typeof value === 'string' ? value.trim() : '';
  if ((required && !text) || text.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) invalid(`Enter a valid ${label} (${maximum} characters maximum).`);
  return text;
}
function identifier(value, label = 'content ID') {
  documentId(value, label);
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) invalid(`Invalid ${label}.`);
  return value;
}
function cleanContent(input) {
  if (!input || !TYPES.includes(input.type) || !STATUSES.includes(input.status)) invalid('Choose a supported content type and publication status.');
  const slug = plain(input.slug, 100, 'URL slug', true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2) invalid('Use at least two lowercase letters or numbers, separated by single hyphens, for the slug.');
  const result = {
    type: input.type, status: input.status, slug,
    title: plain(input.title, 160, 'title', true),
    summary: plain(input.summary, 600, 'summary'),
    body: plain(input.body, 30000, 'body', input.status === 'published'),
    attributionName: plain(input.attributionName, 120, 'customer attribution'),
    attributionRole: plain(input.attributionRole, 120, 'attribution role'),
    companyName: plain(input.companyName, 160, 'company name'),
    imageId: input.imageId ? identifier(input.imageId, 'image ID') : null,
    imageAlt: plain(input.imageAlt, 240, 'image alternative text'),
    authenticity: {
      confirmed: input.authenticity?.confirmed === true,
      reference: plain(input.authenticity?.reference, 500, 'source and publication-permission reference'),
    },
  };
  if (result.imageId && !result.imageAlt) invalid('Describe the image for visitors using assistive technology.');
  const defaultDescription = (result.summary || result.body).replace(/\s+/g, ' ').slice(0, 160);
  const canonical = input.seo?.canonicalUrl || ORIGIN + contentPath(result);
  let parsed;
  try { parsed = new URL(canonical, ORIGIN); } catch { invalid('Enter a valid Route Logistics canonical URL.'); }
  if (parsed.origin !== ORIGIN || parsed.username || parsed.password || parsed.search || parsed.hash || !/^\/(?:faqs|testimonials|success-stories)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?\/?$/.test(parsed.pathname)) invalid('Canonical URLs must use an existing Route Logistics public content path.');
  result.seo = {
    title: plain(input.seo?.title || result.title.slice(0, 70), 70, 'SEO title', true),
    description: plain(input.seo?.description || defaultDescription, 180, 'meta description', input.status === 'published'),
    canonicalUrl: parsed.href,
    ogTitle: plain(input.seo?.ogTitle || result.title.slice(0, 100), 100, 'Open Graph title'),
    ogDescription: plain(input.seo?.ogDescription || defaultDescription, 220, 'Open Graph description'),
  };
  return result;
}
function assertPublishable(item) {
  if (item.status !== 'published') return;
  if (item.isSynthetic === true) throw new HttpsError('failed-precondition', 'Synthetic acceptance content cannot be published.');
  if (item.type !== 'faq' && (!item.authenticity.confirmed || !item.authenticity.reference || !item.companyName || !item.attributionName && item.type === 'testimonial')) throw new HttpsError('failed-precondition', 'Confirm the genuine customer source and permission to publish, with an evidence reference and customer/company attribution.');
}
function publicProjection(item) {
  const data = {
    id: item.id, type: item.type, status: 'published', slug: item.slug,
    title: item.title, summary: item.summary, body: item.body,
    attributionName: item.attributionName, attributionRole: item.attributionRole, companyName: item.companyName,
    imageId: item.imageId, imageAlt: item.imageAlt, imageUrl: item.imageId ? imageUrl(item.imageId) : null,
    seo: item.seo, path: contentPath(item), publishedAt: item.publishedAt,
    updatedAt: item.updatedAt, revision: item.revision,
  };
  return data;
}
function serialize(item) {
  if (!item) return item;
  return { ...item, createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt), publishedAt: iso(item.publishedAt), lastPublishedAt: iso(item.lastPublishedAt) };
}

function platformCmsHandlers(db, config = {}) {
  const now = config.now || (() => Date.now());
  const bucket = () => typeof config.bucket === 'function' ? config.bucket() : config.bucket || getStorage().bucket();
  const contentRef = id => db.doc(`rlPlatformContent/${identifier(id)}`);
  async function adminIdentity(request) {
    const auth = requireAuth(request, true);
    await requireAccountActive(db, auth.uid);
    const record = await db.doc(`rlPlatformAdmins/${identifier(auth.uid, 'administrator UID')}`).get();
    if (record.get('status') !== 'active' || record.get('role') !== 'admin') throw new HttpsError('permission-denied', 'Explicit Route Logistics platform administrator access is required.');
    return auth;
  }
  async function list(collection, data, admin = false) {
    if (data.type && !TYPES.includes(data.type) || data.status && !STATUSES.includes(data.status)) invalid('Choose a supported content filter.');
    const limit = data.limit === undefined ? 50 : data.limit;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) invalid('Choose a page size between 1 and 100.');
    let query = db.collection(collection);
    if (data.type) query = query.where('type', '==', data.type);
    if (admin && data.status) query = query.where('status', '==', data.status);
    query = query.orderBy(admin ? 'updatedAt' : 'publishedAt', 'desc');
    if (data.cursor) {
      const cursor = await db.doc(`${collection}/${identifier(data.cursor, 'pagination cursor')}`).get();
      if (!cursor.exists || data.type && cursor.get('type') !== data.type || admin && data.status && cursor.get('status') !== data.status) invalid('The content page changed. Refresh the list.');
      query = query.startAfter(cursor);
    }
    const rows = await query.limit(limit + 1).get();
    const selected = rows.docs.slice(0, limit);
    return {
      items: selected.filter(row => admin || row.get('status') === 'published').map(row => serialize({ id: row.id, ...row.data() })),
      nextCursor: rows.size > limit ? selected.at(-1).id : null,
    };
  }
  async function save(request, auth) {
    const data = request.data || {}, clean = cleanContent(data.content);
    const id = data.content.id ? identifier(data.content.id) : randomUUID();
    if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) invalid('The current content revision is required. Refresh and try again.');
    return db.runTransaction(async tx => {
      const target = contentRef(id), previous = await tx.get(target);
      if (data.expectedRevision !== (previous.get('revision') || 0)) throw new HttpsError('aborted', 'This content changed in another session. Refresh before saving.');
      if (previous.exists && previous.get('type') !== clean.type) invalid('The content type cannot be changed after creation.');
      // Keep an automatically generated canonical URL aligned with a renamed
      // slug, while preserving an administrator's deliberate custom canonical.
      if (previous.exists && previous.get('slug') !== clean.slug
        && previous.get('seo.canonicalUrl') === ORIGIN + contentPath(previous.data())
        && clean.seo.canonicalUrl === previous.get('seo.canonicalUrl')) clean.seo.canonicalUrl = ORIGIN + contentPath(clean);
      const slugRef = db.doc(`rlContentSlugs/${hash(`${clean.type}:${clean.slug}`)}`);
      const slug = await tx.get(slugRef);
      if (slug.exists && slug.get('contentId') !== id) throw new HttpsError('already-exists', 'This URL slug is already used by another content record.');
      const oldSlugRef = previous.exists && previous.get('slug') !== clean.slug ? db.doc(`rlContentSlugs/${hash(`${clean.type}:${previous.get('slug')}`)}`) : null;
      const oldSlug = oldSlugRef ? await tx.get(oldSlugRef) : null;
      const image = clean.imageId ? await tx.get(db.doc(`rlPlatformContentImages/${clean.imageId}`)) : null;
      if (clean.imageId && (!image.exists || image.get('contentId') !== id || image.get('status') !== 'ready')) throw new HttpsError('failed-precondition', 'Choose an uploaded image belonging to this content record.');
      const date = new Date(now());
      const item = {
        id, ...clean, isSynthetic: previous.get('isSynthetic') === true || data.content.isSynthetic === true,
        revision: (previous.get('revision') || 0) + 1,
        createdAt: previous.get('createdAt') || date, createdBy: previous.get('createdBy') || auth.uid,
        updatedAt: date, updatedBy: auth.uid,
        publishedAt: previous.get('publishedAt') || (clean.status === 'published' ? date : null),
        lastPublishedAt: clean.status === 'published' ? date : previous.get('lastPublishedAt') || null,
      };
      assertPublishable(item);
      tx.set(target, item);
      tx.set(slugRef, { contentId: id, type: item.type, slug: item.slug });
      if (oldSlug?.exists && oldSlug.get('contentId') === id) tx.delete(oldSlugRef);
      const publicRef = db.doc(`rlPublicContent/${id}`);
      if (item.status === 'published') tx.set(publicRef, publicProjection(item)); else tx.delete(publicRef);
      tx.create(db.doc(`rlContentAudit/${randomUUID()}`), {
        contentId: id, revision: item.revision, type: item.type,
        action: !previous.exists ? 'created' : previous.get('status') !== item.status ? `status-${item.status}` : 'updated',
        previousStatus: previous.get('status') || null, status: item.status,
        actorId: auth.uid, createdAt: date,
        // Full private revisions support review without exposing source evidence publicly.
        snapshot: item,
      });
      return { item: serialize(item) };
    });
  }
  return {
    requireAdmin: adminIdentity,
    admin: async request => {
      const auth = await adminIdentity(request), data = request.data || {};
      await rateLimit(db, 'platform-cms', auth.uid, 120, 60000, now());
      if (data.action === 'status') return { authorized: true, role: 'admin' };
      if (data.action === 'list') return list('rlPlatformContent', data, true);
      if (data.action === 'get') {
        const row = await contentRef(data.id).get();
        if (!row.exists) throw new HttpsError('not-found', 'Content not found.');
        return { item: serialize({ id: row.id, ...row.data() }) };
      }
      if (data.action === 'save') return save(request, auth);
      if (data.action === 'history') {
        const id = identifier(data.id);
        const rows = await db.collection('rlContentAudit').where('contentId', '==', id).orderBy('revision', 'desc').limit(50).get();
        return { items: rows.docs.map(row => { const item = row.data(); return { id: row.id, ...item, createdAt: iso(item.createdAt), snapshot: serialize(item.snapshot) }; }) };
      }
      if (data.action === 'dashboard') {
        const counts = {};
        for (const type of TYPES) {
          counts[type] = {};
          const results = await Promise.all(STATUSES.map(status => db.collection('rlPlatformContent').where('type', '==', type).where('status', '==', status).count().get()));
          STATUSES.forEach((status, index) => { counts[type][status] = results[index].data().count; });
        }
        const recent = await db.collection('rlContentAudit').orderBy('createdAt', 'desc').limit(10).get();
        return { counts, recentAudit: recent.docs.map(row => ({ id: row.id, contentId: row.get('contentId'), type: row.get('type'), action: row.get('action'), actorId: row.get('actorId'), revision: row.get('revision'), createdAt: iso(row.get('createdAt')) })) };
      }
      invalid('Choose a supported platform content action.');
    },
    publicRead: async request => {
      const data = request.data || {};
      if (data.action === 'list') return list('rlPublicContent', data);
      if (data.action !== 'get' || !TYPES.includes(data.type) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.slug || '')) invalid('Choose a public content page.');
      const rows = await db.collection('rlPublicContent').where('type', '==', data.type).where('slug', '==', data.slug).limit(1).get();
      if (rows.empty || rows.docs[0].get('status') !== 'published') throw new HttpsError('not-found', 'This page is unavailable.');
      return { item: serialize(rows.docs[0].data()) };
    },
    image: async request => {
      const auth = await adminIdentity(request), data = request.data || {};
      await rateLimit(db, 'platform-cms-images', auth.uid, 30, 60000, now());
      if (data.action === 'get') {
        const image = await db.doc(`rlPlatformContentImages/${identifier(data.imageId, 'image ID')}`).get();
        if (!image.exists || image.get('status') !== 'ready') throw new HttpsError('not-found', 'Image unavailable.');
        const [buffer] = await bucket().file(image.get('storagePath')).download();
        return { image: { id: image.id, data: buffer.toString('base64'), contentType: image.get('contentType'), alt: image.get('alt') } };
      }
      if (data.action !== 'upload') invalid('Choose an image action.');
      const id = identifier(data.contentId), content = await contentRef(id).get();
      if (!content.exists) throw new HttpsError('not-found', 'Save a content draft before uploading its image.');
      const extension = IMAGE_TYPES[data.contentType];
      if (!extension || typeof data.data !== 'string' || data.data.length > Math.ceil(IMAGE_LIMIT / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.data)) invalid('Upload a JPEG, PNG or WebP image of at most 2 MB.');
      const buffer = Buffer.from(data.data, 'base64');
      const validMagic = data.contentType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : data.contentType === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
          : buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
      if (!buffer.length || buffer.length > IMAGE_LIMIT || !validMagic || buffer.toString('base64') !== data.data) invalid('The image data does not match the selected image format.');
      const alt = plain(data.alt, 240, 'image alternative text', true), imageId = randomUUID(), storagePath = `rlPlatformContent/${id}/${imageId}.${extension}`;
      const target = db.doc(`rlPlatformContentImages/${imageId}`);
      await target.create({ contentId: id, storagePath, contentType: data.contentType, alt, status: 'uploading', createdAt: new Date(now()), uploadedBy: auth.uid });
      try {
        await bucket().file(storagePath).save(buffer, { resumable: false, metadata: { contentType: data.contentType, cacheControl: 'private, no-store', metadata: { contentId: id } } });
        await target.update({ status: 'ready' });
      } catch {
        await target.update({ status: 'failed' });
        throw new HttpsError('unavailable', 'The image could not be uploaded. Retry before selecting it.');
      }
      return { image: { id: imageId, url: imageUrl(imageId), contentType: data.contentType, alt } };
    },
    publicImage: async (request, response) => {
      response.set('Cache-Control', 'private, no-store');
      response.set('X-Content-Type-Options', 'nosniff');
      if (!['GET', 'HEAD'].includes(request.method) || typeof request.query?.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(request.query.id)) return response.status(404).send('Image unavailable');
      const image = await db.doc(`rlPlatformContentImages/${request.query.id}`).get();
      if (!image.exists || image.get('status') !== 'ready') return response.status(404).send('Image unavailable');
      const published = await db.doc(`rlPublicContent/${image.get('contentId')}`).get();
      if (!published.exists || published.get('status') !== 'published' || published.get('imageId') !== image.id) return response.status(404).send('Image unavailable');
      response.set('Content-Type', image.get('contentType'));
      if (request.method === 'HEAD') return response.status(200).send('');
      try { const [buffer] = await bucket().file(image.get('storagePath')).download(); return response.status(200).send(buffer); }
      catch { return response.status(404).send('Image unavailable'); }
    },
  };
}

module.exports = { platformCmsHandlers, cleanContent, assertPublishable, publicProjection, contentPath, TYPES, STATUSES, IMAGE_LIMIT };
