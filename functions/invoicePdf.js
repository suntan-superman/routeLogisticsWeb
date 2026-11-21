const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { HttpsError } = require('firebase-functions/v2/https');
const { getStorage } = require('firebase-admin/storage');
const { requireCapability } = require('./access');
const { authorizeInvoice } = require('./payments');
const { documentId, rateLimit } = require('./security');
const { publicSnapshot, assertCurrentInvoice } = require('./shared/invoiceV2');
const { fingerprint } = require('./shared/invoiceMath');
const { loadLogo } = require('./companyLogo');

const dollars = cents => `$${(cents / 100).toFixed(2)}`;
const text = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ').normalize('NFKD').replace(/[^\x20-\x7e]/g, '?').slice(0, 2000);
function wrap(value, font, size, width) {
  const words = text(value).split(/\s+/).flatMap(word => {
    const pieces = [], chars = [...word]; let part = '';
    for (const char of chars) { if (font.widthOfTextAtSize(part + char, size) > width && part) { pieces.push(part); part = ''; } part += char; }
    if (part) pieces.push(part); return pieces;
  }), lines = [];
  let current = '';
  for (const word of words) {
    if (!word) continue;
    if (font.widthOfTextAtSize(`${current} ${word}`.trim(), size) <= width) current = `${current} ${word}`.trim();
    else { if (current) lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function buildInvoicePdf(snapshot, { preview = false, photoProvider = null, logoProvider = loadLogo } = {}) {
  if (!snapshot || snapshot.financialVersion !== 2 || snapshot.fingerprint !== fingerprint(Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== 'fingerprint')))) throw new HttpsError('failed-precondition', 'The issued invoice snapshot is invalid.');
  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const green = rgb(0.03, 0.34, 0.25), dark = rgb(0.12, 0.19, 0.18), muted = rgb(0.38, 0.43, 0.42), width = 612, height = 792;
  let page, y;
  const newPage = () => { page = pdf.addPage([width, height]); y = height - 48; };
  const line = (value, options = {}) => {
    const size = options.size || 10, font = options.bold ? bold : regular, maxWidth = options.width || 510;
    for (const part of wrap(value, font, size, maxWidth)) {
      if (y < 65) newPage();
      page.drawText(part, { x: options.x || 50, y, size, font, color: options.color || dark }); y -= size + (options.gap || 5);
    }
  };
  newPage();
  if (snapshot.business.logo) {
    try {
      const stored = snapshot.business.logoCompanyId && snapshot.business.logo.startsWith('rlCompanyLogos/')
        ? await logoProvider(snapshot.business.logo, snapshot.business.logoCompanyId) : null;
      const inline = /^data:image\/(png|jpeg);base64,/.test(snapshot.business.logo) ? snapshot.business.logo : '';
      const buffer = stored?.bytes || (inline ? Buffer.from(inline.split(',')[1], 'base64') : null);
      if (buffer && buffer.length <= 1024 * 1024) {
        const image = (stored?.contentType === 'image/png' || inline.startsWith('data:image/png')) ? await pdf.embedPng(Uint8Array.from(buffer)) : await pdf.embedJpg(Uint8Array.from(buffer));
        const scaled = image.scale(Math.min(110 / image.width, 55 / image.height));
        page.drawImage(image, { x: 450, y: height - 100, width: scaled.width, height: scaled.height });
      }
    } catch (error) {
      if (snapshot.business.logo.startsWith('rlCompanyLogos/')) throw new HttpsError('failed-precondition', 'The stored company logo could not be embedded in this invoice.', { cause: error.code || 'image-error' });
      // Legacy inline logos may be malformed; preserve access to older invoices.
    }
  }
  line(snapshot.business.name || 'Service provider', { size: 20, bold: true, color: green, width: 380 });
  for (const value of [snapshot.business.address, snapshot.business.phone, snapshot.business.email]) if (value) line(value, { size: 9, color: muted });
  y -= 16;
  line(preview ? 'INVOICE PREVIEW — NOT ISSUED' : 'INVOICE', { size: 18, bold: true, color: green });
  line(`Number: ${snapshot.invoiceNumber}`);
  line(`Issued: ${snapshot.issueDate}    Due: ${snapshot.dueDate}`);
  y -= 12;
  line('BILL TO', { bold: true, color: green });
  line(snapshot.customer.name);
  if (snapshot.customer.billingAddress) line(snapshot.customer.billingAddress);
  if (snapshot.customer.email) line(snapshot.customer.email);
  if (snapshot.propertyAddress) { y -= 8; line('SERVICE PROPERTY', { bold: true, color: green }); line(snapshot.propertyAddress); }
  if (snapshot.serviceSummary) { y -= 8; line('SERVICE SUMMARY', { bold: true, color: green }); line(snapshot.serviceSummary); }
  y -= 18;
  line('ITEMIZED SERVICES', { bold: true, color: green });
  for (const item of snapshot.lineItems) {
    const amount = dollars(item.amountCents), qty = `${item.quantity} × ${dollars(item.unitPriceCents)}`;
    const parts = wrap(`${item.description}  (${qty}${item.discountCents ? `, discount ${dollars(item.discountCents)}` : ''})`, regular, 10, 400);
    if (y < 65 + Math.min(parts.length, 3) * 15) newPage();
    page.drawText(amount, { x: width - 50 - bold.widthOfTextAtSize(amount, 10), y, size: 10, font: bold, color: dark });
    for (const part of parts) line(part, { size: 10, width: 400 });
    y -= 3;
  }
  y -= 12;
  if (snapshot.discountCents) { line(`Services: ${dollars(snapshot.grossSubtotalCents)}`); line(`Discounts: -${dollars(snapshot.discountCents)}`); }
  line(`Subtotal: ${dollars(snapshot.subtotalCents)}`, { bold: true });
  line(`Tax (${snapshot.taxRate}%): ${dollars(snapshot.taxCents)}`);
  line(`Total: ${dollars(snapshot.totalCents)} USD`, { size: 14, bold: true, color: green });
  if (snapshot.paymentTerms) { y -= 10; line('PAYMENT TERMS', { bold: true, color: green }); line(snapshot.paymentTerms); }
  if (photoProvider) for (const photo of snapshot.approvedPhotos || []) {
    const bytes = await photoProvider(photo.storagePath);
    if (!bytes) continue;
    let image;
    try { image = bytes[0] === 0xff ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes); } catch { continue; }
    newPage(); line('APPROVED SERVICE PHOTO', { size: 14, bold: true, color: green });
    if (photo.caption) line(photo.caption);
    const scaled = image.scale(Math.min(500 / image.width, 620 / image.height));
    page.drawImage(image, { x: 50, y: Math.max(65, y - scaled.height), width: scaled.width, height: scaled.height });
  }
  pdf.getPages().forEach((sheet, index) => sheet.drawText(`Page ${index + 1} of ${pdf.getPageCount()}`, { x: 500, y: 28, size: 9, font: regular, color: muted }));
  return Buffer.from(await pdf.save());
}

