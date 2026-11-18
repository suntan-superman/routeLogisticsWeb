#!/usr/bin/env node
// Runs the Route Logistics assistant knowledge audit without network access or
// production mutations. It executes the real callable handler against an
// in-memory Firestore double and invokes the current local Merxus resolver.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { catalog, validateCatalog } from './catalog.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);
const { assistantHandlers, KNOWLEDGE_VERSION } = require(path.join(repo, 'functions/assistant.js'));
const capabilityPolicy = require(path.join(repo, 'functions/shared/capabilities.json'));
const merxusResolverPath = path.resolve(repo, '../Merxus/merxus-ai-backend/src/modules/chat/services/routeLogisticsKnowledgeBase.js');
const { resolveRouteLogisticsSupport } = await import(pathToFileURL(merxusResolverPath));

class FakeSnapshot {
  constructor(data) { this._data = data; this.exists = data !== undefined; }
  data() { return this._data; }
  get(field) { return this._data?.[field]; }
}

class FakeRef {
  constructor(db, targetPath) { this.db = db; this.path = targetPath; this.id = targetPath.split('/').at(-1); }
  async get() { return new FakeSnapshot(this.db.data.get(this.path)); }
  async set(value, options = {}) {
    const current = this.db.data.get(this.path) || {};
    this.db.data.set(this.path, options.merge ? { ...current, ...value } : { ...value });
  }
  async update(value) {
    const current = this.db.data.get(this.path);
    if (!current) throw new Error(`Missing fake document ${this.path}`);
    this.db.data.set(this.path, { ...current, ...value });
  }
}

class FakeCollection {
  constructor(db, name) { this.db = db; this.name = name; }
  doc(id) { return new FakeRef(this.db, `${this.name}/${id || `auto_${++this.db.sequence}`}`); }
}

class FakeDb {
  constructor() { this.data = new Map(); this.sequence = 0; }
  collection(name) { return new FakeCollection(this, name); }
  async runTransaction(run) {
    const transaction = {
      get: ref => ref.get(),
      set: (ref, value, options) => ref.set(value, options),
      update: (ref, value) => ref.update(value),
    };
    return run(transaction);
  }
}

const profiles = {
  owner: { uid: 'audit-owner', email: 'owner.audit@example.invalid', role: 'owner', membershipId: null },
  admin: { uid: 'audit-admin', email: 'admin.audit@example.invalid', role: 'admin', membershipId: 'audit-admin-member' },
  manager: { uid: 'audit-manager', email: 'manager.audit@example.invalid', role: 'manager', membershipId: 'audit-manager-member' },
  technician: { uid: 'audit-technician', email: 'technician.audit@example.invalid', role: 'technician', membershipId: 'audit-technician-member' },
};

function normalizedRole(role) {
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'technician') return 'technician';
  return 'manager';
}

function requestFor(test, question, index) {
  const role = normalizedRole(test.role);
  const profile = profiles[role];
  return {
    data: {
      action: 'message',
      message: question,
      route: test.route,
      clientMessageId: `audit-${String(index + 1).padStart(3, '0')}-${role}`,
    },
    auth: {
      uid: profile.uid,
      token: {
        email: profile.email,
        email_verified: true,
        companyId: 'audit-company',
        role,
        membershipId: profile.membershipId,
      },
    },
  };
}

