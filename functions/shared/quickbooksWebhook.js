// Both formats are documented by Intuit. Signature verification must happen on
// the unchanged raw body before calling this parser; it grants no authority.
// https://static.developer.intuit.com/output_html/qbo/docs/develop/webhooks/configure-webhooks.html
const MAX_WEBHOOK_EVENTS = 1000;
const MAX_WEBHOOK_GROUPS = 100;
const ENTITIES = Object.freeze({ customer: 'Customer', item: 'Item', invoice: 'Invoice', payment: 'Payment' });
const OPERATIONS = Object.freeze({ created: 'Create', updated: 'Update', deleted: 'Delete', merged: 'Merge', voided: 'Void', emailed: 'Emailed' });
const ALLOWED = Object.freeze({ Customer: ['Create','Update','Delete','Merge'], Item: ['Create','Update','Delete','Merge'], Invoice: ['Create','Update','Delete','Void','Emailed'], Payment: ['Create','Update','Delete','Void','Emailed'] });

class QuickBooksWebhookPayloadError extends Error {
  constructor(status = 400) {
    super(status === 413 ? 'QuickBooks webhook exceeds the supported batch size.' : 'Invalid QuickBooks webhook notification.');
    this.name = 'QuickBooksWebhookPayloadError';
    this.status = status;
  }
}
const invalid = () => { throw new QuickBooksWebhookPayloadError(); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function identifier(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) value = String(value);
  if (typeof value !== 'string' || !/^\d{1,30}$/.test(value)) invalid();
  return value;
}
function timestamp(value, cloudEvent = false) {
  if (typeof value !== 'string' || value.length > 100 || !Number.isFinite(Date.parse(value))) invalid();
  // Legacy integrations can send an ISO service date. CloudEvents time must
  // identify an instant, as required by Intuit's current RFC 3339 schema.
  if (cloudEvent && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) invalid();
  if (!cloudEvent && !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) invalid();
  return value;
}
function cloudEvents(events) {
  if (events.length > MAX_WEBHOOK_EVENTS) throw new QuickBooksWebhookPayloadError(413);
  const result = [];
  for (const event of events) {
    if (!object(event) || event.specversion !== '1.0' || typeof event.type !== 'string' || event.type.length > 200) invalid();
    const realmId = identifier(event.intuitaccountid), id = identifier(event.intuitentityid), lastUpdated = timestamp(event.time, true);
    if (typeof event.id !== 'string' || !/^[A-Za-z0-9._:-]{1,200}$/.test(event.id)) invalid();
    if (event.datacontenttype !== undefined && (typeof event.datacontenttype !== 'string' || !/^application\/json(?:;|$)/i.test(event.datacontenttype))) invalid();
    const match = /^qbo\.([a-z]+)\.([a-z]+)\.v1$/.exec(event.type);
    if (!match) continue;
    const type = ENTITIES[match[1]], operation = OPERATIONS[match[2]];
    if (!type || !ALLOWED[type].includes(operation)) continue;
    result.push({ realmId, type, id, operation, lastUpdated, eventId: event.id });
  }
  return result;
}
function legacyEvents(groups) {
  if (groups.length > MAX_WEBHOOK_GROUPS) throw new QuickBooksWebhookPayloadError(413);
  let count = 0;
  const result = [];
  for (const group of groups) {
    if (!object(group) || !object(group.dataChangeEvent) || !Array.isArray(group.dataChangeEvent.entities)) invalid();
    const realmId = identifier(group.realmId);
    count += group.dataChangeEvent.entities.length;
    if (count > MAX_WEBHOOK_EVENTS) throw new QuickBooksWebhookPayloadError(413);
    for (const entity of group.dataChangeEvent.entities) {
      if (!object(entity) || typeof entity.name !== 'string' || typeof entity.operation !== 'string') invalid();
      const id = identifier(entity.id), lastUpdated = timestamp(entity.lastUpdated);
      if (!Object.hasOwn(ALLOWED, entity.name) || !ALLOWED[entity.name].includes(entity.operation)) continue;
      result.push({ realmId, type: entity.name, id, operation: entity.operation, lastUpdated });
    }
  }
  return result;
}
function normalizeQuickBooksWebhook(body) {
  if (Array.isArray(body)) return cloudEvents(body);
  if (!object(body)) invalid();
  if (Object.hasOwn(body, 'specversion')) return cloudEvents([body]);
  if (!Array.isArray(body.eventNotifications)) invalid();
  return legacyEvents(body.eventNotifications);
}
module.exports = { normalizeQuickBooksWebhook, QuickBooksWebhookPayloadError, MAX_WEBHOOK_EVENTS, MAX_WEBHOOK_GROUPS };
