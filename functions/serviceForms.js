const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability, checkJob, hasCapability } = require('./access');
const { documentId, rateLimit } = require('./security');
const { validateTemplate, validateAnswers, serviceReport } = require('./shared/serviceFormSchema');
const BUILTINS = require('./shared/serviceTemplates.json').map(validateTemplate);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const invalid = error => { throw new HttpsError('invalid-argument', error.message); };
const openJob = job => { if (['completed','cancelled','canceled'].includes(job.status)) throw new HttpsError('failed-precondition', 'This job is closed. Existing service reports remain available.'); };
function formView(form) { return form ? { template: form.template, assignmentVersion: form.assignmentVersion, responseVersion: form.responseVersion, answers: form.answers || {}, status: form.status, serviceDate: form.serviceDate, updatedAt: form.updatedAt } : null; }
function serviceFormsHandler(db, { enabled = () => false, now = () => new Date().toISOString() } = {}) {
  return async request => {
    const data = request.data || {}, action = data.action;
    const manage = ['publish','assign'].includes(action);
    const scope = await requireCapability(db, request, manage ? 'jobs.schedule' : action === 'save' ? 'jobs.work' : 'jobs.read');
    await rateLimit(db, 'service-forms', scope.uid, 90);
    const scopeKey = scope.companyId || `solo:${scope.uid}`, scopeFields = { userId: scope.uid, ...(scope.companyId ? { companyId: scope.companyId } : {}), scopeKey };
    const recheck = async tx => {
      if (!scope.companyId) return;
      const company = await tx.get(db.doc(`companies/${scope.companyId}`));
      if (scope.role === 'owner') { if (company.get('ownerId') !== scope.uid) throw new HttpsError('permission-denied', 'Company ownership changed.'); }
      else {
        const member = await tx.get(db.doc(`teamMembers/${scope.memberId}`));
        if (member.get('uid') !== scope.uid || member.get('companyId') !== scope.companyId || member.get('role') !== scope.role || member.get('status') !== 'active') throw new HttpsError('permission-denied', 'Your current membership no longer permits this service operation.');
      }
    };
    if (!['catalog','read','publish','assign','save'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a service-template action.');
    if (['publish','assign','save'].includes(action) && !enabled()) throw new HttpsError('failed-precondition', 'Service forms are not enabled yet. Existing work and chemical records are unchanged.');
    if (action === 'catalog') {
      const heads = hasCapability(scope.role, 'jobs.schedule') ? await db.collection('rlServiceTemplateHeads').where('scopeKey', '==', scopeKey).limit(100).get() : { docs: [] };
      return { enabled: enabled(), templates: [...BUILTINS, ...heads.docs.map(row => row.get('template'))] };
    }
    if (action === 'publish') {
      let template; try { template = validateTemplate(data.template); } catch (error) { invalid(error); }
      if (BUILTINS.some(row => row.id === template.id)) throw new HttpsError('invalid-argument', 'Use a new ID when customizing a built-in starter.');
      const headRef = db.doc(`rlServiceTemplateHeads/${hash([scopeKey,template.id])}`), templateRef = db.doc(`rlServiceTemplates/${hash([scopeKey,template.id,template.version])}`);
      await db.runTransaction(async tx => {
        await recheck(tx);
        const [head, existing] = await Promise.all([tx.get(headRef),tx.get(templateRef)]);
        if (existing.exists || template.version !== (head.get('template')?.version || 0) + 1) throw new HttpsError('already-exists', 'Publish the next new template version. Existing versions cannot be overwritten.');
        tx.create(templateRef, { ...scopeFields, template, createdAt: now() }); tx.set(headRef, { ...scopeFields, template, updatedAt: now() });
        tx.create(db.collection('rlAudit').doc(), { action: 'service-template.publish', ...scopeFields, actorId: scope.uid, templateId: template.id, templateVersion: template.version, createdAt: now() });
      });
      return { template };
    }
    const jobId = documentId(data.jobId, 'job'), jobRef = db.doc(`jobs/${jobId}`), formRef = db.doc(`rlJobServiceForms/${jobId}`);
    if (action === 'read') {
      const job = await jobRef.get(); checkJob(scope, job.data());
      const [form, reports, photos] = await Promise.all([formRef.get(), formRef.collection('reports').orderBy('createdAt', 'desc').limit(20).get(), db.collection('photos').where('jobId','==',jobId).limit(100).get()]);
      if (form.exists && form.get('scopeKey') !== scopeKey) throw new HttpsError('permission-denied', 'Service form unavailable.');
      return { enabled: enabled(), form: formView(form.exists ? { ...form.data(), serviceDate: job.get('date') || form.get('serviceDate') || null } : null), reports: reports.docs.filter(row => row.get('scopeKey') === scopeKey).map(row => ({ id: row.id, responseVersion: row.get('responseVersion'), status: row.get('status'), serviceDate: row.get('serviceDate'), createdAt: row.get('createdAt'), report: row.get('report') })),
        photos: photos.docs.filter(row => scope.companyId ? row.get('companyId') === scope.companyId : !row.get('companyId') && row.get('userId') === scope.uid).map(row => ({ id: row.id, caption: row.get('caption') || '', createdAt: row.get('createdAt') || null })) };
    }
    if (action === 'assign') {
      const templateId = documentId(data.templateId), templateVersion = Number(data.templateVersion);
      const builtIn = BUILTINS.find(row => row.id === templateId && row.version === templateVersion);
      const template = builtIn || (await db.doc(`rlServiceTemplates/${hash([scopeKey,templateId,templateVersion])}`).get()).get('template');
      if (!template) throw new HttpsError('not-found', 'Choose an available template version.');
      const form = await db.runTransaction(async tx => {
        await recheck(tx);
        const [job, current] = await Promise.all([tx.get(jobRef),tx.get(formRef)]); checkJob(scope, job.data()); openJob(job.data());
        if (Number(data.expectedVersion) !== (current.get('assignmentVersion') || 0)) throw new HttpsError('aborted', 'The service template changed. Refresh before assigning another version.');
        const next = { ...scopeFields, jobId, template, assignmentVersion: (current.get('assignmentVersion') || 0) + 1, responseVersion: current.get('responseVersion') || 0, answers: {}, status: 'draft', serviceDate: job.get('date') || null, updatedAt: now() };
        tx.set(formRef, next); tx.create(db.collection('rlAudit').doc(), { action: 'service-template.assign', ...scopeFields, actorId: scope.uid, jobId, templateId, templateVersion, createdAt: now() }); return next;
      }); return { form: formView(form) };
    }
    const operationId = documentId(data.operationId, 'operation');
    if (!/^[a-zA-Z0-9_-]{16,100}$/.test(operationId) || !['draft','completed'].includes(data.status)) throw new HttpsError('invalid-argument', 'Choose a valid service-form operation and status.');
    const reportRef = formRef.collection('reports').doc(hash([scope.uid,operationId]));
    return db.runTransaction(async tx => {
      await recheck(tx);
      const [job, current, previous] = await Promise.all([tx.get(jobRef),tx.get(formRef),tx.get(reportRef)]); checkJob(scope, job.data());
      const template = previous.exists ? previous.get('template') : current.get('template');
      if (!template || current.get('scopeKey') !== scopeKey) throw new HttpsError('failed-precondition', 'A manager must attach a service template to this job first.');
      if (data.templateId !== template.id || data.templateVersion !== template.version) throw new HttpsError('failed-precondition', 'The pinned template version changed. Retain your answers and ask your manager to review.');
      let answers; try { answers = validateAnswers(template, data.answers, { complete: data.status === 'completed' }); } catch (error) { invalid(error); }
      const fingerprint = hash([jobId,data.templateId,data.templateVersion,data.status,answers]);
      if (previous.exists) { if (previous.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This operation ID belongs to different service answers.'); return { status: 'synced', version: previous.get('responseVersion'), duplicate: true }; }
      openJob(job.data());
      if (data.assignmentVersion !== current.get('assignmentVersion') || data.expectedVersion !== (current.get('responseVersion') || 0)) return { status: 'conflict', server: formView(current.data()), version: current.get('responseVersion') || 0 };
      const photoIds = [...new Set(template.fields.filter(field => field.type === 'photos').flatMap(field => answers[field.id] || []))];
      const photos = await Promise.all(photoIds.map(id => tx.get(db.doc(`photos/${id}`))));
      if (photos.some(photo => !photo.exists || photo.get('jobId') !== jobId || (scope.companyId ? photo.get('companyId') !== scope.companyId : photo.get('companyId') || photo.get('userId') !== scope.uid))) throw new HttpsError('permission-denied', 'A selected photo is not available for this job. Upload it and refresh the photo list.');
      const responseVersion = (current.get('responseVersion') || 0) + 1, createdAt = now(), serviceDate = job.get('date') || current.get('serviceDate') || null, report = { ...serviceReport(template, answers), serviceDate };
      tx.update(formRef, { answers, status: data.status, responseVersion, serviceDate, updatedAt: createdAt });
      tx.create(reportRef, { ...scopeFields, jobId, template, answers, fingerprint, report, serviceDate, responseVersion, status: data.status, createdAt });
      tx.create(db.collection('rlAudit').doc(), { action: 'service-form.save', ...scopeFields, actorId: scope.uid, jobId, responseVersion, templateId: template.id, templateVersion: template.version, status: data.status, createdAt });
      return { status: 'synced', version: responseVersion };
    });
  };
}
module.exports = { serviceFormsHandler, BUILTINS, formView };
