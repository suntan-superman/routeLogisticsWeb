const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability } = require('./access');
const { documentId, hash, normalizeEmail, rateLimit } = require('./security');
const { serviceAreaWorkflow } = require('./serviceAreaWorkflows');
const { serviceAreaHandlers } = require('./serviceAreas');
const { canonical, fingerprint } = require('./shared/invoiceMath');
const { LIFECYCLES, INQUIRY_STATUSES, INQUIRY_SOURCES, lifecycleFor, customerArchived, propertiesFor, propertyFor, legacyAddress, normalized, phoneKey } = require('./shared/customerLifecycle');
const fail = (code, message, details) => { throw new HttpsError(code, message, details); };
const helpers = () => require('./customerAddresses');
const projections = () => require('./workData');
const scopeKey = scope => scope.companyId ? `company:${scope.companyId}` : `solo:${scope.uid}`;
const inScope = (scope, row) => row?.exists && (scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid);
const scopedQuery = (db, name, scope) => db.collection(name).where(scope.companyId ? 'companyId' : 'userId', '==', scope.companyId || scope.uid);
const operationId = value => { const id = documentId(value, 'operation'); if (!/^[A-Za-z0-9_-]{16,100}$/.test(id)) fail('invalid-argument', 'Use a stable intake operation ID.'); return id; };
const text = (value, max, label, required = false) => { if (value === undefined && !required) return ''; if (typeof value !== 'string' || value.length > max || /\u0000/.test(value) || required && !value.trim()) fail('invalid-argument', `Enter valid ${label} (${max} characters maximum).`); return value.trim(); };
const viewCustomer = (row, role) => ({ ...projections().projectCustomer(row.id, row.data(), role), lifecycle: lifecycleFor(row.data()), id: row.id });
const viewInquiry = row => canonical({ ...row.data(), id: row.id });
const version = value => projections().customerVersion(value);
const nextVersion = (row, now) => new Date(Math.max(now(), (Date.parse(version(row?.get('updatedAt'))) || 0) + 1)).toISOString();
function localDay(scope, stamp) {
  let zone = scope.company?.get('timeZone') || 'America/Los_Angeles';
  try { new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format(stamp); } catch { zone = 'America/Los_Angeles'; }
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(stamp);
}