async function approvedPhotoBytes(path) {
  if (typeof path !== 'string' || !path.startsWith('rlJobPhotos/')) return null;
  const file = getStorage().bucket().file(path), [metadata] = await file.getMetadata();
  if (!['image/jpeg', 'image/png'].includes(metadata.contentType) || Number(metadata.size) > 2 * 1024 * 1024) return null;
  const [bytes] = await file.download(); return bytes.length <= 2 * 1024 * 1024 ? bytes : null;
}

function invoicePdfHandler(db) {
  return async request => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to view the invoice.');
    const id = documentId(request.data?.invoiceId, 'invoice'), row = await db.doc(`invoices/${id}`).get();
    if (!row.exists) throw new HttpsError('not-found', 'Invoice not found.');
    assertCurrentInvoice(row.data());
    const preview = request.data?.preview === true;
    if (preview) await requireCapability(db, request, 'invoices.manage', row.data());
    else await authorizeInvoice(db, request, row.data());
    await rateLimit(db, 'invoice-pdf', request.auth.uid, 30);
    if (!preview && !row.get('issuedSnapshot')) throw new HttpsError('failed-precondition', 'Invoice has not been issued.');
    const company = preview && row.get('companyId') ? await db.doc(`companies/${row.get('companyId')}`).get() : null;
    const snapshot = preview ? publicSnapshot(row.data(), company?.data() || {}) : row.get('issuedSnapshot');
    const bytes = await buildInvoicePdf(snapshot, { preview, photoProvider: approvedPhotoBytes });
    if (bytes.length > 8 * 1024 * 1024) throw new HttpsError('resource-exhausted', 'Invoice PDF is too large.');
    return { fileName: `${snapshot.invoiceNumber}.pdf`, base64: bytes.toString('base64'), contentType: 'application/pdf' };
  };
}

module.exports = { buildInvoicePdf, invoicePdfHandler, approvedPhotoBytes };
