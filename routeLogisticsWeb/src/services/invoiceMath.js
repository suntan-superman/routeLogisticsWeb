const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Computes totals in integer cents to avoid floating point drift. taxRate is a percentage (e.g. 8.25).
export function computeTotals(lineItems = [], taxRate = 0) {
  const items = lineItems.map((item) => {
    const quantity = Math.max(0, Number(item.quantity) || 0);
    const unitPrice = Math.max(0, Number(item.unitPrice) || 0);
    const amountCents = Math.round(quantity * unitPrice * 100);
    return { description: String(item.description || '').trim(), quantity, unitPrice, amount: amountCents / 100, amountCents };
  });
  const subtotalCents = items.reduce((sum, i) => sum + i.amountCents, 0);
  const rate = Math.max(0, Number(taxRate) || 0);
  const taxCents = Math.round((subtotalCents * rate) / 100);
  return {
    lineItems: items.map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice, amount: i.amount })),
    subtotal: subtotalCents / 100,
    taxRate: rate,
    tax: taxCents / 100,
    total: (subtotalCents + taxCents) / 100,
  };
}

// Number format INV-YYYYMM-XXXXXX. Random suffix avoids a shared counter (clients cannot write one safely).
export function generateInvoiceNumber(date = new Date(), random = Math.random) {
  const ym = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const suffix = Math.floor(random() * 36 ** 6).toString(36).toUpperCase().padStart(6, '0');
  return `INV-${ym}-${suffix}`;
}

export const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const isOverdue = (invoice, today = new Date().toISOString().slice(0, 10)) =>
  invoice.status === 'sent' && !!invoice.dueDate && invoice.dueDate < today;

export { round2 };
