import { useState } from 'react';
import { usePrincipalQuery } from '../hooks/usePrincipalQuery';
import { auth } from '../services/firebase';
import { callWorkspace } from '../services/workspaceApi';

const labels = {
  totalCustomers: 'Customers', activeCustomers: 'Active customers', inactiveCustomers: 'Inactive customers',
  servicedCustomers90Days: 'Serviced in 90 days', distinctServiceProperties: 'Service properties',
  multiPropertyCustomers: 'Multi-property customers', activeTechnicians: 'Active technicians',
  completedVisits30Days: 'Completed visits · 30 days',
};
const current = uid => auth.currentUser?.uid === uid && auth.currentUser.emailVerified === true;
export function UsageMetrics({ metrics, compact = false }) {
  if (!metrics) return null;
  return <>
    <dl className={`grid gap-3 ${compact ? 'sm:grid-cols-3 lg:grid-cols-6' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
      {Object.entries(labels).map(([key, label]) => <div key={key} className="rounded-xl border border-gray-200 bg-white p-4"><dt className="text-sm text-gray-600">{label}</dt><dd className="mt-1 text-2xl font-semibold text-primary-800">{metrics[key]?.toLocaleString() ?? '—'}</dd></div>)}
    </dl>
    {!compact && <div className="mt-4 grid gap-4 rounded-xl border border-gray-200 bg-white p-5 text-sm sm:grid-cols-2"><p>Average properties per customer: <strong>{metrics.averagePropertiesPerCustomer}</strong></p><p>Most properties for one customer: <strong>{metrics.maxPropertiesPerCustomer}</strong></p><p>Prospects: <strong>{metrics.prospectCustomers}</strong> · Legacy status not classified: <strong>{metrics.unclassifiedCustomers}</strong></p><p>Property records within this provider: <strong>{metrics.providerPropertyRecords}</strong></p><div className="sm:col-span-2"><h3 className="font-semibold">Customers by number of properties</h3><p className="mt-1">None: {metrics.propertyDistribution?.none || 0} · One: {metrics.propertyDistribution?.one || 0} · Two: {metrics.propertyDistribution?.two || 0} · Three or more: {metrics.propertyDistribution?.threeOrMore || 0}</p></div></div>}
  </>;
}

export default function CompanyUsage({ uid }) {
  const [selected, setSelected] = useState('');
  const overview = usePrincipalQuery('rl-platform-usage', uid, [], () => callWorkspace('rlCompanyUsage', { action: 'platform' }), { current, intervalMs: false, staleTime: 300000, refetchOnFocus: false });
  const detail = usePrincipalQuery('rl-platform-usage-detail', uid, [selected], () => callWorkspace('rlCompanyUsage', { action: 'detail', companyId: selected }), { current, enabled: !!selected, intervalMs: false, staleTime: 300000, refetchOnFocus: false });
  return <section className="space-y-5" aria-label="Company usage">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold">Company usage</h1><p className="mt-1 text-gray-600">On-demand, tenant-scoped snapshot for pricing analysis. No subscription limits are applied.</p></div><button type="button" className="btn-secondary" onClick={() => { overview.refetch(); if (selected) detail.refetch(); }}>Refresh usage</button></div>
    {overview.isPending && <p role="status">Calculating usage…</p>}{overview.error && <p role="alert">{overview.error.message}</p>}
    {overview.data && <><p className="text-xs text-gray-500">Calculated {new Date(overview.data.calculatedAt).toLocaleString()}. Platform property totals add provider-specific physical locations; shared addresses across companies remain separate.</p><UsageMetrics metrics={overview.data.totals} compact />
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b bg-gray-50"><tr>{['Company', 'Customers', 'Properties', 'Properties/customer', 'Active technicians', 'Visits · 30 days', 'Multi-property'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{overview.data.items.map(({ company, metrics }) => <tr key={company.id} className="border-b last:border-0"><td className="p-3"><button type="button" className="font-semibold text-primary-700 underline" onClick={() => setSelected(company.id)}>{company.name}</button></td><td className="p-3">{metrics.totalCustomers}</td><td className="p-3">{metrics.distinctServiceProperties}</td><td className="p-3">{metrics.averagePropertiesPerCustomer}</td><td className="p-3">{metrics.activeTechnicians}</td><td className="p-3">{metrics.completedVisits30Days}</td><td className="p-3">{metrics.multiPropertyCustomers}</td></tr>)}</tbody></table></div></>}
    {selected && <section className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-5" aria-label="Selected company usage"><div className="flex justify-between"><h2 className="text-xl font-semibold">{detail.data?.company.name || 'Company details'}</h2><button type="button" className="text-primary-700 underline" onClick={() => setSelected('')}>Close details</button></div>{detail.isPending && <p role="status">Loading company usage…</p>}{detail.error && <p role="alert">{detail.error.message}</p>}{detail.data && <><UsageMetrics metrics={detail.data.metrics} /><h3 className="font-semibold">Completed service visits by month</h3><div className="flex flex-wrap gap-2">{Object.entries(detail.data.metrics.monthlyVisits).sort(([a], [b]) => b.localeCompare(a)).slice(0, 6).map(([month, count]) => <span key={month} className="rounded border bg-white px-3 py-2">{month}: <strong>{count}</strong></span>)}{!Object.keys(detail.data.metrics.monthlyVisits).length && <p>No completed service visits have a recorded completion date.</p>}</div></>}</section>}
    <p className="text-xs text-gray-500">Only completed service jobs with a recorded completion timestamp count as recent visits. Legacy customers without explicit lifecycle status are listed separately. Locations are deduplicated by normalized address and unit within each provider.</p>
  </section>;
}