async function customerRows(db, scope, tx) {
  const query = scopedQuery(db, 'customers', scope).limit(5001), rows = tx ? await tx.get(query) : await query.get();
  if (rows.size > 5000) fail('resource-exhausted', 'This customer directory needs a narrower indexed matching review before another contact can be created. Existing customers remain available.');
  return rows.docs.filter(row => inScope(scope, row));
}
function exactMatches(rows, input) {
  const email = normalizeEmail(input.email), phone = phoneKey(input.phone || input.phoneNumber), name = normalized(input.name || [input.firstName,input.lastName].filter(Boolean).join(' ')), address = normalized(legacyAddress(input));
  return rows.map(row => {
    const customer = row.data(), reasons = [];
    if (email && normalizeEmail(customer.email || customer.emailNormalized) === email) reasons.push('email');
    if (phone.length >= 7 && phoneKey(customer.phone || customer.phoneNumber) === phone) reasons.push('phone');
    if (name && normalized(customer.name || [customer.firstName,customer.lastName].filter(Boolean).join(' ')) === name) reasons.push('name');
    if (address && propertiesFor(customer).some(property => normalized(property.address) === address)) reasons.push('address');
    return { row, reasons };
  }).filter(match => match.reasons.length);
}
function matchView(match, role) { return { customer: viewCustomer(match.row, role), matchReasons: match.reasons }; }
function checkDuplicateDecision(matches, data, role) {
  if (!matches.length) return;
  if (data.duplicateDecision !== 'separate' || typeof data.duplicateReason !== 'string' || data.duplicateReason.trim().length < 3 || data.duplicateReason.length > 500) fail('failed-precondition', 'Possible matching customers exist. Reuse one or explicitly confirm a separate contact and record why.', { matches: matches.slice(0, 30).map(match => matchView(match, role)), duplicateDecisionRequired: true });
}
async function identityLocks(db, tx, scope, input) {
  const email = normalizeEmail(input.email), phone = phoneKey(input.phone || input.phoneNumber), name = normalized(input.name || [input.firstName,input.lastName].filter(Boolean).join(' ')), address = normalized(legacyAddress(input));
  const keys = [email && `email:${email}`, phone.length >= 7 && `phone:${phone}`, name && `name:${name}`, address && `address:${address}`].filter(Boolean);
  const refs = [...new Set(keys.map(key => hash(`${scopeKey(scope)}:${key}`)))].map(id => db.doc(`rlCustomerIdentityLocks/${id}`));
  return Promise.all(refs.map(async ref => ({ ref, row: await tx.get(ref) })));
}
function commitLocks(tx, locks, scope, now) { locks.forEach(({ ref, row }) => tx.set(ref, { companyId: scope.companyId || null, userId: scope.uid, revision: (row.get('revision') || 0) + 1, updatedAt: new Date(now()) })); }
function operationRef(db, scope, id) { return db.doc(`rlIntakeOperations/${hash(`${scopeKey(scope)}:${scope.uid}:${id}`)}`); }
function replay(row, expected) { if (!row.exists) return null; if (row.get('fingerprint') !== expected) fail('already-exists', 'This operation ID was already used for different intake details.'); return { ...row.get('result'), existing: true }; }
async function assertReplayScope(db, scope, result, tx) {
  const read = ref => tx ? tx.get(ref) : ref.get(), customerId = result.customer?.id || result.inquiry?.customerId;
  if (customerId && !inScope(scope, await read(db.doc(`customers/${documentId(customerId, 'customer')}`)))) fail('permission-denied', 'The saved intake customer is no longer available in this workspace.');
  if (result.inquiry?.id && !inScope(scope, await read(db.doc(`rlInquiries/${documentId(result.inquiry.id, 'inquiry')}`)))) fail('permission-denied', 'The saved inquiry is no longer available in this workspace.');
}
function record(tx, db, scope, target, requestFingerprint, action, result, audit, now) {
  tx.create(target, { companyId: scope.companyId || null, userId: scope.uid, action, fingerprint: requestFingerprint, result: canonical(result), createdAt: new Date(now()) });
  tx.create(db.doc(`rlAudit/intake_${target.id}`), { companyId: scope.companyId || null, actorId: scope.uid, action, ...audit, createdAt: new Date(now()) });
}
function cleanInquiry(input = {}, update = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid-argument', 'Enter inquiry details.');
  const allowed = ['serviceRequested','serviceCategory','source','sourceDetails','notes','followUpDate','followUpMemberId','status','servicePropertyId'];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('invalid-argument', 'Only supported inquiry fields can be changed.');
  const result = {};
  for (const [key, max] of [['serviceRequested',300],['serviceCategory',200],['sourceDetails',500],['notes',4000]]) if (!update || input[key] !== undefined) result[key] = text(input[key], max, key, key === 'serviceRequested');
  if (!update || input.source !== undefined) { if (!INQUIRY_SOURCES.includes(input.source)) fail('invalid-argument', 'Choose a supported inquiry source.'); result.source = input.source; }
  if (!update || input.status !== undefined) { const status = input.status || 'new'; if (!INQUIRY_STATUSES.includes(status)) fail('invalid-argument', 'Choose a supported inquiry status.'); result.status = status; }
  if (!update || input.followUpDate !== undefined) { const value = input.followUpDate || ''; if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value)) fail('invalid-argument', 'Choose a valid follow-up date.'); result.followUpDate = value; }
  if (!update || input.followUpMemberId !== undefined) result.followUpMemberId = input.followUpMemberId ? documentId(input.followUpMemberId, 'follow-up member') : null;
  if (input.servicePropertyId !== undefined) result.servicePropertyId = documentId(input.servicePropertyId, 'property');
  return result;
}
async function assertFollowUpStaff(db, tx, scope, memberId) {
  if (!memberId) return;
  if (!scope.companyId) { if (memberId !== scope.uid) fail('permission-denied', 'Choose your current workspace follow-up identity.'); return; }
  const company = await tx.get(db.doc(`companies/${scope.companyId}`));
  if (company.get('ownerId') === memberId) return;
  const member = await tx.get(db.doc(`teamMembers/${memberId}`));
  if (!member.exists || member.get('companyId') !== scope.companyId || member.get('status') !== 'active' || !member.get('uid')) fail('permission-denied', 'Choose an active follow-up staff member from this company.');
}
function cleanProperty(input = {}) {
  const label = input.label || 'other';
  if (!['home','rental','office','other'].includes(label)) fail('invalid-argument', 'Choose Home, Rental, Office or Other for this property.');
  return { label, address: text(input.address, 500, 'service property address', true), unit: text(input.unit, 100, 'unit information'), accessInstructions: text(input.accessInstructions, 2000, 'property access instructions') };
}
function preparedProperty(clean, prepared, id, revision, now) {
  const property = prepared.patch?.serviceProperty || {};
  return { ...property, id, revision, label: clean.label, address: property.address || clean.address, unit: clean.unit, accessInstructions: clean.accessInstructions,
    serviceAreaExceptionId: prepared.result?.exceptionId || null, serviceCategory: prepared.serviceCategory || '',
    validated: property.validated === true, validationStatus: property.validated === true ? 'verified' : 'unverified', ...(property.validated !== true ? { validationWarning: property.validationMessage || 'Google could not confirm this address. It is retained for authorized internal review.' } : {}), updatedAt: new Date(now()).toISOString() };
}
function embedProperty(customer, property, isPrimary) {
  const rows = (Array.isArray(customer.serviceProperties) ? customer.serviceProperties : []).filter(row => row.id !== property.id);
  if (rows.length >= 50) fail('resource-exhausted', 'This customer already has the maximum 50 saved service properties.');
  return { serviceProperties: [...rows, property], primaryPropertyId: isPrimary || !propertiesFor(customer).length ? property.id : customer.primaryPropertyId || 'legacy-primary' };
}

