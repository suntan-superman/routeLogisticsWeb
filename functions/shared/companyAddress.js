function companyAddress(company = {}) {
  const clean = value => typeof value === 'string' ? value.trim() : '';
  const street = clean(company.address);
  const city = clean(company.city);
  const state = clean(company.state);
  const zip = clean(company.zipCode);
  if (!street) return [city, state, zip].filter(Boolean).join(', ');
  const lower = street.toLowerCase();
  const hasCity = city && lower.includes(city.toLowerCase());
  const hasState = state && street.split(/[\s,]+/).some(part => part.toLowerCase() === state.toLowerCase());
  const hasZip = zip && lower.includes(zip.toLowerCase());
  if (hasCity && hasState && hasZip) return street;
  const locality = [hasCity ? '' : city, hasState ? '' : state, hasZip ? '' : zip].filter(Boolean).join(' ');
  return locality ? `${street}, ${locality}` : street;
}

module.exports = { companyAddress };
