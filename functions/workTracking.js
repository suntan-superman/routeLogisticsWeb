const {
  randomBytes
} = require('node:crypto');
const {
  HttpsError
} = require('firebase-functions/v2/https');
const {
  hash,
  documentId,
  requireAuth,
  requireStaff,
  requireCompanyOwner,
  rateLimit
} = require('./security');
const {
  coordinates
} = require('./routes');
const { FieldValue } = require('firebase-admin/firestore');
const { availabilityRef, availabilityView, assertAvailable } = require('./staffAvailability');
const { servicePropertySite } = require('./serviceAreaWorkflows');
const ms = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
const iso = value => Number.isFinite(ms(value)) ? new Date(ms(value)).toISOString() : null;
const compatibleJobState = job => {
  const data = typeof job?.data === 'function' ? job.data() : job || {}, address = data.address && typeof data.address === 'object' ? data.address : {};
  const value = key => data[key] ?? address[key] ?? null;
  return {
    customerId: data.customerId ?? null,
    serviceType: data.serviceType ?? data.serviceName ?? null,
    serviceCategory: data.serviceCategory ?? null,
    servicePropertyId: data.servicePropertyId ?? null,
    date: data.date ?? null,
    time: data.time ?? null,
    windowStart: data.windowStart ?? null,
    windowEnd: data.windowEnd ?? null,
    duration: data.estimatedDuration ?? data.duration ?? null,
    address: typeof data.address === 'string' ? data.address : address.line1 ?? address.street ?? null,
    city: value('city'),
    state: value('state'),
    zipCode: data.zipCode ?? data.postalCode ?? address.zipCode ?? address.postalCode ?? null,
    appointmentKind: data.appointmentKind ?? null,
  };
};
function policyFor(company) {
  const get = key => typeof company.get === 'function' ? company.get(key) : company[key];
  const intervalMinutes = [1, 3, 5].includes(get('rlLocationIntervalMinutes')) ? get('rlLocationIntervalMinutes') : 3;
  const hours = get('rlLocationRetentionHours');
  return {
    intervalMinutes,
    retentionHours: Number.isInteger(hours) && hours >= 1 && hours <= 168 ? hours : 24,
    maxShiftHours: 12,
    freshAfterSeconds: intervalMinutes * 60 + 120
  };
}
const active = (shift, now) => shift?.status === 'on-duty' && shift.trackingConsent === true && ms(shift.expiresAt) > now;
function shiftView(shift, now) {
  if (!shift) return null;
  const expired = shift.status === 'on-duty' && !active(shift, now);
  return {
    id: shift.id,
    status: active(shift, now) ? 'on-duty' : 'off-duty',
    startedAt: iso(shift.startedAt),
    endedAt: expired ? iso(shift.expiresAt) : iso(shift.endedAt),
    expiresAt: iso(shift.expiresAt),
    trackingConsent: shift.trackingConsent === true,
    ...(expired ? {
      endReason: 'expired'
    } : shift.endReason ? {
      endReason: shift.endReason
    } : {})
  };
}
function fail(reason, message) {
  throw new HttpsError('failed-precondition', message, {
    reason
  });
}
function ownShift(shift, staff, id, now) {
  if (!shift || shift.id !== id || shift.companyId !== staff.company.id || shift.userId !== staff.uid || shift.memberId !== (staff.memberId || staff.uid)) fail('shift-ended', 'This work shift is no longer active. Start a new shift explicitly.');
  if (!active(shift, now)) fail(shift.status === 'on-duty' ? 'shift-expired' : 'shift-ended', 'Your work shift has ended. Start a new shift explicitly before sharing another location.');
}
function captureTime(value, now, start, hours, skew = 120000) {
  const at = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
  if (!Number.isFinite(at) || at > now + skew || at < start - skew || at < now - hours * 3600000) throw new HttpsError('invalid-argument', 'The location capture time is invalid or outside this work shift.', {
    reason: 'capture-time-invalid'
  });
  return at;
}
function distanceMeters(a, b) {
  const rad = v => v * Math.PI / 180,
    lat = rad(b.lat - a.lat),
    lng = rad(b.lng - a.lng);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(lng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
const jobPoint = job => {
  const property = servicePropertySite(job);
  if (property) return job?.serviceProperty?.validated === false ? null : coordinates(property);
  return coordinates(job) || coordinates({ latitude: job?.location?.lat, longitude: job?.location?.lng });
};
function validFix(data) {
  return typeof data?.latitude === 'number' && typeof data?.longitude === 'number' && typeof data?.accuracy === 'number'
    && Number.isFinite(data.accuracy) && data.accuracy >= 0 && data.accuracy <= 5000 && coordinates(data);
}
const transition = (previous, distance, accuracy) => accuracy > 50 ? null : distance + accuracy <= 100 && previous?.inside !== true ? 'arrived' : distance - accuracy >= 200 && previous?.inside === true ? 'departed' : null;
function eventView(row) {
  const data = typeof row.data === 'function' ? row.data() : row;
  return {
    id: row.id || data.id,
    jobId: data.jobId,
    companyId: data.companyId,
    userId: data.userId,
    memberId: data.memberId,
    type: data.type,
    source: data.source,
    recordedAt: iso(data.recordedAt),
    occurredAt: iso(data.occurredAt || data.capturedAt || data.recordedAt),
    capturedAt: iso(data.capturedAt),
    note: data.note || '',
    evidenceOnly: true,
    verifiedAccess: false,
    ...(Number.isFinite(data.accuracy) ? {
      accuracy: data.accuracy
    } : {}),
    ...(Number.isFinite(data.distanceMeters) ? {
      distanceMeters: data.distanceMeters
    } : {})
  };
}
function visitSummary(previous, type, occurredAt) {
  const fields = { arrived:'arrivedAt', departed:'departedAt', 'access-blocked':'accessBlockedAt' }, next = { ...(previous || {}) }, at=Date.parse(occurredAt);
  const field=fields[type];
  if (field && (!Number.isFinite(Date.parse(next[field])) || at>Date.parse(next[field]))) next[field]=occurredAt;
  if (!Number.isFinite(Date.parse(next.lastEventAt)) || at>=Date.parse(next.lastEventAt)) { next.lastEventAt=occurredAt; next.lastEventType=type; }
  return next;
}
function checkJob(job, staff, assigned = false) {
  if (!job.exists || job.get('companyId') !== staff.company.id || (assigned || staff.role === 'technician') && job.get('assignedTo') !== (staff.memberId || staff.uid)) throw new HttpsError('permission-denied', 'This job is no longer assigned to your company workspace.');
}
function workTrackingHandlers(db, legacy, {
  now = () => Date.now()
} = {}) {
  const refs = staff => {
    const id = hash(`${staff.company.id}:${staff.uid}`);
    return {
      location: db.doc(`rlLocations/${id}`),
      shift: db.doc(`rlWorkShifts/${id}`)
    };
  };
  const historyEvent = (staff, shiftId, sessionId, event, occurredAt, reason = null) => ({
    id: hash(`${staff.company.id}:${staff.memberId || staff.uid}:${shiftId}:${sessionId || ''}:${event}`),
    companyId: staff.company.id,
    userId: staff.uid,
    memberId: staff.memberId || staff.uid,
    shiftId,
    ...(sessionId ? { sessionId } : {}),
    event,
    ...(reason ? { reason } : {}),
    occurredAt: new Date(occurredAt),
    expiresAt: new Date(occurredAt + policyFor(staff.company).retentionHours * 3600000)
  });
  const staffFor = request => {
    const {
      token
    } = requireAuth(request, true);
    return requireStaff(db, request, token.companyId);
  };
  async function currentStaff(tx, staff) {
    const [company, deleted] = await Promise.all([tx.get(staff.company.ref), tx.get(db.doc(`rlAccountDeletions/${staff.uid}`))]);
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt') || deleted.exists) throw new HttpsError('permission-denied', 'Your work access changed. Refresh your workspace.');
    if (staff.role === 'owner') {
      if (company.get('ownerId') !== staff.uid) throw new HttpsError('permission-denied', 'Company ownership changed. Refresh your workspace.');
    } else {
      const member = await tx.get(db.doc(`teamMembers/${documentId(staff.memberId)}`));
      if (member.get('status') !== 'active' || member.get('companyId') !== company.id || member.get('uid') !== staff.uid || member.get('role') !== staff.role) throw new HttpsError('permission-denied', 'Your work access changed. Refresh your workspace.');
    }
  }
  async function evidence(staff, shift, point, accuracy, at, jobId) {
    const policy = policyFor(staff.company),
      time = now();
    if (accuracy > 50 || time - at > policy.freshAfterSeconds * 1000) return {
      recorded: 0,
      coverageLimited: false
    };
    let jobs,
      limited = false;
    if (jobId) jobs = [await db.doc(`jobs/${documentId(jobId, 'job')}`).get()];else {
      let date, hasTimeZone = false;
      try {
        date = new Intl.DateTimeFormat('en-CA', {
          timeZone: staff.company.get('timeZone') || 'UTC',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date(at));
        hasTimeZone = !!staff.company.get('timeZone');
      } catch {
        date = new Date(at).toISOString().slice(0, 10);
      }
      const dates = new Set([date]);
      // Legacy companies without a time zone may be a calendar day behind UTC.
      // Current in-progress work is eligible across dates; other open work is
      // bounded to the sample day (and its adjacent UTC days when unspecified).
      if (!hasTimeZone) for (const offset of [-1, 1]) dates.add(new Date(at + offset * 86400000).toISOString().slice(0, 10));
      const rows = await db.collection('jobs').where('companyId', '==', staff.company.id).where('assignedTo', '==', staff.memberId || staff.uid).limit(101).get();
      jobs = rows.docs.slice(0, 100).filter(row => row.get('status') === 'in-progress' || dates.has(row.get('date')));
      limited = rows.size > 100;
    }
    let recorded = 0;
    for (const candidate of jobs) {
      if (!candidate.exists || candidate.get('companyId') !== staff.company.id || candidate.get('assignedTo') !== (staff.memberId || staff.uid) || !['scheduled', 'en-route', 'in-progress'].includes(candidate.get('status'))) continue;
      const stateRef = db.doc(`rlJobVisitStates/${hash(`${staff.company.id}:${staff.uid}:${shift.id}:${candidate.id}`)}`);
      recorded += await db.runTransaction(async tx => {
        const [job, state, current] = await Promise.all([tx.get(candidate.ref), tx.get(stateRef), tx.get(refs(staff).shift)]);
        if (!active(current.data(), now()) || current.get('id') !== shift.id || !job.exists || job.get('companyId') !== staff.company.id || job.get('assignedTo') !== (staff.memberId || staff.uid) || !['scheduled', 'en-route', 'in-progress'].includes(job.get('status')) || ms(state.get('capturedAt')) >= at) return 0;
        if (staff.memberId) {
          const member = await tx.get(db.doc(`teamMembers/${staff.memberId}`));
          if (member.get('status') !== 'active' || member.get('uid') !== staff.uid || member.get('companyId') !== staff.company.id || member.get('role') !== staff.role) return 0;
        }
        let target = jobPoint(job.data());
        if (!target && !servicePropertySite(job.data()) && job.get('customerId')) {
          const customer = await tx.get(db.doc(`customers/${documentId(job.get('customerId'), 'customer')}`));
          if (customer.get('companyId') === staff.company.id) target = jobPoint(customer.data());
        }
        if (!target) return 0;
        const distance = distanceMeters(point, target),
          type = transition(state.data(), distance, accuracy);
        tx.set(stateRef, {
          companyId: staff.company.id,
          userId: staff.uid,
          shiftId: shift.id,
          jobId: job.id,
          inside: type === 'arrived' ? true : type === 'departed' ? false : state.get('inside') === true,
          capturedAt: new Date(at),
          expiresAt: new Date(at + policy.retentionHours * 3600000)
        });
        if (!type) return 0;
        const id = hash(`${staff.company.id}:${staff.uid}:${shift.id}:${job.id}:${at}:${type}`);
        tx.create(db.doc(`rlJobVisits/${id}`), {
          companyId: staff.company.id,
          userId: staff.uid,
          memberId: staff.memberId || staff.uid,
          jobId: job.id,
          shiftId: shift.id,
          type,
          source: 'gps-evidence',
          recordedAt: new Date(time),
          capturedAt: new Date(at),
          accuracy,
          distanceMeters: Math.round(distance),
          note: 'GPS proximity evidence only. This does not verify property access or work performed.',
          evidenceOnly: true,
          verifiedAccess: false
        });
        // A read-only operational summary does not advance the work revision;
        // automatic GPS observations must not invalidate unrelated work drafts.
        tx.update(job.ref,{visitEvidence:visitSummary(job.get('visitEvidence'),type,new Date(at).toISOString())});
        return 1;
      });
    }
    return {
      recorded,
      coverageLimited: limited
    };
  }
  return {
    ...legacy,
    shift: async request => {
      const staff = await staffFor(request),
        action = request.data?.action || 'status',
        policy = policyFor(staff.company),
        time = now();
      if (!['status', 'start', 'end'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a valid shift action.');
      if (action === 'start' && request.data.trackingConsent !== true) fail('consent-required', 'Confirm work location sharing before starting your shift.');
      if (action === 'end') documentId(request.data?.shiftId, 'shift');
      await rateLimit(db, 'work-shift', staff.uid, 30);
      const target = refs(staff),
        newId = randomBytes(24).toString('hex');
      const shift = await db.runTransaction(async tx => {
        await currentStaff(tx, staff);
        const [saved, location, availability] = await Promise.all([tx.get(target.shift), tx.get(target.location), tx.get(availabilityRef(db, staff.company.id, staff.uid))]);
        const unavailable = availabilityView(availability.data(), time).state === 'unavailable';
        if (action === 'start') assertAvailable(availability.data(), time);
        let data = saved.exists ? saved.data() : null;
        if (action === 'end' && request.data.shiftId && data?.id !== request.data.shiftId) fail('shift-mismatch', 'This is a different work shift. Refresh before ending it.');
        const membershipChanged = data && data.memberId !== (staff.memberId || staff.uid);
        if (data?.status === 'on-duty' && (!active(data, time) || action === 'end' || membershipChanged || unavailable)) {
          const expired = !active(data, time);
          data = {
            ...data,
            status: 'off-duty',
            endedAt: expired ? new Date(ms(data.expiresAt)) : new Date(time),
            endReason: expired ? 'expired' : membershipChanged ? 'membership-changed' : unavailable ? 'supervisor-unavailable' : 'user-ended'
          };
          tx.set(target.shift, data);
          tx.set(db.doc(`rlWorkShiftEvents/${data.id}-end`), {
            ...data,
            event: 'end',
            recordedAt: new Date(time)
          });
          tx.set(db.doc(`rlLocationHistoryEvents/${historyEvent(staff, data.id, null, 'shift-ended', time, data.endReason).id}`), historyEvent(staff, data.id, null, 'shift-ended', time, data.endReason));
          if (location.exists && location.get('shiftId') === data.id) tx.update(target.location, {
            sharing: false,
            stoppedAt: new Date(time)
          });
        }
        if (action === 'start' && !active(data, time)) {
          data = {
            id: newId,
            companyId: staff.company.id,
            userId: staff.uid,
            memberId: staff.memberId || staff.uid,
            role: staff.role,
            status: 'on-duty',
            trackingConsent: true,
            startedAt: new Date(time),
            endedAt: null,
            expiresAt: new Date(time + 12 * 3600000)
          };
          tx.set(target.shift, data);
          tx.create(db.doc(`rlWorkShiftEvents/${newId}-start`), {
            ...data,
            event: 'start',
            recordedAt: new Date(time)
          });
          tx.set(db.doc(`rlLocationHistoryEvents/${historyEvent(staff, newId, null, 'shift-started', time).id}`), historyEvent(staff, newId, null, 'shift-started', time));
        }
        return shiftView(data, time);
      });
      return {
        shift,
        availability: availabilityView((await availabilityRef(db, staff.company.id, staff.uid).get()).data(), time),
        policy
      };
    },
    update: async request => {
      if (request.data?.action === 'start' && !request.data.shiftId) return legacy.update(request);
      const staff = await staffFor(request),
        policy = policyFor(staff.company),
        time = now(),
        target = refs(staff),
        action = request.data?.action;
      // Existing job-scoped apps keep their original active-job and five-minute
      // session requirements. An omitted shift never enables general tracking.
      if (action === 'position') {
        const existing = await target.location.get();
        if (existing.exists && !existing.get('shiftId')) return legacy.update(request);
      }
      await rateLimit(db, 'location', staff.uid, 20);
      if (action === 'stop') {
        await db.runTransaction(async tx => {
          const current = await tx.get(target.location);
          if (current.exists && current.get('sessionId') === request.data.sessionId) {
            tx.update(target.location, { sharing: false, stoppedAt: new Date(time) });
            const event = historyEvent(staff, current.get('shiftId') || null, current.get('sessionId'), 'sharing-stopped', time, ['permission-lost', 'authorization-lost', 'client-stopped', 'shift-ended', 'shift-expired'].includes(request.data.reason) ? request.data.reason : 'client-stopped');
            tx.set(db.doc(`rlLocationHistoryEvents/${event.id}`), event);
          }
        });
        return {
          sharing: false,
          policy
        };
      }
      if (action === 'start') return db.runTransaction(async tx => {
        await currentStaff(tx, staff);
        const [saved, location, availability] = await Promise.all([tx.get(target.shift), tx.get(target.location), tx.get(availabilityRef(db, staff.company.id, staff.uid))]),
          shift = saved.data();
        assertAvailable(availability.data(), time);
        ownShift(shift, staff, request.data.shiftId, time);
        const sessionId = location.get('sharing') && location.get('shiftId') === shift.id ? location.get('sessionId') : randomBytes(24).toString('hex');
        const event = historyEvent(staff, shift.id, sessionId, 'sharing-started', time);
        tx.set(target.location, {
          companyId: staff.company.id,
          userId: staff.uid,
          memberId: staff.memberId || staff.uid,
          shiftId: shift.id,
          sessionId,
          sharing: true,
          startedAt: new Date(time),
          updatedAt: location.get('updatedAt') || new Date(time),
          sessionExpiresAt: shift.expiresAt,
          expiresAt: new Date(time + policy.retentionHours * 3600000)
        }, {
          merge: true
        });
        tx.set(db.doc(`rlLocationHistoryEvents/${event.id}`), event);
        return {
          sessionId,
          sharing: true,
          shift: shiftView(shift, time),
          policy,
          retentionHours: policy.retentionHours
        };
      });
      if (action !== 'position') throw new HttpsError('invalid-argument', 'Invalid location action.');
      const point = validFix(request.data), accuracy = request.data.accuracy;
      if (!point) throw new HttpsError('invalid-argument', 'A numeric location fix and known numeric accuracy are required.');
      let shift, at;
      const result = await db.runTransaction(async tx => {
        await currentStaff(tx, staff);
        const [saved, current, availability] = await Promise.all([tx.get(target.shift), tx.get(target.location), tx.get(availabilityRef(db, staff.company.id, staff.uid))]);
        assertAvailable(availability.data(), time);
        if (!current.exists || !current.get('sharing')) fail('session-ended', 'Location sharing has stopped. Start it again during your shift.');
        if (!request.data.sessionId || current.get('sessionId') !== request.data.sessionId) fail('session-mismatch', 'This location session has been replaced. Refresh your shift.');
        shift = saved.data();
        ownShift(shift, staff, current.get('shiftId'), time);
        at = captureTime(request.data.capturedAt, time, ms(shift.startedAt), policy.retentionHours);
        const sampleId = hash(`${staff.company.id}:${staff.uid}:${shift.id}:${at}:${point.lat}:${point.lng}:${accuracy}`);
        const sampleRef = db.doc(`rlLocationHistory/${sampleId}`), savedSample = await tx.get(sampleRef);
        const historySample = {
          companyId: staff.company.id,
          userId: staff.uid,
          memberId: staff.memberId || staff.uid,
          shiftId: shift.id,
          sessionId: current.get('sessionId'),
          lat: point.lat,
          lng: point.lng,
          accuracy,
          capturedAt: new Date(at),
          receivedAt: new Date(time),
          expiresAt: new Date(at + policy.retentionHours * 3600000)
        };
        if (!savedSample.exists) tx.create(sampleRef, historySample);
        const previous = ms(current.get('capturedAt'));
        if (Number.isFinite(previous) && at <= previous) {
          const duplicate = at === previous && current.get('lat') === point.lat && current.get('lng') === point.lng && current.get('accuracy') === accuracy;
          return {
            sharing: true,
            accepted: duplicate,
            duplicate,
            ...(duplicate ? {} : {
              reason: 'out-of-order'
            }),
            historyRecorded: !savedSample.exists,
            shift: shiftView(shift, time),
            policy
          };
        }
        tx.update(target.location, {
          ...point,
          accuracy,
          capturedAt: new Date(at),
          updatedAt: new Date(at),
          receivedAt: new Date(time),
          positionShiftId: shift.id,
          sessionExpiresAt: shift.expiresAt,
          expiresAt: new Date(at + policy.retentionHours * 3600000)
        });
        return {
          sharing: true,
          accepted: true,
          duplicate: false,
          historyRecorded: !savedSample.exists,
          shift: shiftView(shift, time),
          policy
        };
      });
      if (result.accepted) try {
        result.visitEvidence = await evidence(staff, shift, point, accuracy, at, request.data.jobId);
      } catch (error) {
        result.visitEvidence = {
          recorded: 0,
          coverageLimited: true,
          errorCode: error.code || 'internal'
        };
      }
      return result;
    },
    historyMembers: async request => {
      const staff = await staffFor(request);
      if (!['owner', 'admin', 'manager'].includes(staff.role)) throw new HttpsError('permission-denied', 'Management access is required to view technician location history.');
      await rateLimit(db, 'location-history-members', staff.uid, 20);
      const members = await db.collection('teamMembers').where('companyId', '==', staff.company.id).limit(501).get();
      const technicians = members.docs.filter(row => row.get('role') === 'technician' && row.get('uid') && ['active', 'inactive', 'removed'].includes(row.get('status')))
        .map(row => ({ memberId: row.id, name: row.get('name') || row.get('email') || 'Technician', status: row.get('status') }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { technicians, truncated: members.size > 500 };
    },
    history: async request => {
      const staff = await staffFor(request);
      if (!['owner', 'admin', 'manager'].includes(staff.role)) throw new HttpsError('permission-denied', 'Management access is required to view technician location history.');
      await rateLimit(db, 'location-history', staff.uid, 20);
      const currentTime = now();
      const memberId = documentId(request.data?.memberId, 'technician');
      const member = await db.collection('teamMembers').doc(memberId).get();
      if (!member.exists || member.get('companyId') !== staff.company.id || member.get('role') !== 'technician' || !member.get('uid') || !['active', 'inactive', 'removed'].includes(member.get('status'))) throw new HttpsError('permission-denied', 'This technician is not available in your company history.');
      const startAt = Date.parse(request.data?.startAt), endAt = Date.parse(request.data?.endAt), limit = request.data?.limit ?? 200;
      if (!Number.isFinite(startAt) || !Number.isFinite(endAt) || endAt <= startAt || endAt - startAt > 8 * 86400000 || endAt > currentTime + 120000 || !Number.isInteger(limit) || limit < 1 || limit > 200) throw new HttpsError('invalid-argument', 'Choose a valid history range of seven days or less and a page size up to 200.');
      const policy = policyFor(staff.company);
      if (startAt < currentTime - policy.retentionHours * 3600000) throw new HttpsError('failed-precondition', 'The selected start is outside this company’s location retention window.');
      let cursor = null;
      if (request.data?.cursor) {
        const cursorId = documentId(request.data.cursor, 'history cursor');
        cursor = await db.collection('rlLocationHistory').doc(cursorId).get();
        if (!cursor.exists || cursor.get('companyId') !== staff.company.id || cursor.get('memberId') !== memberId || ms(cursor.get('capturedAt')) < startAt || ms(cursor.get('capturedAt')) >= endAt) throw new HttpsError('invalid-argument', 'The history page cursor is invalid. Restart the query.');
      }
      let query = db.collection('rlLocationHistory').where('companyId', '==', staff.company.id).where('memberId', '==', memberId)
        .where('capturedAt', '>=', new Date(startAt)).where('capturedAt', '<', new Date(endAt)).orderBy('capturedAt', 'asc').limit(limit + 1);
      if (cursor) query = query.startAfter(cursor);
      const [rows, events] = await Promise.all([
        query.get(),
        db.collection('rlLocationHistoryEvents').where('companyId', '==', staff.company.id).where('memberId', '==', memberId)
          .where('occurredAt', '>=', new Date(startAt)).where('occurredAt', '<', new Date(endAt)).orderBy('occurredAt', 'asc').limit(201).get()
      ]);
      const documents = rows.docs.slice(0, limit), last = documents.at(-1);
      return {
        points: documents.map(row => ({ id: row.id, lat: row.get('lat'), lng: row.get('lng'), accuracy: row.get('accuracy'), capturedAt: iso(row.get('capturedAt')) })),
        events: events.docs.map(row => ({ id: row.id, event: row.get('event'), reason: row.get('reason') || null, occurredAt: iso(row.get('occurredAt')) })),
        nextCursor: rows.size > limit && last ? last.id : null,
        hasMore: rows.size > limit,
        eventsTruncated: events.size > 200,
        retentionHours: policy.retentionHours,
        intervalMinutes: policy.intervalMinutes,
        timeZone: staff.company.get('timeZone') || 'UTC',
        technician: { memberId, name: member.get('name') || member.get('email') || 'Technician', status: member.get('status') }
      };
    },
    list: async request => {
      const staff = await staffFor(request);
      if (staff.role === 'technician') throw new HttpsError('permission-denied', 'Manager access is required to view team locations.');
      await rateLimit(db, 'location-read', staff.uid, 30);
      const [rows, members, shifts, availabilityRows] = await Promise.all(['rlLocations', 'teamMembers', 'rlWorkShifts', 'rlStaffAvailability'].map(name => db.collection(name).where('companyId', '==', staff.company.id).limit(501).get()));
      const policy = policyFor(staff.company),
        time = now(),
        ownerId = staff.company.get('ownerId'),
        locations = [];
      const team = [{
        memberId: ownerId,
        userId: ownerId,
        name: 'Company owner',
        role: 'owner'
      }, ...members.docs.slice(0, 500).filter(row => row.get('status') === 'active' && row.get('uid') && ['admin', 'manager', 'technician'].includes(row.get('role')) && row.get('uid') !== ownerId).map(row => ({
        memberId: row.id,
        userId: row.get('uid'),
        name: row.get('name') || row.get('email') || 'Team member',
        role: row.get('role')
      }))];
      const deleted = new Set((await db.getAll(...team.map(member => db.doc(`rlAccountDeletions/${documentId(member.userId)}`)))).filter(row => row.exists).map(row => row.id));
      const roster = team.filter(member => !deleted.has(member.userId)).map(member => {
        const availability = availabilityView(availabilityRows.docs.find(row => row.get('userId') === member.userId)?.data(), time);
        const shift = shifts.docs.find(row => row.get('userId') === member.userId && row.get('memberId') === member.memberId)?.data(),
          onDuty = active(shift, time) && availability.state !== 'unavailable';
        const row = rows.docs.find(row => row.get('userId') === member.userId && row.get('memberId') === member.memberId),
          data = row?.data(),
          at = ms(data?.capturedAt || data?.updatedAt);
        const retained = data && ms(data.expiresAt) > time && at + policy.retentionHours * 3600000 > time && Number.isFinite(data.lat) && Number.isFinite(data.lng);
        const matching = data?.shiftId ? onDuty && data.shiftId === shift.id && data.positionShiftId === shift.id : !!data;
        const stale = !matching || !Number.isFinite(at) || time - at > (data?.shiftId ? policy.freshAfterSeconds : 180) * 1000 || ms(data?.sessionExpiresAt) <= time;
        const trackingState = availability.state === 'unavailable' || !onDuty && data?.shiftId ? 'off-duty' : !data?.sharing ? 'sharing-disabled' : !retained || onDuty && data.positionShiftId !== shift.id ? 'waiting-for-fix' : stale ? 'stale' : 'live';
        const location = retained ? {
          id: row.id,
          ...member,
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          updatedAt: new Date(at).toISOString(),
          capturedAt: new Date(at).toISOString(),
          receivedAt: iso(data.receivedAt),
          sharing: data.sharing === true && matching && !stale && availability.state !== 'unavailable',
          stale,
          state: !data.sharing || data.shiftId && !onDuty || availability.state === 'unavailable' ? 'sharing-disabled' : stale ? 'stale' : 'live',
          dutyStatus: onDuty ? 'on-duty' : 'off-duty',
          freshAfterSeconds: policy.freshAfterSeconds
        } : null;
        if (location) locations.push(location);
        return {
          ...member,
          availability,
          dutyStatus: onDuty ? 'on-duty' : 'off-duty',
          onDuty,
          shiftStartedAt: iso(shift?.startedAt),
          shiftEndedAt: shiftView(shift, time)?.endedAt || null,
          shiftExpiresAt: iso(shift?.expiresAt),
          trackingState,
          location
        };
      });
      return {
        locations,
        roster,
        policy,
        retentionHours: policy.retentionHours,
        freshAfterSeconds: policy.freshAfterSeconds,
        truncated: rows.size > 500 || members.size > 500 || shifts.size > 500 || availabilityRows.size > 500
      };
    },
    policy: async request => {
      const company = await requireCompanyOwner(db, request, request.data?.companyId),
        intervalMinutes = request.data?.intervalMinutes;
      if (![1, 3, 5].includes(intervalMinutes)) throw new HttpsError('invalid-argument', 'Choose a location interval of 1, 3 or 5 minutes.');
      await rateLimit(db, 'location-policy', request.auth.uid, 10);
      await company.ref.update({
        rlLocationIntervalMinutes: intervalMinutes
      });
      return {
        policy: {
          ...policyFor(company),
          intervalMinutes,
          freshAfterSeconds: intervalMinutes * 60 + 120
        }
      };
    },
    visit: async request => {
      const staff = await staffFor(request),
        jobId = documentId(request.data?.jobId, 'job'),
        action = request.data?.action;
      await rateLimit(db, 'job-visit', staff.uid, 30);
      const jobRef = db.doc(`jobs/${jobId}`);
      if (action === 'list') {
        checkJob(await jobRef.get(), staff);
        const rows = await db.collection('rlJobVisits').where('companyId', '==', staff.company.id).where('jobId', '==', jobId).orderBy('recordedAt', 'desc').limit(101).get();
        return {
          events: rows.docs.slice(0, 100).map(eventView),
          hasMore: rows.size > 100
        };
      }
      if (action !== 'record') throw new HttpsError('invalid-argument', 'Choose a valid visit action.');
      const type = request.data.type,
        operationId = documentId(request.data.operationId, 'operation'),
        note = typeof request.data.note === 'string' ? request.data.note.trim() : '';
      if (!['arrived', 'departed', 'access-blocked'].includes(type) || operationId.length > 100 || note.length > 1000 || type === 'access-blocked' && !note) throw new HttpsError('invalid-argument', 'Choose a visit event and include a reason when access is blocked (up to 1000 characters).');
      const gps = request.data.latitude != null || request.data.longitude != null || request.data.accuracy != null;
      const durable = request.data.evidenceVersion === 1;
      if (request.data.evidenceVersion != null && !durable) throw new HttpsError('invalid-argument','Unsupported visit evidence version.');
      if (request.data.allowCompatibleRevision != null && typeof request.data.allowCompatibleRevision !== 'boolean') throw new HttpsError('invalid-argument','Compatible revision reconciliation must be explicitly enabled or disabled.');
      const allowCompatibleRevision = durable && request.data.allowCompatibleRevision === true;
      if (request.data.expectedJobState != null && (typeof request.data.expectedJobState !== 'object' || Array.isArray(request.data.expectedJobState))) throw new HttpsError('invalid-argument','The saved job state is invalid.');
      const expectedJobState = request.data.expectedJobState == null ? null : compatibleJobState(request.data.expectedJobState);
      const expectedVersion = request.data.expectedVersion ?? null;
      if (durable && (!Object.hasOwn(request.data,'expectedVersion') || expectedVersion !== null && (typeof expectedVersion !== 'string' || !Number.isFinite(Date.parse(expectedVersion)))
        || !Object.hasOwn(request.data,'expectedAssignee') || request.data.expectedAssignee !== null && typeof request.data.expectedAssignee !== 'string')) throw new HttpsError('invalid-argument','The saved job revision and assignment are required for visit replay.');
      const payload = {
          jobId,
          type,
          note,
          ...(durable ? { occurredAt:request.data.occurredAt, expectedVersion, expectedAssignee:request.data.expectedAssignee } : {}),
          ...(gps ? {
            latitude: request.data.latitude ?? null,
            longitude: request.data.longitude ?? null,
            accuracy: request.data.accuracy ?? null,
            capturedAt: request.data.capturedAt ?? null
          } : {})
        },
        fingerprint = hash(JSON.stringify(payload));
      const id = hash(`${staff.company.id}:${staff.uid}:${operationId}`),
        eventRef = db.doc(`rlJobVisits/${id}`),
        time = now();
      return db.runTransaction(async tx => {
        await currentStaff(tx,staff);
        const [job, existing] = await Promise.all([tx.get(jobRef), tx.get(eventRef)]);
        checkJob(job, staff);
        if (staff.role === 'technician' && job.get('assignedToUid') && job.get('assignedToUid') !== staff.uid) throw new HttpsError('permission-denied','The current job assignment changed. Saved evidence must be reviewed by management.');
        if (existing.exists) {
          if (existing.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This visit operation was already used for a different event.');
          return {
            event: eventView(existing),
            status:'synced', version:existing.get('jobVersionAfter') || iso(job.get('updatedAt')) || job.get('updatedAt') || null,
            duplicate: true
          };
        }
        if (['completed', 'cancelled','canceled'].includes(job.get('status'))) fail('job-closed', 'This job is closed. Its history is available, but new events cannot be added.');
        const currentVersion=iso(job.get('updatedAt')) || job.get('updatedAt') || null;
        const assignmentChanged = durable && (job.get('assignedTo') || null) !== payload.expectedAssignee,
          revisionChanged = durable && currentVersion !== expectedVersion,
          businessStateChanged = revisionChanged && (!expectedJobState || JSON.stringify(compatibleJobState(job)) !== JSON.stringify(expectedJobState));
        if (assignmentChanged || revisionChanged && (!allowCompatibleRevision || businessStateChanged)) return {status:'conflict',version:currentVersion,server:{status:job.get('status'),updatedAt:currentVersion},message:assignmentChanged?'The job assignment changed while this evidence was saved. Management review is required; the original event remains on the device.':businessStateChanged?'The job schedule, service property, customer or service details changed while this evidence was saved. Management review is required; the original event remains on the device.':'The job revision changed while this evidence was saved. The original event remains on the device.'};
        const occurred = durable ? typeof payload.occurredAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(payload.occurredAt) ? Date.parse(payload.occurredAt) : NaN : time;
        if (!Number.isFinite(occurred) || occurred>time+120000 || occurred<time-30*86400000) throw new HttpsError('invalid-argument','The original visit time is invalid or older than the supported 30-day offline evidence window. Retain it for management review.');
        let at = occurred,
          accuracy,
          distance;
        if (gps) {
          const point = validFix(payload);
          accuracy = payload.accuracy;
          if (!point) throw new HttpsError('invalid-argument', 'The optional GPS fix requires numeric coordinates and known numeric accuracy.');
          at = durable ? Date.parse(payload.capturedAt) : captureTime(payload.capturedAt, time, time - 300000, 1);
          if (!Number.isFinite(at) || Math.abs(occurred-at)>300000 || at>time+120000) throw new HttpsError('invalid-argument', 'The GPS sample must have been captured within five minutes of the original visit.');
          let target = jobPoint(job.data());
          if (!target && !servicePropertySite(job.data()) && job.get('customerId')) {
            const customer = await tx.get(db.doc(`customers/${documentId(job.get('customerId'), 'customer')}`));
            if (customer.get('companyId') === staff.company.id) target = jobPoint(customer.data());
          }
          if (target) distance = Math.round(distanceMeters(point, target));
        }
        const event = {
          id,
          companyId: staff.company.id,
          userId: staff.uid,
          memberId: staff.memberId || staff.uid,
          jobId,
          type,
          note,
          source: gps ? 'manual-gps' : 'manual',
          occurredAt:new Date(occurred),
          recordedAt: new Date(time),
          capturedAt: new Date(at),
          fingerprint,
          evidenceOnly: true,
          verifiedAccess: false,
          originalJobVersion: expectedVersion,
          revisionReconciled: revisionChanged,
          ...(revisionChanged ? { reconciledJobVersion: currentVersion, originalJobState: expectedJobState } : {}),
          ...(gps ? {
            accuracy
          } : {}),
          ...(Number.isFinite(distance) ? {
            distanceMeters: distance
          } : {})
        };
        // Evidence retains time/proximity without creating another raw GPS history.
        const updatedAt=new Date(Math.max(time,(Date.parse(currentVersion)||0)+1)).toISOString();
        event.jobVersionAfter=updatedAt;
        tx.create(eventRef, event);
        tx.update(jobRef,{visitEvidence:visitSummary(job.get('visitEvidence'),type,new Date(occurred).toISOString()),updatedAt});
        return {
          event: eventView(event),
          status:'synced',version:updatedAt,
          reconciled: revisionChanged,
          duplicate: false
        };
      });
    },
    cleanup: async () => {
      let removed = 0, clearedFixes = 0;
      for (const name of ['rlLocations', 'rlJobVisitStates', 'rlLocationHistory', 'rlLocationHistoryEvents']) for (let page = 0; page < 10; page++) {
        const rows = await db.collection(name).where('expiresAt', '<=', new Date(now())).limit(400).get();
        if (rows.empty) break;
        const batch = db.batch();
        for (const row of rows.docs) {
          if (name === 'rlLocations' && row.get('shiftId') && row.get('sharing') && ms(row.get('sessionExpiresAt')) > now()) {
            // Retention removes raw GPS, not an otherwise active duty session.
            // A fresh OS fix can resume after a long background/connectivity gap.
            const clear = Object.fromEntries(['lat','lng','accuracy','capturedAt','updatedAt','receivedAt','positionShiftId'].map(key => [key, FieldValue.delete()]));
            batch.update(row.ref, { ...clear, expiresAt: row.get('sessionExpiresAt') }); clearedFixes++;
          } else { batch.delete(row.ref); removed++; }
        }
        await batch.commit();
      }
      return {
        removed, clearedFixes
      };
    }
  };
}
module.exports = {
  workTrackingHandlers,
  policyFor,
  active,
  shiftView,
  captureTime,
  distanceMeters,
  transition,
  jobPoint,
  visitSummary
};