async function createManagedCustomer(db, request, config = {}, suppliedScope) {
  const scope = suppliedScope || await requireCapability(db, request, 'customers.manage'), data = request.data || {}, now = config.now || (() => Date.now());
  const id = operationId(data.operationId || randomUUID()), operation = operationRef(db, scope, id), requestFingerprint = fingerprint({ action: 'customer.create', customer: data.customer, duplicateDecision: data.duplicateDecision || null, duplicateReason: data.duplicateReason || null });
  const previous = await operation.get(); if (previous.exists) { await helpers().assertCustomerActor(db, { get: ref => ref.get() }, scope); const result = replay(previous, requestFingerprint); await assertReplayScope(db, scope, result); return result; }
  const patch = helpers().cleanCustomerPatch(data.customer, true), address = legacyAddress(patch), validator = config.serviceAreas || serviceAreaHandlers(db, config);
  checkDuplicateDecision(exactMatches(await customerRows(db, scope), patch), data, scope.role);
  if (address) Object.assign(patch, helpers().validatedCustomerAddress(await validator.validateAddress(scope, address)));
  const target = db.doc(`customers/rl_contact_${hash(`${scopeKey(scope)}:${scope.uid}:${id}`)}`);
  return db.runTransaction(async tx => {
    await helpers().assertCustomerActor(db, tx, scope);
    const [oldOperation, old, locks, rows] = await Promise.all([tx.get(operation), tx.get(target), identityLocks(db, tx, scope, patch), customerRows(db, scope, tx)]);
    const repeated = replay(oldOperation, requestFingerprint); if (repeated) { await assertReplayScope(db, scope, repeated, tx); return repeated; }
    if (old.exists) fail('already-exists', 'The contact identity already exists. Reuse it explicitly.');
    checkDuplicateDecision(exactMatches(rows, patch), data, scope.role);
    const updatedAt = new Date(now()).toISOString(), customer = { ...patch, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), lifecycle: patch.lifecycle || 'active', isActive: patch.isActive !== false, createdAt: updatedAt, updatedAt, totalJobs: 0, totalSpent: 0, lastServiceDate: null };
    const result = { id: target.id, customer: { ...projections().projectCustomer(target.id, customer, scope.role), lifecycle: customer.lifecycle, id: target.id }, updatedAt, existing: false };
    tx.create(target, customer); commitLocks(tx, locks, scope, now);
    record(tx, db, scope, operation, requestFingerprint, 'customer.create', result, { customerId: target.id, lifecycle: customer.lifecycle, separateContact: data.duplicateDecision === 'separate', separateReason: data.duplicateDecision === 'separate' ? data.duplicateReason.trim() : null }, now);
    return result;
  });
}

