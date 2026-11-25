const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { accessScope, hasCapability, checkJob } = require('./access');
const { documentId, rateLimit } = require('./security');
const { propertyFor } = require('./shared/customerLifecycle');
const { validateAlert, alertsForJob, alertIdentity, acknowledgmentId, propertyIdForJob, activeAlerts } = require('./shared/operationalAlerts');

const digest = value => createHash('sha256').update(value).digest('hex');
const inCompany = (row, scope) => row?.exists && row.get('companyId') === scope.companyId;
const invalid = message => { throw new HttpsError('invalid-argument', message); };
const currentTime = () => new Date().toISOString();

function operationalAlertHandlers(db) {
  async function currentActor(tx, scope) {
    const deleted = await tx.get(db.doc(`rlAccountDeletions/${scope.uid}`));
    if (deleted.exists) throw new HttpsError('permission-denied', 'This account no longer has access.');
    const ref = scope.role === 'owner' ? db.doc(`companies/${scope.companyId}`) : db.doc(`teamMembers/${scope.memberId}`);
    const row = await tx.get(ref);
    if (!row.exists || (scope.role === 'owner' ? row.get('ownerId') !== scope.uid : row.get('uid') !== scope.uid || row.get('companyId') !== scope.companyId || row.get('status') !== 'active' || row.get('role') !== scope.role)) throw new HttpsError('permission-denied', 'Your company access changed. Refresh before continuing.');
  }
  async function targetFor(scope, data, tx) {
    if (data.target === 'property') {
      const customer = await tx.get(db.doc(`customers/${documentId(data.customerId, 'customer')}`));
      if (!inCompany(customer, scope)) throw new HttpsError('permission-denied', 'This customer is unavailable in your company.');
      const propertyId = documentId(data.propertyId, 'service property'), property = propertyFor(customer.data(), propertyId);
      if (!property) throw new HttpsError('failed-precondition', 'This service property is no longer available.');
      return { ref: customer.ref, record: customer, property, propertyId, alerts: property.alerts || [] };
    }
    if (data.target === 'job') {
      const job = await tx.get(db.doc(`jobs/${documentId(data.jobId, 'job')}`));
      if (!inCompany(job, scope)) throw new HttpsError('permission-denied', 'This job is unavailable in your company.');
      return { ref: job.ref, record: job, alerts: job.get('operationalAlerts') || [] };
    }
    invalid('Choose a service property or job.');
  }
  return async request => {
    const scope = await accessScope(db, request), data = request.data || {}, action = data.action;
    await rateLimit(db, 'operational-alerts', scope.uid, 120);
    if (data.companyId !== undefined && data.companyId !== scope.companyId) throw new HttpsError('permission-denied', 'Choose your current company.');
    if (action === 'list' || action === 'save') {
      const capability = data.target === 'property' ? 'customers.manage' : 'jobs.schedule';
      if (!hasCapability(scope.role, capability)) throw new HttpsError('permission-denied', 'Management access is required for operational alerts.');
      if (action === 'list') {
        const target = await targetFor(scope, data, { get: ref => ref.get() });
        let alerts = activeAlerts(target.alerts).concat((target.alerts || []).filter(row => row?.active === false));
        if (data.target === 'job') {
          const job = target.record.data(), propertyId = propertyIdForJob(job);
          const customer = propertyId && job.customerId ? await db.doc(`customers/${documentId(job.customerId, 'customer')}`).get() : null;
          if (customer && !inCompany(customer, scope)) throw new HttpsError('permission-denied', 'The service property is unavailable.');
          alerts = [...alertsForJob({ id: target.record.id, ...job }, customer?.data()).filter(row => row.source === 'property'), ...alerts];
        }
        return { alerts, targetVersion: target.record.get('updatedAt') || null };
      }
      const operationId = documentId(data.operationId, 'operation');
      if (!/^[A-Za-z0-9-]{16,80}$/.test(operationId)) invalid('A stable alert operation is required.');
      let clean;
      try { clean = validateAlert(data.alert); } catch (error) { invalid(error.message); }
      const alertId = data.alertId ? documentId(data.alertId, 'alert') : `alert_${digest(`${scope.uid}:${operationId}`).slice(0,32)}`;
      const fingerprint = digest(JSON.stringify({ target: data.target, customerId: data.customerId || null, propertyId: data.propertyId || null, jobId: data.jobId || null, alertId, clean, expectedVersion: data.expectedVersion ?? null }));
      const operationRef = db.doc(`rlAlertOperations/${digest(`${scope.uid}:${operationId}`)}`);
      return db.runTransaction(async tx => {
        await currentActor(tx, scope);
        const previous = await tx.get(operationRef);
        if (previous.exists) {
          if (previous.get('fingerprint') !== fingerprint || previous.get('companyId') !== scope.companyId) throw new HttpsError('already-exists', 'This alert operation was used for different changes.');
          return previous.get('result');
        }
        const target = await targetFor(scope, data, tx), rows = Array.isArray(target.alerts) ? target.alerts : [];
        if (rows.length >= 20 && !rows.some(row => row.id === alertId)) throw new HttpsError('resource-exhausted', 'This location has reached its 20-alert limit. Edit an existing alert.');
        const old = rows.find(row => row.id === alertId);
        if (data.alertId && !old) throw new HttpsError('failed-precondition', 'This alert changed. Refresh before editing.');
        if (old && (!Number.isInteger(data.expectedVersion) || old.version !== data.expectedVersion)) throw new HttpsError('aborted', 'This alert changed. Refresh before saving.');
        if (data.target === 'job' && ['completed', 'cancelled', 'canceled'].includes(target.record.get('status'))) throw new HttpsError('failed-precondition', 'Completed or cancelled visits retain their historical alerts.');
        const now = currentTime(), next = { ...clean, id: alertId, version: (old?.version || 0) + 1, createdAt: old?.createdAt || now, createdBy: old?.createdBy || scope.uid, updatedAt: now, updatedBy: scope.uid };
        const alerts = [...rows.filter(row => row.id !== alertId), next];
        if (data.target === 'job') tx.update(target.ref, { operationalAlerts: alerts, updatedAt: now });
        else {
          const property = { ...target.property, alerts, updatedAt: now };
          const stored = Array.isArray(target.record.get('serviceProperties')) ? target.record.get('serviceProperties') : [];
          tx.update(target.ref, { serviceProperties: [...stored.filter(row => row.id !== target.propertyId), property], updatedAt: now });
        }
        const result = { alert: next, targetVersion: now };
        tx.create(operationRef, { companyId: scope.companyId, actorId: scope.uid, fingerprint, result, createdAt: now });
        tx.create(db.collection('rlAudit').doc(), { action: old ? 'operationalAlert.revise' : 'operationalAlert.create', companyId: scope.companyId, actorId: scope.uid, target: data.target, customerId: data.customerId || null, propertyId: data.propertyId || null, jobId: data.jobId || null, alertId, fromVersion: old?.version || null, toVersion: next.version, createdAt: now });
        return result;
      });
    }
    if (action === 'status' || action === 'acknowledge') {
      if (!hasCapability(scope.role, 'jobs.work')) throw new HttpsError('permission-denied', 'Assigned work access is required.');
      const jobId = documentId(data.jobId, 'job');
      const jobRef = db.doc(`jobs/${jobId}`);
      const load = async tx => {
        const job = await tx.get(jobRef); checkJob(scope, job.data());
        if (scope.role === 'technician' && job.get('assignedToUid') && job.get('assignedToUid') !== scope.uid) throw new HttpsError('permission-denied', 'This visit is no longer assigned to your account.');
        const customer = job.get('customerId') && propertyIdForJob(job.data()) ? await tx.get(db.doc(`customers/${documentId(job.get('customerId'), 'customer')}`)) : null;
        if (customer && !inCompany(customer, scope)) throw new HttpsError('permission-denied', 'The service property is unavailable.');
        return { job, alerts: alertsForJob({ id: jobId, ...job.data() }, customer?.data()) };
      };
      if (action === 'status') {
        const current = await load({ get: ref => ref.get() });
        const critical = current.alerts.filter(row => row.severity === 'critical');
        const refs = critical.map(row => db.doc(`rlJobAlertAcknowledgments/${acknowledgmentId(scope.companyId, jobId, scope.uid, row)}`));
        const acknowledgments = refs.length ? await db.getAll(...refs) : [];
        return { alerts: current.alerts, acknowledgments: acknowledgments.filter(row => row.exists).map(row => ({ alertKey: row.get('alertKey'), occurredAt: row.get('occurredAt'), receivedAt: row.get('receivedAt') })) };
      }
      const operationId = documentId(data.operationId, 'operation');
      if (!/^[A-Za-z0-9-]{16,80}$/.test(operationId)) invalid('A stable acknowledgment operation is required.');
      const alertKey = String(data.alertKey || ''), occurredAt = String(data.occurredAt || '');
      if (!Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > Date.now() + 120000) invalid('A valid original acknowledgment time is required.');
      return db.runTransaction(async tx => {
        await currentActor(tx, scope);
        const current = await load(tx), alert = current.alerts.find(row => row.severity === 'critical' && alertIdentity(row) === alertKey);
        if (!alert) throw new HttpsError('failed-precondition', 'This critical alert changed or is no longer active. Refresh the work order before continuing.');
        const ref = db.doc(`rlJobAlertAcknowledgments/${acknowledgmentId(scope.companyId, jobId, scope.uid, alert)}`);
        const previous = await tx.get(ref);
        if (previous.exists) {
          if (previous.get('operationId') !== operationId && previous.get('alertKey') !== alertKey) throw new HttpsError('already-exists', 'A different acknowledgment already exists.');
          return { status: 'synced', alertKey, occurredAt: previous.get('occurredAt'), receivedAt: previous.get('receivedAt') };
        }
        const receivedAt = currentTime();
        tx.create(ref, { companyId: scope.companyId, customerId: current.job.get('customerId') || null, propertyId: propertyIdForJob(current.job.data()), jobId, userId: scope.uid, memberId: scope.memberId || scope.uid, alertKey, alertId: alert.id, alertVersion: alert.version, source: alert.source, operationId, occurredAt, receivedAt });
        tx.create(db.collection('rlAudit').doc(), { action: 'operationalAlert.acknowledge', companyId: scope.companyId, actorId: scope.uid, jobId, alertKey, operationId, occurredAt, createdAt: receivedAt });
        return { status: 'synced', alertKey, occurredAt, receivedAt };
      });
    }
    invalid('Choose a supported alert action.');
  };
}
module.exports = { operationalAlertHandlers };
