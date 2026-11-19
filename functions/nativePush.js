const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const { requireAuth, requireAccountActive, requireStaff, rateLimit, hash, documentId } = require('./security');
const EXPO_PROJECT_ID = 'a6b5d885-dd99-4435-bef0-b7ffe09a2890';
const defaultPreferences = { enabled: true, assignments: true, schedule: true, status: true };
const tokenPattern = /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
const scopeMatches = (first, second) => ['uid', 'companyId', 'membershipId', 'role'].every(key => (first?.[key] || null) === (second?.[key] || null));
const preferenceId = scope => hash([scope.uid, scope.companyId, scope.membershipId || '', scope.role].join(':'));
const routineTechnicianStatuses = new Set(['en-route', 'in-progress', 'completed']);
function jobEvents(before, after) {
  if (!after?.companyId) return [];
  const events = [];
  if (before?.assignedTo && before.assignedTo !== after.assignedTo) events.push('removal');
  if (after.assignedTo && before?.assignedTo !== after.assignedTo) events.push('assignment');
  else if (after.assignedTo && before && ['date', 'time', 'address'].some(key => String(before[key] || '') !== String(after[key] || ''))) events.push('schedule');
  if (before && before.status !== after.status && ['en-route', 'in-progress', 'completed', 'cancelled'].includes(after.status)) events.push('status');
  if (after.reassignmentRequest?.status === 'pending' && before?.reassignmentRequest?.id !== after.reassignmentRequest.id) events.push('reassignment-request');
  return events;
}
function validatedRegistration(data) {
  if (!tokenPattern.test(data.token || '') || !['ios', 'android'].includes(data.platform) || data.projectId !== EXPO_PROJECT_ID) throw new HttpsError('invalid-argument', 'Use the native Route Logistics application to register this device.');
  if (typeof data.installationId !== 'string' || !/^[a-f0-9-]{32,80}$/i.test(data.installationId)) throw new HttpsError('invalid-argument', 'A valid device installation is required.');
  if (!Number.isSafeInteger(data.registrationSequence) || data.registrationSequence < 1) throw new HttpsError('invalid-argument', 'A current registration sequence is required.');
  return { token: data.token, platform: data.platform, installationHash: hash(data.installationId), projectId: EXPO_PROJECT_ID, registrationSequence: data.registrationSequence };
}
function nativePushHandlers(db, { enabled = () => false, fetcher = fetch, accessToken = () => '', getUser, now = () => Date.now() } = {}) {
  const devices = db.collection('rlPushDevices'), preferences = db.collection('rlPushPreferences'), deliveries = db.collection('rlPushDeliveries');
  async function scopeFor(request) {
    const { uid, token } = requireAuth(request, true), staff = await requireStaff(db, request, token.companyId);
    return { uid, companyId: staff.company.id, membershipId: staff.memberId || null, role: staff.role };
  }
  async function currentRecipient(scope, job, kind) {
    if (job.companyId !== scope.companyId) return false;
    // Technicians initiate and immediately see these routine transitions in the
    // work-order UI. Sending the same transition back to their own device adds
    // noise without conveying new information. Cancellation remains important
    // and is deliberately still delivered to the assigned technician.
    if (scope.role === 'technician' && kind === 'status' && routineTechnicianStatuses.has(job.status)) return false;
    const company = await db.collection('companies').doc(scope.companyId).get();
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt')) return false;
    if (scope.role === 'owner') { if (company.get('ownerId') !== scope.uid) return false; }
    else {
      if (!scope.membershipId) return false;
      const member = await db.collection('teamMembers').doc(scope.membershipId).get();
      if (member.get('uid') !== scope.uid || member.get('companyId') !== scope.companyId || member.get('status') !== 'active' || member.get('role') !== scope.role) return false;
      if (scope.role === 'technician' && kind !== 'removal' && job.assignedTo !== scope.membershipId) return false;
      if (!['technician', 'manager', 'admin'].includes(scope.role)) return false;
    }
    if (kind === 'reassignment-request' && !['owner','admin','manager'].includes(scope.role)) return false;
    if (kind === 'removal' && (job.assignedTo === (scope.membershipId || scope.uid) || job.assignedToUid === scope.uid)) return false;
    if (getUser) { const account = await getUser(scope.uid).catch(() => null); if (!account || account.disabled || !account.emailVerified) return false; }
    return true;
  }
  async function manage(request) {
    const { uid } = requireAuth(request, true), data = request.data || {};
    await requireAccountActive(db, uid);
    await rateLimit(db, 'native-push', uid, 60);
    if (data.action === 'invalidate-installation') {
      if (typeof data.installationId !== 'string' || !/^[a-f0-9-]{32,80}$/i.test(data.installationId) || !Number.isSafeInteger(data.registrationSequence) || data.registrationSequence < 1) throw new HttpsError('invalid-argument', 'A valid installation release is required.');
      const installationHash = hash(data.installationId), installationRef = db.collection('rlPushInstallations').doc(hash(`${EXPO_PROJECT_ID}:${installationHash}`));
      await db.runTransaction(async tx => { const [installation, siblings] = await Promise.all([tx.get(installationRef), tx.get(devices.where('installationHash', '==', installationHash))]);
        if ((installation.get('registrationSequence') || 0) >= data.registrationSequence) return;
        for (const sibling of siblings.docs) if (sibling.get('active') === true) tx.update(sibling.ref, { active: false, invalidatedAt: new Date(now()), invalidationReason: 'installation-released' });
        tx.set(installationRef, { uid, companyId: null, membershipId: null, role: null, deviceId: null, installationHash, registrationSequence: data.registrationSequence, updatedAt: new Date(now()), disabled: true });
      });
      return { invalidated: true };
    }
    if (data.action === 'invalidate') {
      const ref = devices.doc(documentId(data.deviceId, 'device')), installationHash = hash(String(data.installationId || ''));
      await db.runTransaction(async tx => { const record = await tx.get(ref); if (record.get('uid') === uid && record.get('installationHash') === installationHash && record.get('registrationSequence') === data.registrationSequence) tx.update(ref, { active: false, invalidatedAt: new Date(now()), invalidationReason: 'client-disabled' }); });
      return { invalidated: true };
    }
    const scope = await scopeFor(request), preferenceRef = preferences.doc(preferenceId(scope));
    const existing = await preferenceRef.get();
    const current = { ...defaultPreferences, ...(existing.data()?.preferences || {}) };
    if (data.action === 'status') return { available: enabled(), preferences: current, projectId: EXPO_PROJECT_ID };
    if (data.action === 'preferences') {
      if (!data.preferences || Object.keys(data.preferences).some(key => !(key in defaultPreferences) || typeof data.preferences[key] !== 'boolean')) throw new HttpsError('invalid-argument', 'Invalid notification preferences.');
      let next;
      await db.runTransaction(async tx => { const latest = await tx.get(preferenceRef); next = { ...defaultPreferences, ...(latest.data()?.preferences || {}), ...data.preferences }; tx.set(preferenceRef, { ...scope, preferences: next, updatedAt: new Date(now()) }); });
      return { available: enabled(), preferences: next };
    }
    if (data.action !== 'register') throw new HttpsError('invalid-argument', 'Unknown native notification action.');
    if (!enabled()) throw new HttpsError('failed-precondition', 'Native push delivery is awaiting production push credentials and activation.');
    const registration = validatedRegistration(data), deviceId = hash(`${EXPO_PROJECT_ID}:${registration.token}`), ref = devices.doc(deviceId);
    const installationRef = db.collection('rlPushInstallations').doc(hash(`${EXPO_PROJECT_ID}:${registration.installationHash}`));
    await db.runTransaction(async tx => {
      const [previous, installation, siblings] = await Promise.all([tx.get(ref), tx.get(installationRef), tx.get(devices.where('installationHash', '==', registration.installationHash))]);
      if (previous.exists && previous.get('installationHash') !== registration.installationHash) throw new HttpsError('permission-denied', 'This push token belongs to another installation. Refresh this device registration.');
      const newest = installation.get('registrationSequence') || 0;
      if (newest > registration.registrationSequence || (newest === registration.registrationSequence && installation.exists && (!scopeMatches(installation.data(), scope) || installation.get('deviceId') !== deviceId))) throw new HttpsError('aborted', 'A newer device registration superseded this request.');
      for (const sibling of siblings.docs) if (sibling.id !== deviceId && sibling.get('active') === true) tx.update(sibling.ref, { active: false, invalidatedAt: new Date(now()), invalidationReason: 'token-superseded' });
      tx.set(ref, { ...scope, ...registration, active: true, createdAt: previous.get('createdAt') || new Date(now()), updatedAt: new Date(now()), expiresAt: new Date(now() + 30 * 86400000), invalidationReason: null });
      tx.set(installationRef, { ...scope, deviceId, installationHash: registration.installationHash, registrationSequence: registration.registrationSequence, updatedAt: new Date(now()) });
    });
    return { deviceId, registrationSequence: registration.registrationSequence, preferences: current, available: true };
  }
  async function enqueue(before, after, jobId, eventId) {
    const kinds = jobEvents(before, after); if (!kinds.length) return { queued: 0 };
    const company = await db.collection('companies').doc(after.companyId).get(); if (!company.exists) return { queued: 0 };
    const recipients = new Map();
    if (after.assignedTo === company.get('ownerId')) recipients.set(company.get('ownerId'), { uid: company.get('ownerId'), companyId: after.companyId, membershipId: null, role: 'owner' });
    if (after.assignedTo && after.assignedTo !== company.get('ownerId')) {
      const member = await db.collection('teamMembers').doc(documentId(after.assignedTo)).get();
      if (member.get('status') === 'active' && member.get('companyId') === after.companyId && member.get('uid')) recipients.set(member.get('uid'), { uid: member.get('uid'), companyId: after.companyId, membershipId: member.id, role: member.get('role') });
    }
    if (kinds.includes('removal')) {
      if (before.assignedTo === company.get('ownerId')) recipients.set(company.get('ownerId'), { uid: company.get('ownerId'), companyId: after.companyId, membershipId: null, role: 'owner' });
      else { const old = await db.collection('teamMembers').doc(documentId(before.assignedTo)).get(); if (old.get('status') === 'active' && old.get('companyId') === after.companyId && old.get('uid') && (!before.assignedToUid || before.assignedToUid === old.get('uid'))) recipients.set(old.get('uid'), { uid: old.get('uid'), companyId: after.companyId, membershipId: old.id, role: old.get('role') }); }
    }
    if (kinds.includes('status') || kinds.includes('reassignment-request')) {
      if (company.get('ownerId')) recipients.set(company.get('ownerId'), { uid: company.get('ownerId'), companyId: after.companyId, membershipId: null, role: 'owner' });
      const managers = await db.collection('teamMembers').where('companyId', '==', after.companyId).get();
      managers.docs.filter(member => member.get('status') === 'active' && ['manager', 'admin'].includes(member.get('role')) && member.get('uid') && member.get('uid') !== company.get('ownerId')).slice(0, 100).forEach(member => recipients.set(member.get('uid'), { uid: member.get('uid'), companyId: after.companyId, membershipId: member.id, role: member.get('role') }));
    }
    let queued = 0;
    for (const scope of recipients.values()) {
      if (!(await currentRecipient(scope, after, kinds.includes('removal') && (scope.membershipId || scope.uid) === before.assignedTo ? 'removal' : undefined))) continue;
      const pref = await preferences.doc(preferenceId(scope)).get(), settings = { ...defaultPreferences, ...(pref.data()?.preferences || {}) };
      if (!settings.enabled) continue;
      const registered = await devices.where('uid', '==', scope.uid).get();
      for (const kind of kinds) {
        const category = ['assignment','removal'].includes(kind) ? 'assignments' : kind === 'reassignment-request' ? 'status' : kind;
        if (!(await currentRecipient(scope, after, kind)) || kind === 'removal' && (scope.membershipId || scope.uid) !== before?.assignedTo || !['status','removal','reassignment-request'].includes(kind) && scope.membershipId !== after.assignedTo && !(scope.role === 'owner' && scope.uid === after.assignedTo) || !settings[category]) continue;
        for (const device of registered.docs.filter(record => record.get('active') === true && scopeMatches(record.data(), scope))) {
          const stableEvent = kind === 'reassignment-request' ? `job-exception:${after.reassignmentRequest.id}` : eventId;
          const id = hash(`${stableEvent}:${kind}:${device.id}`), ref = deliveries.doc(id);
          await db.runTransaction(async tx => { if ((await tx.get(ref)).exists) return; tx.create(ref, { ...scope, deviceId: device.id, registrationSequence: device.get('registrationSequence'), jobId, kind, notificationId: id, eventId: stableEvent, ...(kind === 'reassignment-request' ? { requestId: after.reassignmentRequest.id } : {}), state: 'pending', attempts: 0, dueAt: new Date(now()), createdAt: new Date(now()) }); queued++; });
        }
      }
    }
    return { queued };
  }
  const requestExpo = async (path, body) => {
    const token = accessToken();
    let response;
    try { response = await fetcher(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) }); }
    catch { throw Object.assign(new Error('Expo acceptance could not be confirmed.'), { ambiguousSend: path === 'send' }); }
    if (!response.ok) throw Object.assign(new Error('Expo push request failed.'), { permanent: response.status >= 400 && response.status < 500 && response.status !== 429 });
    let result; try { result = await response.json(); } catch { throw Object.assign(new Error('Expo returned unreadable delivery information.'), { ambiguousSend: path === 'send' }); }
    if (!result.data) throw Object.assign(new Error('Expo returned no delivery information.'), { ambiguousSend: path === 'send' }); return result.data;
  };
  async function finish(ref, state, extra = {}) { await ref.update({ state, ...extra, dueAt: FieldValue.delete(), leaseUntil: FieldValue.delete(), updatedAt: new Date(now()) }); }
  async function invalidateDevice(ref, expected) {
    await db.runTransaction(async tx => { const device = await tx.get(ref); if (scopeMatches(device.data(), expected) && device.get('registrationSequence') === expected.registrationSequence) tx.update(ref, { active: false, invalidationReason: 'DeviceNotRegistered', invalidatedAt: new Date(now()) }); });
  }
  async function processDelivery(ref) {
    let delivery;
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref), value = snap.data();
      if (!value || !['pending', 'retry', 'receipt', 'processing'].includes(value.state) || value.dueAt?.toMillis() > now() || value.leaseUntil?.toMillis() > now()) return;
      delivery = value; tx.update(ref, { state: 'processing', leaseUntil: new Date(now() + 60000), dueAt: new Date(now() + 60000) });
    });
    if (!delivery) return;
    const deviceRef = devices.doc(delivery.deviceId);
    try {
      if (now() - delivery.createdAt.toMillis() > 86400000) { await finish(ref, 'expired'); return; }
      const [device, job, pref] = await Promise.all([deviceRef.get(), db.collection('jobs').doc(delivery.jobId).get(), preferences.doc(preferenceId(delivery)).get()]);
      const settings = { ...defaultPreferences, ...(pref.data()?.preferences || {}) };
      if (!device.exists || device.get('active') !== true || !device.get('expiresAt') || device.get('expiresAt').toMillis() <= now() || !scopeMatches(device.data(), delivery) || !job.exists || !(await currentRecipient(delivery, job.data(), delivery.kind)) || delivery.kind === 'reassignment-request' && (job.get('reassignmentRequest')?.status !== 'pending' || job.get('reassignmentRequest')?.id !== delivery.requestId) || !settings.enabled || !settings[['assignment','removal'].includes(delivery.kind) ? 'assignments' : delivery.kind === 'reassignment-request' ? 'status' : delivery.kind]) { await finish(ref, 'superseded'); return; }
      if (delivery.ticketId) {
        const receipts = await requestExpo('getReceipts', { ids: [delivery.ticketId] }), receipt = receipts[delivery.ticketId];
        if (!receipt) { await ref.update({ state: 'receipt', leaseUntil: FieldValue.delete(), dueAt: new Date(now() + 900000) }); return; }
        if (receipt.status === 'ok') { await finish(ref, 'receipt-ok', { receiptAt: new Date(now()) }); return; }
        if (receipt.details?.error === 'DeviceNotRegistered') await invalidateDevice(deviceRef, delivery);
        if (['MessageRateExceeded', 'ExpoServerError'].includes(receipt.details?.error)) { delivery.ticketId = null; await ref.update({ ticketId: FieldValue.delete() }); throw new Error('Expo reported a temporary delivery failure.'); }
        await finish(ref, 'failed', { errorCode: receipt.details?.error || 'receipt-error' }); return;
      }
      const title = { assignment: 'New job assigned', schedule: 'Job schedule changed', status: 'Important job update', removal: 'Job reassigned', 'reassignment-request': 'Reassignment requested' }[delivery.kind];
      const tickets = await requestExpo('send', [{ to: device.get('token'), title, body: delivery.kind === 'removal' ? 'Open Route Logistics to refresh your assigned schedule.' : 'Open Route Logistics to view the authorized work order.', sound: 'default', channelId: 'work-updates', priority: 'high', ttl: 3600, data: { type: `job-${delivery.kind}`, notificationId: delivery.notificationId, jobId: delivery.jobId, companyId: delivery.companyId, recipientUid: delivery.uid, membershipId: delivery.membershipId || '', role: delivery.role } }]);
      const ticket = Array.isArray(tickets) ? tickets[0] : tickets;
      if (ticket?.status === 'ok' && ticket.id) await ref.update({ state: 'receipt', ticketId: ticket.id, attempts: delivery.attempts + 1, leaseUntil: FieldValue.delete(), dueAt: new Date(now() + 900000) });
      else if (ticket?.details?.error === 'DeviceNotRegistered') { await invalidateDevice(deviceRef, delivery); await finish(ref, 'failed', { errorCode: 'DeviceNotRegistered' }); }
      else if (ticket?.details?.error === 'MessageRateExceeded') throw new Error('Expo rate limited this delivery.');
      else await finish(ref, 'blocked', { errorCode: ticket?.details?.error || 'push-configuration' });
    } catch (failure) {
      const attempts = (delivery.attempts || 0) + 1;
      if (failure.ambiguousSend && !delivery.ticketId) await finish(ref, 'uncertain-send', { errorCode: 'provider-acceptance-unknown', attempts });
      else if (failure.permanent || attempts >= 5) await finish(ref, 'failed', { errorCode: failure.permanent ? 'expo-request-rejected' : 'retry-limit', attempts });
      else await ref.update({ state: delivery.ticketId ? 'receipt' : 'retry', attempts, leaseUntil: FieldValue.delete(), dueAt: new Date(now() + Math.min(3600000, 60000 * 2 ** attempts)) });
    }
  }
  async function drain() {
    const stale = await devices.where('expiresAt', '<=', new Date(now())).limit(100).get();
    await Promise.all(stale.docs.map(device => device.ref.update({ active: false, invalidationReason: device.get('active') === true ? 'registration-expired' : device.get('invalidationReason') || 'registration-expired', invalidatedAt: new Date(now()), registrationExpiredAt: device.get('expiresAt'), expiresAt: FieldValue.delete() })));
    if (!enabled()) return { enabled: false, processed: 0 };
    const due = await deliveries.where('dueAt', '<=', new Date(now())).limit(100).get();
    for (const record of due.docs) await processDelivery(record.ref);
    return { enabled: true, processed: due.size };
  }
  async function revokeMembership(event) {
    const before = event.data?.before?.data?.() || event.data?.data?.(), after = event.data?.after?.data?.();
    if (after && before && ['uid', 'companyId', 'status', 'role'].every(key => after[key] === before[key])) return;
    const registered = await devices.where('membershipId', '==', event.params.id).get();
    const latest = await db.collection('teamMembers').doc(event.params.id).get();
    await Promise.all(registered.docs.filter(device => latest.get('status') !== 'active' || !scopeMatches(device.data(), { uid: latest.get('uid'), companyId: latest.get('companyId'), role: latest.get('role'), membershipId: event.params.id })).map(device => device.ref.update({ active: false, invalidationReason: 'membership-changed', invalidatedAt: new Date(now()) })));
  }
  return { manage, enqueue, drain, processDelivery, revokeMembership, created: event => enqueue(null, event.data?.data(), event.params.jobId, event.id), updated: event => enqueue(event.data.before.data(), event.data.after.data(), event.params.jobId, event.id) };
}
module.exports = { nativePushHandlers, jobEvents, validatedRegistration, scopeMatches, preferenceId, EXPO_PROJECT_ID, defaultPreferences };
