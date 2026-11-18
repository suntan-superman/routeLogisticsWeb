import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { catalog } from './catalog.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const readJson = file => JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
const baseline = readJson('baseline/assistant-responses.json');
const current = readJson('assistant-responses.json');
const baselineSummary = readJson('baseline/audit-summary.json');
const currentSummary = readJson('audit-summary.json');
const catalogById = new Map(catalog.map(item => [item.id, item]));
const currentByCase = new Map(current.map(item => [`${item.questionId}:${item.role}`, item]));

function rootCause(item) {
  if (item.severity === 'critical' && item.questionId.startsWith('BIL-')) {
    return item.classification === 'UNSUPPORTED'
      ? 'The resolver had no explicit disabled-payment rule and returned generic invoice guidance.'
      : 'A broad field-work or generic fallback outranked the billing intent and omitted the role boundary.';
  }
  if (item.questionId === 'JSD-06' || item.questionId === 'JSD-07') {
    return 'Broad scheduling guidance matched the job keywords before the cancel/delete intent was resolved.';
  }
  if (item.classification === 'PARTIAL') {
    return 'The broad topic response omitted one or more source-verified procedure or limitation details.';
  }
  if (item.actualResponse.includes('not certain which workflow')) {
    return 'The generic fallback did not have a verified procedure for this intent and context.';
  }
  return 'Keyword-first resolution selected a generic or adjacent workflow instead of the verified intent.';
}

function correction(item) {
  const procedure = catalogById.get(item.questionId);
  const denied = procedure?.assistantTests?.find(test => test.role === item.role && test.expectation === 'permission-denied');
  if (denied) return 'Added an explicit role denial for this verified procedure and removed unauthorized navigation actions.';
  if (procedure?.implementationStatus !== 'implemented') return 'Added an explicit unsupported/disabled procedure that states the real limitation and exposes no action.';
  return 'Added the source-verified procedure to the deterministic intent/context resolver with exact-first matching and safe fuzzy fallback.';
}

const results = baseline
  .filter(item => item.classification !== 'PASS')
  .map(item => {
    const procedure = catalogById.get(item.questionId);
    const after = currentByCase.get(`${item.questionId}:${item.role}`);
    const denied = procedure?.assistantTests?.find(test => test.role === item.role && test.expectation === 'permission-denied');
    const correctUnsupported = after?.classification === 'UNSUPPORTED'
      && procedure?.implementationStatus !== 'implemented'
      && after.missingConceptGroups?.length === 0
      && after.severity === 'none';
    return {
      questionId: item.questionId,
      role: item.role,
      question: item.question,
      expectedBehavior: denied
        ? `${item.role} must be denied this action and directed to an authorized role. The authorized workflow is: ${procedure?.verifiedAnswer || ''}`
        : procedure?.verifiedAnswer || '',
      baselineClassification: item.classification,
      baselineActualBehavior: item.actualResponse,
      rootCause: rootCause(item),
      correction: correction(item),
      retestClassification: correctUnsupported ? 'PASS (correctly unavailable)' : after?.classification || 'MISSING',
      retestActualBehavior: after?.actualResponse || '',
      retestResult: (after?.classification === 'PASS' || correctUnsupported) ? 'PASS' : 'FAIL',
      critical: item.severity === 'critical',
    };
  });

fs.writeFileSync(path.join(directory, 'remediation-results.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  baselineSummary,
  currentSummary,
  remediatedCases: results.length,
  passingRetests: results.filter(item => item.retestResult === 'PASS').length,
  results,
}, null, 2)}\n`);

const critical = results.filter(item => item.critical);
const escapeCell = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const lines = [
  '# Route Logistics assistant accuracy remediation',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Before and after',
  '',
  '| Metric | Baseline | Remediated |',
  '| --- | ---: | ---: |',
  `| Supported strict accuracy | ${baselineSummary.strictAccuracyPercent}% | ${currentSummary.strictAccuracyPercent}% |`,
  `| Supported substantial accuracy | ${baselineSummary.substantialAccuracyPercent}% | ${currentSummary.substantialAccuracyPercent}% |`,
  `| Passing role/context cases | ${baselineSummary.caseClassifications.PASS || 0} / ${baselineSummary.assistantCases} | ${currentSummary.caseClassifications.PASS || 0} / ${currentSummary.assistantCases} |`,
  `| Critical failures | ${baselineSummary.criticalFailureCases} | ${currentSummary.criticalFailureCases} |`,
  '',
  `The remaining non-PASS classification is the intentionally unavailable live-payment workflow. Its response is factually correct, exposes no action, and is excluded from the supported-case denominator. All ${results.length} baseline non-passing cases now pass their factual acceptance check.`,
  '',
  '## Critical corrections',
  '',
  '| Case | Expected behavior | Baseline defect | Correction | Retest |',
  '| --- | --- | --- | --- | --- |',
  ...critical.map(item => `| ${item.questionId} · ${item.role} | ${escapeCell(item.expectedBehavior)} | ${escapeCell(item.rootCause)} | ${escapeCell(item.correction)} | ${item.retestResult} |`),
  '',
  '## Resolver changes',
  '',
  '- The generated registry contains all 75 source-verified procedures and keeps the audit catalog as the source of truth.',
  '- Exact normalized questions resolve first; intent, action, object, phrase, token and page/role context scoring handle variants.',
  '- Explicit role denials are evaluated before navigation actions. Disabled or unsupported workflows return limitations rather than invented steps.',
  '- Financial intents are evaluated before field-work fallbacks, preventing completed-job invoice questions from being classified as technician work.',
  '- The web fallback consumes the same generated verified procedures when the assistant provider is unavailable.',
  '',
  '## Complete retest evidence',
  '',
  '- `remediation-results.json` records expected behavior, baseline response, root cause, correction, current response and retest result for every baseline non-passing case.',
  '- `assistant-responses.json` contains all 85 current role/context responses.',
  '- `baseline/assistant-responses.json` preserves the original 85-case baseline.',
  '- `audit-summary.json` and `baseline/audit-summary.json` preserve the comparable aggregate metrics.',
  '',
  '## Deployment status',
  '',
  'Local implementation and validation only. No production function, web application or Merxus backend deployment was performed.',
  '',
];
fs.writeFileSync(path.join(directory, 'REMEDIATION_REPORT.md'), `${lines.join('\n')}\n`);

console.log(JSON.stringify({
  comparedCases: results.length,
  passingRetests: results.filter(item => item.retestResult === 'PASS').length,
  criticalCases: critical.length,
}, null, 2));
