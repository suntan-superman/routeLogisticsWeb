const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { getStorage } = require('firebase-admin/storage');
const { PDFDocument } = require('pdf-lib');
const { requireAuth, requireStaff, rateLimit } = require('./security');

const MAX_BYTES = 1024 * 1024;
const PREFIX = 'rlCompanyLogos';
const types = { 'image/png': 'png', 'image/jpeg': 'jpg' };
const pathFor = (companyId, extension) => `${PREFIX}/${companyId}/${randomUUID()}.${extension}`;
const ownedPath = (path, companyId) => typeof path === 'string' &&
  new RegExp(`^${PREFIX}/${companyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[a-f0-9-]{36}\\.(png|jpg)$`).test(path);

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  return null;
}
function validatedBytes(base64, contentType) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new HttpsError('invalid-argument', 'Choose a PNG, JPEG or WebP logo under 1 MB.');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES || imageType(bytes) !== contentType || !types[contentType]) throw new HttpsError('invalid-argument', 'The uploaded logo is not a valid PNG or JPEG image under 1 MB.');
  return bytes;
}
async function loadLogo(path, companyId, bucket = null) {
  if (typeof path === 'string' && /^data:image\/(png|jpeg);base64,/.test(path) && path.length < Math.ceil(MAX_BYTES * 4 / 3) + 64) {
    const [header, encoded] = path.split(','); const contentType = header.slice(5);
    return { bytes: validatedBytes(encoded, contentType), contentType };
  }
  if (!ownedPath(path, companyId)) return null;
  const file = (bucket || getStorage().bucket()).file(path);
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size) > MAX_BYTES || !types[metadata.contentType]) throw new HttpsError('failed-precondition', 'Stored company logo is invalid.');
  const [bytes] = await file.download();
  if (bytes.length > MAX_BYTES || imageType(bytes) !== metadata.contentType) throw new HttpsError('failed-precondition', 'Stored company logo is invalid.');
  return { bytes, contentType: metadata.contentType };
}
function companyLogoHandler(db, { bucket = () => getStorage().bucket() } = {}) {
  return async request => {
    const { token } = requireAuth(request, true);
    const companyId = token.companyId;
    const scope = await requireStaff(db, request, companyId);
    if (!['owner', 'admin'].includes(scope.role) || !scope.company.exists || scope.company.get('isActive') === false || scope.company.get('deletedAt')) throw new HttpsError('permission-denied', 'Only an active company owner or administrator can manage its logo.');
    await rateLimit(db, 'company-logo', scope.uid, 40);
    const action = request.data?.action;
    if (action === 'read') {
      const path = scope.company.get('logo');
      if (!ownedPath(path, companyId)) return { logo: path || '', preview: /^https:\/\//i.test(path || '') || /^data:image\/(png|jpeg);base64,/i.test(path || '') ? path : '' };
      const image = await loadLogo(path, companyId, bucket());
      return { logo: path, preview: `data:${image.contentType};base64,${image.bytes.toString('base64')}` };
    }
    if (!['upload', 'remove', 'url'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a supported logo action.');
    const bytes = action === 'upload' ? validatedBytes(request.data?.base64, request.data?.contentType) : null;
    if (bytes) {
      try {
        const pdf = await PDFDocument.create();
        const image = request.data.contentType === 'image/png' ? await pdf.embedPng(Uint8Array.from(bytes)) : await pdf.embedJpg(Uint8Array.from(bytes));
        if (image.width < 1 || image.height < 1 || image.width > 4096 || image.height > 4096) throw Error('Invalid dimensions');
      } catch { throw new HttpsError('invalid-argument', 'This image cannot be read. Choose another PNG, JPEG or WebP logo.'); }
    }
    const url = action === 'url' ? String(request.data?.url || '').trim() : '';
    if (action === 'url' && (url.length > 2000 || !/^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(url))) throw new HttpsError('invalid-argument', 'Enter a valid HTTPS logo URL.');
    const path = bytes ? pathFor(companyId, types[request.data.contentType]) : null;
    const file = bytes ? bucket().file(path) : null;
    if (file) await file.save(bytes, { contentType: request.data.contentType, resumable: false, metadata: { cacheControl: 'private, max-age=3600', metadata: { companyId } } });
    const ref = db.doc(`companies/${companyId}`);
    try {
      await db.runTransaction(async tx => {
        const [company, member] = await Promise.all([tx.get(ref), scope.role === 'admin' ? tx.get(db.doc(`teamMembers/${scope.memberId}`)) : Promise.resolve(null)]);
        if (!company.exists || company.get('isActive') === false || company.get('deletedAt') ||
          (scope.role === 'owner' ? company.get('ownerId') !== scope.uid : !member?.exists || member.get('uid') !== scope.uid || member.get('companyId') !== companyId || member.get('role') !== 'admin' || member.get('status') !== 'active')) throw new HttpsError('permission-denied', 'Company access changed. Reload before saving the logo.');
        tx.update(ref, { logo: path || url, logoUpdatedAt: new Date(), logoUpdatedBy: scope.uid });
      });
    } catch (error) {
      if (file) await file.delete().catch(() => {}); // Only this unreferenced new object may be removed.
      throw error;
    }
    // Prior objects remain private so issued document snapshots can retain their original brand.
    return { logo: path || url, preview: bytes ? `data:${request.data.contentType};base64,${bytes.toString('base64')}` : url };
  };
}
module.exports = { MAX_BYTES, PREFIX, imageType, validatedBytes, ownedPath, loadLogo, companyLogoHandler };
