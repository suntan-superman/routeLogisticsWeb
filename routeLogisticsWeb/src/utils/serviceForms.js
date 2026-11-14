export function serviceAnswers(template, answers, complete = false) {
  const result = {};
  for (const field of template.fields) {
    const value = answers[field.id], empty = value == null || typeof value === 'string' && !value.trim() || Array.isArray(value) && !value.length;
    if (empty) { if (complete && field.required) throw new Error(`${field.label} is required.`); continue; }
    if (field.type === 'number') {
      const number = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(number) || field.min != null && number < field.min || field.max != null && number > field.max) throw new Error(`${field.label} must be within its configured numeric limits.`);
      result[field.id] = number;
    } else if (['checklist','photos'].includes(field.type)) {
      if (!Array.isArray(value) || new Set(value).size !== value.length || field.type === 'checklist' && value.some(item => !field.options.includes(item)) || field.type === 'photos' && value.length > field.maxPhotos) throw new Error(`${field.label} contains invalid selections.`);
      result[field.id] = value;
    } else {
      if (typeof value !== 'string' || field.type === 'select' && !field.options.includes(value) || ['text','notes'].includes(field.type) && value.length > field.maxLength) throw new Error(`${field.label} contains an invalid value.`);
      result[field.id] = value;
    }
  }
  return result;
}
export function serviceReportText(row) {
  const report = row.report;
  return [`${report.templateName} — service report`, `Service date: ${report.serviceDate || row.serviceDate || 'Not supplied'}`, `Template version: ${report.templateVersion}`, `Report revision: ${row.responseVersion}`, `Status: ${row.status}`, `Recorded: ${row.createdAt}`, '',
    ...report.fields.map(field => `${field.label}: ${field.value == null ? 'Not recorded' : Array.isArray(field.value) ? field.type === 'photos' ? `${field.value.length} private job photo reference(s)` : field.value.join(', ') : String(field.value)}${field.unit ? ` ${field.unit}` : ''}`)].join('\n');
}
