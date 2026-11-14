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
const ms = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
const iso = value => Number.isFinite(ms(value)) ? new Date(ms(value)).toISOString() : null;
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
const jobPoint = job => coordinates(job) || coordinates({
  latitude: job?.location?.lat,
  longitude: job?.location?.lng
});
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
  const staffFor = request => {
    const {
      token
    } = requireAuth(request, true);
    return requireStaff(db, request, token.companyId);
  };
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
        if (!target && job.get('customerId')) {
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
        const [saved, location] = await Promise.all([tx.get(target.shift), tx.get(target.location)]);
        let data = saved.exists ? saved.data() : null;
        if (action === 'end' && request.data.shiftId && data?.id !== request.data.shiftId) fail('shift-mismatch', 'This is a different work shift. Refresh before ending it.');
        const membershipChanged = data && data.memberId !== (staff.memberId || staff.uid);
        if (data?.status === 'on-duty' && (!active(data, time) || action === 'end' || membershipChanged)) {
          const expired = !active(data, time);
          data = {
            ...data,
            status: 'off-duty',
            endedAt: expired ? new Date(ms(data.expiresAt)) : new Date(time),
            endReason: expired ? 'expired' : membershipChanged ? 'membership-changed' : 'user-ended'
          };
          tx.set(target.shift, data);
          tx.set(db.doc(`rlWorkShiftEvents/${data.id}-end`), {
            ...data,
            event: 'end',
            recordedAt: new Date(time)
          });
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
        }
        return shiftView(data, time);
      });
      return {
        shift,
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
          if (current.exists && current.get('sessionId') === request.data.sessionId) tx.update(target.location, {
            sharing: false,
            stoppedAt: new Date(time)
          });
        });
        return {
          sharing: false,
          policy
        };
      }
      if (action === 'start') return db.runTransaction(async tx => {
        const [saved, location] = await Promise.all([tx.get(target.shift), tx.get(target.location)]),
          shift = saved.data();
        ownShift(shift, staff, request.data.shiftId, time);
        const sessionId = location.get('sharing') && location.get('shiftId') === shift.id ? location.get('sessionId') : randomBytes(24).toString('hex');
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
        const [saved, current] = await Promise.all([tx.get(target.shift), tx.get(target.location)]);
        if (!current.exists || !current.get('sharing')) fail('session-ended', 'Location sharing has stopped. Start it again during your shift.');
        if (!request.data.sessionId || current.get('sessionId') !== request.data.sessionId) fail('session-mismatch', 'This location session has been replaced. Refresh your shift.');
        shift = saved.data();
        ownShift(shift, staff, current.get('shiftId'), time);
        at = captureTime(request.data.capturedAt, time, ms(shift.startedAt), policy.retentionHours);
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
    list: async request => {
      const staff = await staffFor(request);
      if (staff.role === 'technician') throw new HttpsError('permission-denied', 'Manager access is required to view team locations.');
      await rateLimit(db, 'location-read', staff.uid, 30);
      const [rows, members, shifts] = await Promise.all(['rlLocations', 'teamMembers', 'rlWorkShifts'].map(name => db.collection(name).where('companyId', '==', staff.company.id).limit(501).get()));
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
      const roster = team.map(member => {
        const shift = shifts.docs.find(row => row.get('userId') === member.userId && row.get('memberId') === member.memberId)?.data(),
          onDuty = active(shift, time);
        const row = rows.docs.find(row => row.get('userId') === member.userId && row.get('memberId') === member.memberId),
          data = row?.data(),
          at = ms(data?.capturedAt || data?.updatedAt);
        const retained = data && ms(data.expiresAt) > time && at + policy.retentionHours * 3600000 > time && Number.isFinite(data.lat) && Number.isFinite(data.lng);
        const matching = data?.shiftId ? onDuty && data.shiftId === shift.id && data.positionShiftId === shift.id : !!data;
        const stale = !matching || !Number.isFinite(at) || time - at > (data?.shiftId ? policy.freshAfterSeconds : 180) * 1000 || ms(data?.sessionExpiresAt) <= time;
        const trackingState = !onDuty && data?.shiftId ? 'off-duty' : !data?.sharing ? 'sharing-disabled' : !retained || onDuty && data.positionShiftId !== shift.id ? 'waiting-for-fix' : stale ? 'stale' : 'live';
        const location = retained ? {
          id: row.id,
          ...member,
          lat: data.lat,
          lng: data.lng,
          accuracy: data.accuracy,
          updatedAt: new Date(at).toISOString(),
          capturedAt: new Date(at).toISOString(),
          receivedAt: iso(data.receivedAt),
          sharing: data.sharing === true && matching && !stale,
          stale,
          state: !data.sharing || data.shiftId && !onDuty ? 'sharing-disabled' : stale ? 'stale' : 'live',
          dutyStatus: onDuty ? 'on-duty' : 'off-duty',
          freshAfterSeconds: policy.freshAfterSeconds
        } : null;
        if (location) locations.push(location);
        return {
          ...member,
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
        truncated: rows.size > 500 || members.size > 500 || shifts.size > 500
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
      const payload = {
          jobId,
          type,
          note,
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
        const [job, existing] = await Promise.all([tx.get(jobRef), tx.get(eventRef)]);
        checkJob(job, staff);
        if (existing.exists) {
          if (existing.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This visit operation was already used for a different event.');
          return {
            event: eventView(existing),
            duplicate: true
          };
        }
        if (['completed', 'cancelled'].includes(job.get('status'))) fail('job-closed', 'This job is closed. Its history is available, but new events cannot be added.');
        let at = time,
          accuracy,
          distance;
        if (gps) {
          const point = validFix(payload);
          accuracy = payload.accuracy;
          if (!point) throw new HttpsError('invalid-argument', 'The optional GPS fix requires numeric coordinates and known numeric accuracy.');
          at = captureTime(payload.capturedAt, time, time - 300000, 1);
          if (time - at > 300000) throw new HttpsError('invalid-argument', 'Use a GPS fix captured within the last five minutes.');
          let target = jobPoint(job.data());
          if (!target && job.get('customerId')) {
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
          recordedAt: new Date(time),
          capturedAt: new Date(at),
          fingerprint,
          evidenceOnly: true,
          verifiedAccess: false,
          ...(gps ? {
            accuracy
          } : {}),
          ...(Number.isFinite(distance) ? {
            distanceMeters: distance
          } : {})
        };
        // Evidence retains time/proximity without creating another raw GPS history.
        tx.create(eventRef, event);
        return {
          event: eventView(event),
          duplicate: false
        };
      });
    },
    cleanup: async () => {
      let removed = 0, clearedFixes = 0;
      for (const name of ['rlLocations', 'rlJobVisitStates']) for (let page = 0; page < 10; page++) {
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
  transition
};
