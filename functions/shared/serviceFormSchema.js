const FIELD_TYPES = ['text', 'number', 'checklist', 'select', 'photos', 'notes'];
const identifier = value => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
function validateTemplate(input) {
  if (!plain(input) || !identifier(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 150 || !identifier(input.industry)
    || !Number.isInteger(input.version) || input.version < 1 || input.version > 100000 || !Array.isArray(input.fields) || !input.fields.length || input.fields.length > 40) throw new Error('Choose a valid template ID, name, industry, version and 1–40 fields.');
  const ids = new Set();
  const fields = input.fields.map(field => {
    if (!plain(field) || !identifier(field.id) || ids.has(field.id) || !FIELD_TYPES.includes(field.type) || typeof field.label !== 'string' || !field.label.trim() || field.label.length > 150) throw new Error('Each field needs a unique ID, label and supported type.');
    ids.add(field.id);
    const result = { id: field.id, label: field.label.trim(), type: field.type, required: field.required === true };
    if (field.unit != null) { if (typeof field.unit !== 'string' || field.unit.length > 30 || field.type !== 'number') throw new Error('Units apply only to numeric fields.'); result.unit = field.unit; }
    for (const key of ['min','max']) if (field[key] != null) { if (field.type !== 'number' || !Number.isFinite(field[key])) throw new Error('Numeric limits must be finite numbers.'); result[key] = field[key]; }
    if (result.min != null && result.max != null && result.min > result.max) throw new Error('Minimum cannot exceed maximum.');
    if (['select','checklist'].includes(field.type)) {
      if (!Array.isArray(field.options) || !field.options.length || field.options.length > 30 || field.options.some(value => typeof value !== 'string' || !value.trim() || value.length > 150) || new Set(field.options).size !== field.options.length) throw new Error('Selections need 1–30 unique choices.');
      result.options = field.options;
    }
    if (['text','notes'].includes(field.type)) { result.maxLength = field.maxLength ?? 4000; if (!Number.isInteger(result.maxLength) || result.maxLength < 1 || result.maxLength > 10000) throw new Error('Text length must be 1–10,000 characters.'); }
    if (field.type === 'photos') { result.maxPhotos = field.maxPhotos ?? 8; if (!Number.isInteger(result.maxPhotos) || result.maxPhotos < 1 || result.maxPhotos > 10) throw new Error('Photo fields allow 1–10 existing job photos.'); }
    return result;
  });
  return { id: input.id, name: input.name.trim(), industry: input.industry, version: input.version, description: String(input.description || '').slice(0, 1000), status: input.status === 'foundation' ? 'foundation' : 'starter', fields };
}
function validateAnswers(template, input, { complete = false } = {}) {
  if (!plain(input)) throw new Error('Service answers must be an object.');
  const fields = new Map(template.fields.map(field => [field.id, field]));
  if (Object.keys(input).some(key => !fields.has(key))) throw new Error('Unknown service fields are not allowed.');
  const answers = {};
  for (const field of template.fields) {
    const value = input[field.id], absent = value == null || value === '' || Array.isArray(value) && value.length === 0;
    if (absent) { if (complete && field.required) throw new Error(`${field.label} is required.`); continue; }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value) || field.min != null && value < field.min || field.max != null && value > field.max) throw new Error(`${field.label} must be a number within its configured limits.`);
    } else if (['text','notes'].includes(field.type)) { if (typeof value !== 'string' || value.length > field.maxLength) throw new Error(`${field.label} exceeds its text limit.`); if (complete && field.required && !value.trim()) throw new Error(`${field.label} is required.`); }
    else if (field.type === 'select') { if (!field.options.includes(value)) throw new Error(`${field.label} contains an unsupported choice.`); }
    else {
      if (!Array.isArray(value) || new Set(value).size !== value.length || value.some(item => typeof item !== 'string')) throw new Error(`${field.label} must contain unique selections.`);
      if (field.type === 'checklist' ? value.some(item => !field.options.includes(item)) : value.length > field.maxPhotos || value.some(item => !/^[a-zA-Z0-9_-]{1,200}$/.test(item))) throw new Error(`${field.label} contains invalid selections or photo IDs.`);
    }
    answers[field.id] = value;
  }
  return answers;
}
function serviceReport(template, answers) {
  return { templateId: template.id, templateVersion: template.version, templateName: template.name, industry: template.industry,
    fields: template.fields.map(field => ({ id: field.id, label: field.label, type: field.type, ...(field.unit ? { unit: field.unit } : {}), value: answers[field.id] ?? null })) };
}
module.exports = { FIELD_TYPES, validateTemplate, validateAnswers, serviceReport };
