import React, { useState, useMemo } from 'react';
import { motion as Motion } from 'framer-motion';
import { ScheduleComponent, ViewsDirective, ViewDirective, Day, Week, WorkWeek, Month, Agenda, Inject, Resize, DragAndDrop } from '@syncfusion/ej2-react-schedule';
import JobManagementService from '../services/jobManagementService';
import CustomerService from '../services/customerService';
import { 
  CalendarIcon,
  ClockIcon,
  UserIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon
} from '@heroicons/react/24/outline';
import { useWorkspaceQuery, useInvalidateWorkspace } from '../hooks/useWorkspaceQuery';
import { calendarDay } from '../utils/jobSummary';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import '@syncfusion/ej2-base/styles/tailwind.css';
import '@syncfusion/ej2-buttons/styles/tailwind.css';
import '@syncfusion/ej2-popups/styles/tailwind.css';
import '@syncfusion/ej2-inputs/styles/tailwind.css';
import '@syncfusion/ej2-lists/styles/tailwind.css';
import '@syncfusion/ej2-navigations/styles/tailwind.css';
import '@syncfusion/ej2-dropdowns/styles/tailwind.css';
import '@syncfusion/ej2-splitbuttons/styles/tailwind.css';
import '@syncfusion/ej2-calendars/styles/tailwind.css';
import '@syncfusion/ej2-react-schedule/styles/tailwind.css';
import './calendar.css';
import JobFormModal from '../components/JobFormModal';
import { canManage } from '../services/tenancy';
const EMPTY=[];
const statusColors={scheduled:'#3B82F6','in-progress':'#F59E0B',completed:'#10B981',cancelled:'#EF4444','on-hold':'#8B5CF6'};
const getStatusColor=status=>statusColors[status]||'#6B7280';
const deniedJobRead=error=>workspaceAccessError(error)||/job not found|not assigned to your workspace|unauthorized to access this job/i.test(error?.message||'');