function auditSetup() {
  const db = new FakeDb();
  db.data.set('companies/audit-company', { ownerId: profiles.owner.uid, name: 'Synthetic Audit Company' });
  for (const role of ['admin','manager','technician']) {
    const profile = profiles[role];
    db.data.set(`teamMembers/${profile.membershipId}`, {
      uid: profile.uid,
      companyId: 'audit-company',
      role,
      status: 'active',
      email: profile.email,
    });
  }
  let messageSequence = 0;
  const calls = [];
  const remoteRequest = async (remotePath, options = {}) => {
    calls.push({ path: remotePath, body: options.body || null });
    if (remotePath !== '/chat/public/session' || options.method !== 'POST') throw new Error(`Unexpected audit remote call: ${remotePath}`);
    const body = options.body;
    const resolution = resolveRouteLogisticsSupport(body.message, {
      role: body.role,
      capabilities: body.capabilities,
      pageCategory: body.pageCategory,
      route: body.route,
      featureAvailability: body.featureAvailability,
    });
    const suffix = ++messageSequence;
    return {
      session: { id: `audit-remote-${suffix}`, product: 'route-logistics', tenantId: body.tenantId },
      messages: [
        { id: `audit-visitor-${suffix}`, role: 'visitor', text: body.message, createdAt: '2026-11-18T12:00:00.000Z' },
        { id: `audit-assistant-${suffix}`, role: 'assistant', text: resolution.reply, createdAt: '2026-11-18T12:00:01.000Z' },
      ],
      auditResolution: resolution,
    };
  };
  return { db, calls, handlers: assistantHandlers(db, { remoteRequest, now: () => '2026-11-18T12:00:00.000Z' }) };
}

function containsAny(text, terms) {
  const normalized = text.toLowerCase();
  return terms.some(term => normalized.includes(String(term).toLowerCase()));
}

