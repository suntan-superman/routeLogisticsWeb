import SelectControl from './SelectControl';
import { appointmentRecurrence, describeAppointmentRecurrence } from '../utils/appointmentRecurrence';

const field = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500';
export default function AppointmentRepeatOptions({ value, onChange, date, assignmentFallback = 'unassigned', onFallbackChange, disabled = false, company = false }) {
  const rule = appointmentRecurrence(value, date);
  return <section aria-label="Appointment repetition" className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
    <label className="block text-sm font-medium">Appointment type<SelectControl aria-label="Appointment type" className={field} disabled={disabled} value={value ? 'recurring' : 'one-time'} onChange={event => onChange(event.target.value === 'recurring' ? { frequency: 'weekly', monthlyMode: 'dayOfMonth' } : null)}><option value="one-time">One-time appointment</option><option value="recurring">Recurring appointment</option></SelectControl></label>
    {value && <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Repeat<SelectControl aria-label="Repeat frequency" className={field} disabled={disabled} value={value.frequency} onChange={event => onChange({ ...value, frequency: event.target.value })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></SelectControl></label>
        {value.frequency !== 'weekly' && <label className="block text-sm font-medium">Repeat on<SelectControl aria-label="Monthly repeat pattern" className={field} disabled={disabled} value={value.monthlyMode || 'dayOfMonth'} onChange={event => onChange({ ...value, monthlyMode: event.target.value })}><option value="dayOfMonth">Same day of the month</option><option value="weekday">Same weekday and week of the month</option></SelectControl></label>}
      </div>
      <p role="status" className="text-sm font-medium text-primary-800">{rule ? describeAppointmentRecurrence(rule) : 'Choose the first service date.'}</p>
      <p className="text-xs text-gray-600">Choose a Thursday as the first date to repeat on Thursdays. Each future visit is checked again before assignment.</p>
      {company && <label className="block text-sm font-medium">If the preferred technician is unavailable for a future visit<SelectControl aria-label="Recurring technician fallback" className={field} disabled={disabled} value={assignmentFallback} onChange={event => onFallbackChange(event.target.value)}><option value="unassigned">Flag the visit for dispatcher review</option><option value="auto">Use another available technician</option></SelectControl><span className="mt-1 block text-xs font-normal text-gray-600">The technician selected for the first appointment is preferred for future visits.</span></label>}
    </>}
  </section>;
}