const CalendarPage = () => {
  const jobsQuery=useWorkspaceQuery(['jobs',500],()=>JobManagementService.getJobs(500));
  const customersQuery=useWorkspaceQuery(['customers',500],()=>CustomerService.getCustomers(500));
  const invalidate=useInvalidateWorkspace(),jobs=jobsQuery.data?.jobs||EMPTY,customers=customersQuery.data?.customers||EMPTY;
  const isLoading=jobsQuery.isLoading&&!jobsQuery.data;
  const [selection,setSelection]=useState(null);
  const selectedSnapshot=jobsQuery.readable&&!deniedJobRead(jobsQuery.error)&&selection?.scopeId===jobsQuery.scopeId?selection.job:null;
  const setSelectedJob=value=>setSelection(value?{scopeId:jobsQuery.scopeId,job:value}:null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [newJobScope,setNewJobScope]=useState(null);
  const showNewJob=jobsQuery.readable&&!deniedJobRead(jobsQuery.error)&&newJobScope===jobsQuery.scopeId;
  const setShowNewJob=value=>setNewJobScope(value?jobsQuery.scopeId:null);
  const [newJobDefaults, setNewJobDefaults] = useState({});
  const [today] = useState(() => new Date());

  const detailQuery=useWorkspaceQuery(['job',selectedSnapshot?.id||null],()=>JobManagementService.getJob(selectedSnapshot.id),{enabled:showJobModal&&!!selectedSnapshot});
  const latestJob=detailQuery.readable&&!deniedJobRead(detailQuery.error)?(detailQuery.data?.job||jobs.find(row=>row.id===selectedSnapshot?.id)||selectedSnapshot):null;
  const selectedJob=latestJob?{...latestJob,customer:detailQuery.data?.customer||customers.find(customer=>customer.id===latestJob.customerId)||selectedSnapshot?.customer}:null;
  const scheduleData=useMemo(()=>jobs.filter(job=>job.date).flatMap(job=>{
    const customer=customers.find(row=>row.id===job.customerId),startDate=calendarDay(job.date);
    if(!startDate)return[];
    const match=/^(\d{1,2}):([0-5]\d)(?:\s*(AM|PM))?$/i.exec(job.time||'09:00');
    if(!match)return[];
    let hour=Number(match[1]);if(match[3])hour=hour%12+(match[3].toUpperCase()==='PM'?12:0);if(hour>23)return[];
    startDate.setHours(hour,Number(match[2]),0,0);
    const endDate=new Date(startDate.getTime()+(parseFloat(job.estimatedDuration??job.duration)||2)*3600000);
    return[{Id:job.id,Subject:`${job.serviceType||'Service'} - ${customer?.name||job.customerName||'Unknown Customer'}`,StartTime:startDate,EndTime:endDate,
      Location:job.address||customer?.address||'Location TBD',Description:job.notes||'',IsAllDay:false,RecurrenceRule:'',RecurrenceID:null,RecurrenceException:'',StartTimezone:'',EndTimezone:'',CategoryColor:getStatusColor(job.status),
      JobData:{...job,customer,priority:job.priority||'medium'}}];
  }),[jobs,customers]);

  const getStatusText = (status) => {
    const statusTexts = {
      'scheduled': 'Scheduled',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'cancelled': 'Cancelled',
      'on-hold': 'On Hold'
    };
    return statusTexts[status] || 'Unknown';
  };

  const onEventClick = (args) => {
    const jobData = args.event.JobData;
    setSelectedJob(jobData);
    setShowJobModal(true);
  };

  const onCellClick = (args) => {
    args.cancel = true;
    if (!canManage()) return;
    const start = args.startTime;
    const p = (n) => String(n).padStart(2, '0');
    const isDateOnly = start.getHours() === 0 && start.getMinutes() === 0;
    setNewJobDefaults({
      date: `${start.getFullYear()}-${p(start.getMonth() + 1)}-${p(start.getDate())}`,
      time: isDateOnly ? '09:00' : `${p(start.getHours())}:${p(start.getMinutes())}`
    });
    setShowNewJob(true);
  };

  const onEventRendered = (args) => {
    // Customize event appearance based on job data
    const jobData = args.data.JobData;
    if (jobData) {
      // Add priority indicator
      if (jobData.priority === 'high') {
        args.element.style.borderLeft = '4px solid #EF4444';
      } else if (jobData.priority === 'low') {
        args.element.style.borderLeft = '4px solid #10B981';
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    return calendarDay(date)?.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })||'Date unavailable';
  };

  const formatTime = (time) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <Motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {(jobsQuery.error||customersQuery.error||(showJobModal&&detailQuery.error))&&<div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p>{jobsQuery.error?.message||customersQuery.error?.message||detailQuery.error?.message} Previously loaded events remain visible when available.</p>
        <button type="button" className="mt-2 underline" onClick={()=>Promise.all([jobsQuery.refetch(),customersQuery.refetch(),...(showJobModal&&selectedSnapshot?[detailQuery.refetch()]:[])])}>Retry calendar refresh</button>
        {showJobModal&&!selectedJob&&<button type="button" className="ml-4 underline" onClick={()=>{setShowJobModal(false);setSelectedJob(null);}}>Close unavailable job</button>}
      </div>}
      {jobsQuery.data?.hasMore&&<p role="status" className="text-sm text-amber-900">The calendar shows the first 500 loaded jobs.</p>}
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <CalendarIcon className="h-8 w-8 text-primary-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Job Calendar</h1>
              <p className="text-gray-600">View and manage your scheduled jobs in calendar format</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {canManage() && (
              <button
                onClick={() => { setNewJobDefaults({}); setShowNewJob(true); }}
                className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md text-sm font-medium hover:bg-primary-700"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                New Job
              </button>
            )}
            {/* Status Legend */}
            <div className="flex items-center space-x-4 text-sm">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                <span className="text-gray-600">Scheduled</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-amber-500 mr-2"></div>
                <span className="text-gray-600">In Progress</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span className="text-gray-600">Completed</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                <span className="text-gray-600">Cancelled</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Component */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <ScheduleComponent
          height="700px"
          selectedDate={today}
          eventSettings={{ dataSource: scheduleData }}
          eventClick={onEventClick}
          eventRendered={onEventRendered}
          cellClick={onCellClick}
          cellDoubleClick={(args) => { args.cancel = true; }}
          eventDoubleClick={(args) => { args.cancel = true; }}
          popupOpen={(args) => { if (args.type === 'Editor' || args.type === 'QuickInfo') args.cancel = true; }}
          showQuickInfo={false}
          startHour="06:00"
          endHour="21:00"
          workHours={{ highlight: true, start: '08:00', end: '17:00' }}
          allowDragAndDrop={false}
          allowResize={false}
          cssClass="custom-schedule"
        >
          <ViewsDirective>
            <ViewDirective option="Day" />
            <ViewDirective option="Week" />
            <ViewDirective option="WorkWeek" />
            <ViewDirective option="Month" />
            <ViewDirective option="Agenda" />
          </ViewsDirective>
          <Inject services={[Day, Week, WorkWeek, Month, Agenda, Resize, DragAndDrop]} />
        </ScheduleComponent>
      </div>

      {/* Job Details Modal */}
      {showJobModal && selectedJob && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Job Details</h3>
                <button
                  onClick={() => setShowJobModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-6">
                {/* Job Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xl font-semibold text-gray-900">{selectedJob.serviceType}</h4>
                    <p className="text-gray-600">{selectedJob.customer?.name || 'Unknown Customer'}</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      selectedJob.status === 'completed' ? 'bg-green-100 text-green-800' :
                      selectedJob.status === 'in-progress' ? 'bg-amber-100 text-amber-800' :
                      selectedJob.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {getStatusText(selectedJob.status)}
                    </span>
                    {selectedJob.priority === 'high' && (
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
                        High Priority
                      </span>
                    )}
                  </div>
                </div>

                {/* Job Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Date & Time */}
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <CalendarIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Date</p>
                        <p className="text-sm text-gray-600">{formatDate(selectedJob.date)}</p>
                      </div>
                    </div>
                    <div className="flex items-center">
                      <ClockIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Time</p>
                        <p className="text-sm text-gray-600">{formatTime(selectedJob.time)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Customer & Location */}
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <UserIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Customer</p>
                        <p className="text-sm text-gray-600">{selectedJob.customer?.name || 'Unknown'}</p>
                        {selectedJob.customer?.phone && (
                          <p className="text-xs text-gray-500">{selectedJob.customer.phone}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center">
                      <MapPinIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Location</p>
                        <p className="text-sm text-gray-600">{selectedJob.address || selectedJob.customer?.address || 'TBD'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Details */}
                <div className="space-y-4">
                  {selectedJob.estimatedDuration && (
                    <div className="flex items-center">
                      <ClockIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Estimated Duration</p>
                        <p className="text-sm text-gray-600">{selectedJob.estimatedDuration} hours</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedJob.totalCost && (
                    <div className="flex items-center">
                      <CurrencyDollarIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Total Cost</p>
                        <p className="text-sm text-gray-600">{formatCurrency(selectedJob.totalCost)}</p>
                      </div>
                    </div>
                  )}

                  {selectedJob.assignedTo && (
                    <div className="flex items-center">
                      <UserIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Assigned To</p>
                        <p className="text-sm text-gray-600">{selectedJob.assignedTo}</p>
                      </div>
                    </div>
                  )}

                  {selectedJob.notes && (
                    <div>
                      <p className="text-sm font-medium text-gray-900 mb-2">Notes</p>
                      <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">{selectedJob.notes}</p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t">
                  <button
                    onClick={() => setShowJobModal(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      // Navigate to job management page for editing
                      window.location.href = '/jobs';
                    }}
                    className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700"
                  >
                    <PencilIcon className="h-4 w-4 mr-2" />
                    Edit Job
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewJob && (
        <JobFormModal
          customers={customers}
          defaults={newJobDefaults}
          onClose={() => setShowNewJob(false)}
          onCreated={() => {
            setShowNewJob(false);
            invalidate(['jobs','job','customers','customer-stats']);
          }}
        />
      )}
    </Motion.div>
  );
};

export default CalendarPage;