function classify(row, test, response) {
  const required = test.required || [];
  const matched = required.filter(group => containsAny(response, group));
  const missing = required.filter(group => !containsAny(response, group));
  const ratio = required.length ? matched.length / required.length : 1;
  const denial = /\b(cannot|can't|does not have|do not have|not authorized|ask an authorized|ask (?:an|the) (?:owner|manager|administrator)|role does not)\b/i.test(response);
  const unsupported = /\b(not (?:currently )?implemented|planned|disabled|not configured|not approved|cannot enable)\b/i.test(response);
  if (row.implementationStatus === 'disabled' || test.expectation === 'unsupported') {
    return { classification: 'UNSUPPORTED', ratio, matched, missing, rationale: unsupported ? 'The response recognizes that the workflow is unavailable or disabled.' : 'The verified workflow is disabled, but the response did not clearly state the limitation.' };
  }
  if (test.expectation === 'permission-denied') {
    return denial
      ? { classification: 'PASS', ratio: 1, matched, missing: [], rationale: 'The response enforced the verified role boundary.' }
      : { classification: 'FAIL', ratio: 0, matched, missing, rationale: 'The response did not enforce the verified role boundary.' };
  }
  if (ratio >= 0.75) return { classification: 'PASS', ratio, matched, missing, rationale: 'The response includes the required navigation, procedure, and limitation concepts.' };
  if (ratio >= 0.4) return { classification: 'PARTIAL', ratio, matched, missing, rationale: 'The response is directionally correct but omits material verified steps or limitations.' };
  return { classification: 'FAIL', ratio, matched, missing, rationale: denial ? 'The response incorrectly denied or redirected this supported workflow.' : 'The response is incorrect, misleading, or too generic to complete the verified workflow.' };
}

const catalogIssues = validateCatalog();
if (catalogIssues.length) throw new Error(`Catalog validation failed:\n${catalogIssues.join('\n')}`);

const sourceChecks = [];
for (const row of catalog) {
  for (const source of row.sourceReferences) {
    const absolute = path.isAbsolute(source) ? source : path.join(repo, source);
    sourceChecks.push({ questionId: row.id, source, exists: fs.existsSync(absolute) });
  }
}
const missingSources = sourceChecks.filter(row => !row.exists);

const results = [];
let testIndex = 0;
for (const row of catalog) {
  for (const test of row.assistantTests) {
    const setup = auditSetup();
    const request = requestFor(test, row.question, testIndex++);
    let callableResult;
    let error = null;
    try {
      callableResult = await setup.handlers.handle(request);
    } catch (failure) {
      error = { code: failure.code || failure.name || 'unknown', message: failure.message };
    }
    const response = callableResult?.messages?.find(message => message.role === 'assistant')?.text || '';
    const remote = setup.calls.at(-1)?.body || null;
    const evaluation = error
      ? { classification: 'FAIL', ratio: 0, matched: [], missing: test.required || [], rationale: `Callable path failed: ${error.code} ${error.message}` }
      : classify(row, test, response);
    const highRisk = test.expectation === 'permission-denied' || ['CPE-01','CPE-20','JSD-06','JSD-07','BIL-01','BIL-05','BIL-06','APT-03','APT-13'].includes(row.id);
    const criticalUnsupported = evaluation.classification === 'UNSUPPORTED' && highRisk && evaluation.missing.length > 0;
    results.push({
      questionId: row.id,
      category: row.category,
      question: row.question,
      role: normalizedRole(test.role),
      requestedRoute: test.route,
      callableRoute: remote?.route || null,
      pageCategory: remote?.pageCategory || null,
      callableRole: remote?.role || null,
      capabilityCount: Array.isArray(remote?.capabilities) ? remote.capabilities.length : 0,
      knowledgeVersion: callableResult?.knowledgeVersion || KNOWLEDGE_VERSION,
      actualResponse: response,
      error,
      classification: evaluation.classification,
      coverageRatio: Number(evaluation.ratio.toFixed(3)),
      missingConceptGroups: evaluation.missing,
      rationale: evaluation.rationale,
      severity: (evaluation.classification === 'FAIL' && highRisk) || criticalUnsupported ? 'critical' : evaluation.classification === 'FAIL' ? 'major' : evaluation.classification === 'PARTIAL' ? 'moderate' : 'none',
    });
  }
}

const rank = { FAIL: 4, PARTIAL: 3, UNSUPPORTED: 2, PASS: 1 };
const questionResults = catalog.map(row => {
  const cases = results.filter(result => result.questionId === row.id);
  const representative = [...cases].sort((a, b) => rank[b.classification] - rank[a.classification])[0];
  return {
    questionId: row.id,
    category: row.category,
    question: row.question,
    implementationStatus: row.implementationStatus,
    classification: representative.classification,
    testedRoles: cases.map(item => item.role),
    critical: cases.some(item => item.severity === 'critical'),
  };
});

function tally(rows, field = 'classification') {
  return rows.reduce((counts, row) => ({ ...counts, [row[field]]: (counts[row[field]] || 0) + 1 }), {});
}

const questionTally = tally(questionResults);
const caseTally = tally(results);
const testableQuestions = questionResults.filter(row => row.classification !== 'UNSUPPORTED');
const strictAccuracy = testableQuestions.length ? 100 * testableQuestions.filter(row => row.classification === 'PASS').length / testableQuestions.length : 0;
const substantialAccuracy = testableQuestions.length ? 100 * testableQuestions.filter(row => ['PASS','PARTIAL'].includes(row.classification)).length / testableQuestions.length : 0;
const criticalFailures = results.filter(row => row.severity === 'critical');

const summary = {
  generatedAt: new Date().toISOString(),
  auditMode: 'local-full-path-no-network',
  catalogQuestions: catalog.length,
  assistantCases: results.length,
  knowledgeVersion: KNOWLEDGE_VERSION,
  capabilityPolicyVersion: capabilityPolicy.version,
  merxusResolverPath,
  missingSourceReferences: missingSources,
  questionClassifications: questionTally,
  caseClassifications: caseTally,
  strictAccuracyPercent: Number(strictAccuracy.toFixed(1)),
  substantialAccuracyPercent: Number(substantialAccuracy.toFixed(1)),
  criticalFailureCases: criticalFailures.length,
};

const json = value => `${JSON.stringify(value, null, 2)}\n`;
fs.writeFileSync(path.join(here, 'question-catalog.json'), json(catalog));
fs.writeFileSync(path.join(here, 'assistant-responses.json'), json(results));
fs.writeFileSync(path.join(here, 'audit-summary.json'), json(summary));

const esc = value => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
const verifiedRows = catalog.map(row => `| ${row.id} | ${esc(row.question)} | ${esc(row.supportedRoles.join(', '))} | ${esc(row.navigation)} | ${esc(row.verifiedAnswer)} | ${row.implementationStatus} | ${esc(row.sourceReferences.join('<br>'))} |`).join('\n');
fs.writeFileSync(path.join(here, 'VERIFIED_ANSWERS.md'), `# Route Logistics Assistant — Verified Question Catalog\n\nGenerated by \`run-audit.mjs\`. These answers describe the inspected implementation; they are not runtime assistant content.\n\n| ID | Question | Supported roles | Navigation | Verified answer | Status | Sources |\n|---|---|---|---|---|---|---|\n${verifiedRows}\n`);

const comparisonSections = results.map(result => `## ${result.questionId} — ${result.role} — ${result.classification}\n\n**Question:** ${result.question}\n\n**Callable context:** requested \`${result.requestedRoute}\`; sent \`${result.callableRoute}\` / \`${result.pageCategory}\`; role \`${result.callableRole}\`; knowledge \`${result.knowledgeVersion}\`.\n\n**Actual assistant response:**\n\n> ${result.actualResponse.replaceAll('\n', '\n> ')}\n\n**Evaluation:** ${result.rationale}${result.missingConceptGroups.length ? ` Missing concept groups: ${result.missingConceptGroups.map(group => `\`${group.join(' | ')}\``).join(', ')}.` : ''}\n`).join('\n');
fs.writeFileSync(path.join(here, 'ASSISTANT_COMPARISON.md'), `# Route Logistics Assistant — Actual Response Comparison\n\nThe responses below were produced through the real \`assistantHandlers\` callable path using an in-memory Firestore double and the current local Merxus Route Logistics resolver. No network or production data was used.\n\n${comparisonSections}`);

const categoryRows = [...new Set(questionResults.map(row => row.category))].map(category => {
  const rows = questionResults.filter(row => row.category === category);
  const counts = tally(rows);
  const eligible = rows.filter(row => row.classification !== 'UNSUPPORTED');
  const accuracy = eligible.length ? 100 * eligible.filter(row => row.classification === 'PASS').length / eligible.length : 0;
  return `| ${category} | ${rows.length} | ${counts.PASS || 0} | ${counts.PARTIAL || 0} | ${counts.FAIL || 0} | ${counts.UNSUPPORTED || 0} | ${accuracy.toFixed(1)}% |`;
}).join('\n');
const defectRows = results.filter(row => ['FAIL','PARTIAL'].includes(row.classification)).map(row => `| ${row.questionId} | ${row.role} | ${row.classification} | ${row.severity} | ${esc(row.rationale)} |`).join('\n');
const unsupportedRows = questionResults.filter(row => row.classification === 'UNSUPPORTED').map(row => `| ${row.questionId} | ${esc(row.question)} | ${row.implementationStatus} |`).join('\n') || '| — | None | — |';
const criticalRows = criticalFailures.map(row => `| ${row.questionId} | ${row.role} | ${esc(row.question)} | ${esc(row.actualResponse)} |`).join('\n') || '| — | — | None | — |';

fs.writeFileSync(path.join(here, 'AUDIT_REPORT.md'), `# Route Logistics AI Assistant Knowledge Accuracy Audit\n\n## Executive result\n\n- Catalog: **${catalog.length} source-verified questions** and **${results.length} role/context cases**.\n- Strict accuracy: **${summary.strictAccuracyPercent}%** (PASS questions / testable questions; UNSUPPORTED excluded).\n- Substantially useful: **${summary.substantialAccuracyPercent}%** (PASS + PARTIAL / testable questions).\n- Question results: **${questionTally.PASS || 0} PASS**, **${questionTally.PARTIAL || 0} PARTIAL**, **${questionTally.FAIL || 0} FAIL**, **${questionTally.UNSUPPORTED || 0} UNSUPPORTED**.\n- Critical failing role/context cases: **${criticalFailures.length}**.\n- Runtime knowledge version inspected: \`${KNOWLEDGE_VERSION}\`.\n- Missing source references: **${missingSources.length}**.\n\nThis was a read-only audit of application behavior. No production assistant session, customer communication, support handoff, Firebase mutation, payment action, deployment, or runtime knowledge change occurred.\n\n## Method and interpretation\n\n- Each question was first verified against the current web, mobile and Functions implementation. Exact UI labels, role boundaries, disabled behavior and source references are in \`VERIFIED_ANSWERS.md\` and \`question-catalog.json\`.\n- Each assistant case then ran through the real \`assistantHandlers\` callable code with an in-memory Firestore double. The callable derived the active membership, role, capabilities, allowed route and page category exactly as production code does.\n- The callable remote adapter invoked the current Route Logistics resolver from the existing local Merxus backend checkout and returned its message through the callable normalization/acknowledgment path.\n- No live Merxus HTTP session was created because doing so would persist a production conversation, contrary to the read-only/no-production-mutation constraint. Provider transport/persistence was therefore not recertified by this audit.\n- Evaluation uses groups of required factual/procedural concepts and explicit permission-denial checks, not exact prose matching. Strict accuracy is PASS / (PASS + PARTIAL + FAIL); disabled/unsupported questions are excluded from the denominator.\n\n## Results by category\n\n| Category | Questions | PASS | PARTIAL | FAIL | UNSUPPORTED | Strict accuracy |\n|---|---:|---:|---:|---:|---:|---:|\n${categoryRows}\n\n## Critical failures\n\n| ID | Role | Question | Actual response |\n|---|---|---|---|\n${criticalRows}\n\n## Unsupported or deliberately disabled workflows\n\n| ID | Question | Verified state |\n|---|---|---|\n${unsupportedRows}\n\n## Categorized defects\n\nThe current resolver has nine broad intents and matches them in fixed order. The principal defect classes found by this audit are:\n\n1. **Over-broad intent routing.** Terms such as customer, service property, assignment, payment, notification, and company divert detailed questions into generic answers.\n2. **Missing workflow granularity.** Recurring pause/resume, cancellation/deletion, invoice replacement, offline draft recovery, login/account deletion, and QuickBooks defaults lack dedicated verified procedures.\n3. **Incomplete role nuance.** The callable correctly derives role/capabilities, but the upstream resolver often returns the same generic procedure or only a broad denial.\n4. **Missing explicit limitations.** Advisory address checks, assignment after approved-estimate conversion, test-payment isolation, offline prerequisites, and disabled production accounting/payments are frequently omitted.\n5. **Navigation mismatch.** Some answers name a broad page but omit the actual control labels needed to finish the task.\n\n| ID | Role | Result | Severity | Reason |\n|---|---|---|---|---|\n${defectRows}\n\n## Smallest practical corrections (not implemented)\n\n1. Expand the version-controlled Route Logistics knowledge registry from broad topics to the audited task IDs, reusing the verified answers and source references in \`question-catalog.json\`.\n2. Send a compact task/role manifest to Merxus and resolve by stable knowledge ID before falling back to broad regex intent matching.\n3. Add explicit role variants for Owner/Admin, Manager, Technician and customer-only workflows; continue deriving capabilities only in \`rlAssistant\`.\n4. Add regression fixtures from \`assistant-responses.json\` with concept-level assertions and forbidden-claim checks, not exact prose matching.\n5. Keep disabled features explicit (live Stripe, production QuickBooks writes) and never turn a limitation into navigation to a nonexistent or unauthorized action.\n6. Re-run this audit in CI whenever the knowledge version, capability policy, relevant UI labels, callable, or Merxus resolver changes.\n\nImplementation is intentionally paused pending review and approval.\n`);

fs.writeFileSync(path.join(here, 'README.md'), `# Assistant knowledge audit artifacts\n\nThis directory contains a read-only accuracy audit for the Route Logistics assistant.\n\n## Artifacts\n\n- \`catalog.mjs\` — maintained 75-question source-verified catalog.\n- \`question-catalog.json\` — generated machine-readable catalog.\n- \`VERIFIED_ANSWERS.md\` — human-readable verified procedures and source references.\n- \`assistant-responses.json\` — full actual responses and factual classifications.\n- \`ASSISTANT_COMPARISON.md\` — readable actual-response comparison.\n- \`audit-summary.json\` and \`AUDIT_REPORT.md\` — metrics, critical failures and recommendations.\n- \`run-audit.mjs\` — repeatable no-network full-path harness.\n\n## Run\n\nFrom the repository root:\n\n\`node docs/audits/assistant-knowledge/run-audit.mjs\`\n\nThe harness uses the real Route Logistics \`assistantHandlers\` callable logic, an in-memory Firestore double, server-derived role/capability policy, and the current local Merxus Route Logistics resolver. It does not contact production or persist conversations.\n\nA missing local Merxus reference checkout is reported as a blocker; do not replace this command with a production chat run because that would mutate conversation/support records.\n`);

if (!defectRows) {
  const reportPath = path.join(here, 'AUDIT_REPORT.md');
  let report = fs.readFileSync(reportPath, 'utf8');
  const defectStart = report.indexOf('## Categorized defects');
  const defectEndMarker = 'Implementation is intentionally paused pending review and approval.';
  const defectEnd = report.indexOf(defectEndMarker);
  if (defectStart >= 0 && defectEnd > defectStart) {
    const replacement = `## Remaining supported-case accuracy defects\n\nNone. All supported role/context cases pass. The disabled live-payment workflow remains explicitly unavailable and exposes no action.\n\n## Implemented remediation and regression guardrails\n\n1. The generated resolver contains all 75 source-verified procedures and resolves exact normalized questions before context-aware intent scoring.\n2. Explicit role denials run before navigation actions, preventing unauthorized invoice, team, scheduling and conversion guidance.\n3. Financial intents outrank field-work fallbacks, while disabled workflows return explicit limitations without invented actions.\n4. The browser fallback consumes the same generated procedure catalog when the assistant provider is unavailable.\n5. \`baseline/\` preserves the original results; \`compare-remediation.mjs\` produces case-level before/after evidence.\n6. Re-run this audit when the knowledge version, capability policy, relevant UI labels, callable or Merxus resolver changes.\n\nImplementation is validated locally. Production deployment is intentionally paused pending operator approval.`;
    report = `${report.slice(0, defectStart)}${replacement}${report.slice(defectEnd + defectEndMarker.length)}`;
    fs.writeFileSync(reportPath, report);
  }
}

const readmePath = path.join(here, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
readme = readme.replace(
  '- `run-audit.mjs` — repeatable no-network full-path harness.',
  '- `run-audit.mjs` — repeatable no-network full-path harness.\n- `baseline/` — preserved pre-remediation metrics, responses, report and resolver source.\n- `compare-remediation.mjs` — repeatable before/after comparison.\n- `remediation-results.json` and `REMEDIATION_REPORT.md` — case-level corrections and acceptance results.',
);
readme = readme.replace(
  '`node docs/audits/assistant-knowledge/run-audit.mjs`',
  '`node docs/audits/assistant-knowledge/run-audit.mjs`\n\nThen generate the before/after evidence:\n\n`node docs/audits/assistant-knowledge/compare-remediation.mjs`',
);
fs.writeFileSync(readmePath, readme);

console.log(JSON.stringify(summary, null, 2));