function customerIntakeHandlers(db, config = {}) {
  const now = config.now || (() => Date.now()), areas = serviceAreaWorkflow(db, config);
  const getCustomer = async (scope, customerId, tx) => { const target = db.doc(`customers/${documentId(customerId, 'customer')}`), row = tx ? await tx.get(target) : await target.get(); if (!inScope(scope, row)) fail('permission-denied', 'Choose a customer from this workspace.'); if (customerArchived(row.data())) fail('failed-precondition', 'This customer is archived. Restore it explicitly before recording another inquiry or service property.'); return row; };
  const prepare = (scope, property, data = {}) => areas.prepare(scope, { serviceProperty: { address: property.address }, serviceCategory: data.serviceCategory || '', ...(data.serviceAreaExceptionId ? { serviceAreaExceptionId: data.serviceAreaExceptionId } : {}) }, {}, 'scheduling', true);
  return { handle: async request => {
    const scope = await requireCapability(db, request, 'customers.manage'), data = request.data || {}, action = data.action;
    if (data.companyId !== undefined && data.companyId !== scope.companyId) fail('permission-denied', 'Choose the current workspace.');
    await rateLimit(db, 'customer-intake', scope.uid, 90);
    if (action === 'matches') {
      const query = text(data.query || '', 500, 'customer search'), key = normalized(query), digits = phoneKey(query);
      if (key.length < 2) return { matches: [], hasMore: false };
      const rows = await customerRows(db, scope), matches = rows.map(row => {
        const customer = row.data(), reasons = [];
        if (normalized(customer.name || [customer.firstName,customer.lastName].filter(Boolean).join(' ')).includes(key)) reasons.push('name');
        if (normalizeEmail(customer.email || customer.emailNormalized).includes(query.toLowerCase())) reasons.push('email');
        if (digits.length >= 3 && phoneKey(customer.phone || customer.phoneNumber).includes(digits)) reasons.push('phone');
        if (propertiesFor(customer).some(property => normalized(property.address).includes(key))) reasons.push('address');
        return { row, reasons };
      }).filter(match => match.reasons.length);
      return { matches: matches.slice(0,30).map(match => matchView(match, scope.role)), hasMore: matches.length > 30 };
    }
    if (action === 'list') {
      const filter = data.filter || 'all'; if (!['all','new','due','overdue','scheduled','closed'].includes(filter)) fail('invalid-argument', 'Choose a supported inquiry filter.');
      const rows = await scopedQuery(db, 'rlInquiries', scope).orderBy('updatedAt','desc').limit(501).get(), today = localDay(scope, now());
      const inquiries = rows.docs.map(viewInquiry).filter(row => filter === 'all' || filter === 'new' && row.status === 'new' || filter === 'closed' && ['closed','converted'].includes(row.status) || filter === 'scheduled' && row.status === 'estimate_scheduled' || ['due','overdue'].includes(filter) && !['closed','converted'].includes(row.status) && row.followUpDate && (filter === 'due' ? row.followUpDate <= today : row.followUpDate < today));
      return { inquiries: inquiries.slice(0,500), hasMore: rows.size > 500 };
    }
    if (action === 'properties') {
      const customer = await getCustomer(scope, data.customerId);
      return { customerId: customer.id, properties: canonical(propertiesFor(customer.data())), customerVersion: version(customer.get('updatedAt')), customerLifecycle: lifecycleFor(customer.data()), customer: viewCustomer(customer, scope.role) };
    }
    if (!['create','update','saveProperty','lifecycle'].includes(action)) fail('invalid-argument', 'Choose a supported inquiry/customer-property action.');
    const operation = operationRef(db, scope, operationId(data.operationId)), requestFingerprint = fingerprint(data), previous = await operation.get();
    if (previous.exists) { await helpers().assertCustomerActor(db, { get: ref => ref.get() }, scope); const result = replay(previous, requestFingerprint); await assertReplayScope(db, scope, result); return result; }
    if (action === 'create') {
      if (!!data.customerId === !!data.customer) fail('invalid-argument', 'Reuse an existing customer or enter a new prospect, not both.');
      const inquiry = cleanInquiry(data.inquiry); if (inquiry.status !== 'new') fail('invalid-argument', 'A new inquiry starts in New status.');
      const initial = data.customerId ? await getCustomer(scope, data.customerId) : null;
      const contact = initial ? null : { ...helpers().cleanCustomerPatch(data.customer, true), lifecycle: 'prospect' };
      const clean = data.property ? cleanProperty(data.property) : null;
      const contactIdentity = contact ? { ...contact, address: legacyAddress(contact) || clean?.address || '' } : null;
      if (contact) checkDuplicateDecision(exactMatches(await customerRows(db, scope), contactIdentity), data, scope.role);
      if (data.propertyId && clean) fail('invalid-argument', 'Select an existing property or explicitly add one, not both.');
      if (!clean && !data.propertyId) fail('invalid-argument', 'Select or add the service property for this inquiry.');
      const prepared = clean ? await prepare(scope, clean, { ...data, serviceCategory: inquiry.serviceCategory }) : null;
      const customerRef = initial?.ref || db.doc(`customers/rl_prospect_${hash(`${scopeKey(scope)}:${scope.uid}:${data.operationId}`)}`), inquiryRef = db.doc(`rlInquiries/${hash(`${scopeKey(scope)}:${scope.uid}:${data.operationId}`)}`);
      return db.runTransaction(async tx => {
        await helpers().assertCustomerActor(db, tx, scope);
        const [oldOperation, customer, oldInquiry] = await Promise.all([tx.get(operation), tx.get(customerRef), tx.get(inquiryRef)]);
        const repeated = replay(oldOperation, requestFingerprint); if (repeated) { await assertReplayScope(db, scope, repeated, tx); return repeated; }
        if (oldInquiry.exists || !initial && customer.exists) fail('already-exists', 'This inquiry identity already exists. Refresh the saved inquiry.');
        if (initial && (!inScope(scope, customer) || customerArchived(customer.data()))) fail('permission-denied', 'This customer is no longer available.');
        if (initial && !customer.updateTime.isEqual(initial.updateTime)) fail('aborted', 'The customer changed while the property was checked. Refresh before saving the inquiry.');
        const locks = !initial ? await identityLocks(db, tx, scope, contactIdentity) : [], rows = !initial ? await customerRows(db, scope, tx) : [];
        if (!initial) checkDuplicateDecision(exactMatches(rows, contactIdentity), data, scope.role);
        await assertFollowUpStaff(db, tx, scope, inquiry.followUpMemberId);
        if (prepared) await areas.assertCurrent(tx, prepared);
        const updatedAt = nextVersion(customer, now), base = initial ? customer.data() : { ...contact, userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), isActive: true, lifecycle: 'prospect', totalJobs: 0, totalSpent: 0, lastServiceDate: null, createdAt: updatedAt, updatedAt };
        let property, patch = {};
        if (clean) { const propertyId = initial ? `property_${hash(data.operationId).slice(0,32)}` : 'legacy-primary'; property = preparedProperty(clean, prepared, propertyId, 1, now); patch = embedProperty(base, property, !initial || data.property.isPrimary === true); }
        else property = propertyFor(base, documentId(data.propertyId, 'service property'));
        if (!property) fail('failed-precondition', 'That service property is no longer associated with this customer. Refresh the property list.');
        const nextCustomer = { ...base, ...patch, ...(clean ? { updatedAt } : {}) }, recordData = { ...inquiry, userId: scope.uid, companyId: scope.companyId || null, customerId: customerRef.id, customerName: nextCustomer.name || '', customerEmail: normalizeEmail(nextCustomer.email), customerPhone: nextCustomer.phone || nextCustomer.phoneNumber || '', servicePropertyId: property.id,
          propertySnapshot: canonical(property), serviceAreaExceptionId: prepared?.result?.exceptionId || property.serviceAreaExceptionId || null, revision: 1, createdByUid: scope.uid, createdByMemberId: scope.memberId || scope.uid, createdAt: new Date(now()), updatedAt: new Date(now()) };
        const result = { inquiry: canonical({ ...recordData, id: inquiryRef.id }), customer: { ...projections().projectCustomer(customerRef.id, nextCustomer, scope.role), lifecycle: lifecycleFor(nextCustomer), id: customerRef.id }, property: canonical(property), existing: false };
        if (!initial) { tx.create(customerRef, nextCustomer); commitLocks(tx, locks, scope, now); }
        else if (clean) tx.update(customerRef, { ...patch, updatedAt });
        tx.create(inquiryRef, recordData);
        record(tx, db, scope, operation, requestFingerprint, 'inquiry.create', result, { inquiryId: inquiryRef.id, customerId: customerRef.id, createdProspect: !initial, separateContact: data.duplicateDecision === 'separate', separateReason: data.duplicateDecision === 'separate' ? data.duplicateReason.trim() : null }, now);
        return result;
      });
    }
    if (action === 'saveProperty') {
      const initial = await getCustomer(scope, data.customerId), clean = cleanProperty(data.property), prepared = await prepare(scope, clean, data);
      return db.runTransaction(async tx => {
        await helpers().assertCustomerActor(db, tx, scope);
        const [customer, oldOperation] = await Promise.all([tx.get(initial.ref), tx.get(operation)]); const repeated = replay(oldOperation, requestFingerprint); if (repeated) { await assertReplayScope(db, scope, repeated, tx); return repeated; }
        if (!inScope(scope, customer) || customerArchived(customer.data())) fail('permission-denied', 'This customer is no longer available.');
        if (data.expectedVersion === undefined || version(customer.get('updatedAt')) !== version(data.expectedVersion) || !customer.updateTime.isEqual(initial.updateTime)) fail('aborted', 'The saved customer properties changed. Refresh before editing.');
        await areas.assertCurrent(tx, prepared);
        const propertyId = data.propertyId ? documentId(data.propertyId, 'property') : `property_${hash(data.operationId).slice(0,32)}`, before = propertyFor(customer.data(), propertyId);
        if (data.propertyId && !before) fail('failed-precondition', 'Select a saved property before editing.');
        const property = preparedProperty(clean, prepared, propertyId, (before?.revision || 0) + 1, now), patch = embedProperty(customer.data(), property, data.property.isPrimary === true), updatedAt = nextVersion(customer, now), next = { ...customer.data(), ...patch, updatedAt };
        const result = { customer: { ...projections().projectCustomer(customer.id, next, scope.role), lifecycle: lifecycleFor(next), id: customer.id }, properties: canonical(propertiesFor(next)), property: canonical({ ...property, isPrimary: next.primaryPropertyId === property.id }), customerVersion: updatedAt, existing: false };
        tx.update(customer.ref, { ...patch, updatedAt }); record(tx, db, scope, operation, requestFingerprint, 'customer.property.save', result, { customerId: customer.id, propertyId, propertyRevision: property.revision }, now); return result;
      });
    }
    if (action === 'lifecycle') {
      if (!LIFECYCLES.includes(data.lifecycle)) fail('invalid-argument', 'Choose Prospect, Active or Inactive.');
      const initial = await getCustomer(scope, data.customerId);
      return db.runTransaction(async tx => {
        await helpers().assertCustomerActor(db, tx, scope);
        const [customer, oldOperation] = await Promise.all([tx.get(initial.ref), tx.get(operation)]); const repeated = replay(oldOperation, requestFingerprint); if (repeated) { await assertReplayScope(db, scope, repeated, tx); return repeated; }
        if (!inScope(scope, customer) || customerArchived(customer.data())) fail('permission-denied', 'Choose this workspace customer.');
        if (data.expectedVersion === undefined || version(customer.get('updatedAt')) !== version(data.expectedVersion)) fail('aborted', 'The customer changed. Refresh before changing lifecycle.');
        const updatedAt = nextVersion(customer, now), before = lifecycleFor(customer.data()), next = { ...customer.data(), lifecycle: data.lifecycle, updatedAt };
        const result = { customer: { ...projections().projectCustomer(customer.id, next, scope.role), lifecycle: data.lifecycle, id: customer.id }, customerVersion: updatedAt, existing: false };
        tx.update(customer.ref, { lifecycle: data.lifecycle, updatedAt }); record(tx, db, scope, operation, requestFingerprint, 'customer.lifecycle', result, { customerId: customer.id, fromLifecycle: before, toLifecycle: data.lifecycle, reason: text(data.reason, 500, 'lifecycle reason') }, now); return result;
      });
    }
    const inquiryRef = db.doc(`rlInquiries/${documentId(data.inquiryId, 'inquiry')}`), patch = cleanInquiry(data.changes, true);
    return db.runTransaction(async tx => {
      await helpers().assertCustomerActor(db, tx, scope);
      const [inquiry, oldOperation] = await Promise.all([tx.get(inquiryRef), tx.get(operation)]); const repeated = replay(oldOperation, requestFingerprint); if (repeated) { await assertReplayScope(db, scope, repeated, tx); return repeated; }
      if (!inScope(scope, inquiry)) fail('permission-denied', 'This inquiry is not available in your workspace.');
      if (!Number.isInteger(data.expectedRevision) || data.expectedRevision !== inquiry.get('revision')) fail('aborted', 'This inquiry changed. Refresh before saving follow-up details.');
      if (['closed','converted'].includes(inquiry.get('status')) && patch.status && patch.status !== inquiry.get('status')) fail('failed-precondition', 'This inquiry is closed. Record another inquiry for a new request instead of overwriting its history.');
      await assertFollowUpStaff(db, tx, scope, patch.followUpMemberId);
      const customer = await getCustomer(scope, inquiry.get('customerId'), tx);
      if (patch.servicePropertyId) {
        if (inquiry.get('appointmentId')) fail('failed-precondition', 'Reschedule the linked appointment before changing its inquiry property.');
        const property = propertyFor(customer.data(), patch.servicePropertyId); if (!property) fail('failed-precondition', 'Choose a property associated with this customer.'); patch.propertySnapshot = canonical(property);
      }
      const updated = { ...patch, revision: inquiry.get('revision') + 1, updatedAt: new Date(now()) }, next = { ...inquiry.data(), ...updated };
      const result = { inquiry: canonical({ ...next, id: inquiry.id }), existing: false };
      tx.update(inquiryRef, updated); record(tx, db, scope, operation, requestFingerprint, 'inquiry.update', result, { inquiryId: inquiry.id, customerId: customer.id, fromStatus: inquiry.get('status'), toStatus: next.status, revision: next.revision }, now); return result;
    });
  } };
}
module.exports = { customerIntakeHandlers, createManagedCustomer, exactMatches, lifecycleFor, propertiesFor, propertyFor, INQUIRY_STATUSES, INQUIRY_SOURCES };
