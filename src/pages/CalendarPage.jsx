import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  PencilIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import '../styles/syncfusion.css';

const CalendarPage = () => {
  const [scheduleData, setScheduleData] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showJobModal, setShowJobModal] = useState(false);

  useEffect(() => {
    loadJobsAndCustomers();
  }, []);

  const loadJobsAndCustomers = async () => {
    setIsLoading(true);
    try {
      const [jobsResult, customersResult] = await Promise.all([
        JobManagementService.getJobs(),
        CustomerService.getCustomers()
      ]);

      if (jobsResult.success && customersResult.success) {
        const jobs = jobsResult.jobs;
        const customersData = customersResult.customers;

        // Transform jobs data for Syncfusion Schedule
        const scheduleEvents = jobs.map(job => {
          const customer = customersData.find(c => c.id === job.customerId);
          
          // Parse date and time with proper timezone handling
          const [year, month, day] = job.date.split('-').map(Number);
          const [hours, minutes] = (job.time || '09:00').split(':').map(Number);
          const startDate = new Date(year, month - 1, day, hours, minutes);
          
          // Use job.duration first, fallback to estimatedDuration, then default to 1 hour
          const durationHours = parseFloat(job.duration) || parseFloat(job.estimatedDuration) || 1;
          const endDate = new Date(startDate.getTime() + durationHours * 60 * 60 * 1000);

          return {
            Id: job.id,
            Subject: `${job.serviceType} - ${job.customerName || customer?.name || 'Unknown Customer'}`,
            StartTime: startDate,
            EndTime: endDate,
            Location: job.address || customer?.address || 'Location TBD',
            Description: job.notes || '',
            IsAllDay: false,
            RecurrenceRule: '',
            RecurrenceID: null,
            RecurrenceException: '',
            StartTimezone: '',
            EndTimezone: '',
            CategoryColor: getStatusColor(job.status),
            // Custom fields for job data
            JobData: {
              ...job,
              customer: customer,
              customerName: job.customerName,
              customerPhone: job.customerPhone,
              address: job.address,
              duration: job.duration,
              status: job.status,
              totalCost: job.totalCost || job.estimatedCost,
              estimatedDuration: job.estimatedDuration || job.duration,
              actualHours: job.actualHours,
              assignedTo: job.assignedTo,
              assignedToName: job.assignedToName,
              priority: job.priority || 'medium'
            }
          };
        });

        setScheduleData(scheduleEvents);
        setCustomers(customersData);
      } else {
        toast.error('Failed to load jobs and customers');
      }
    } catch (error) {
      console.error('Error loading jobs and customers:', error);
      toast.error('Error loading calendar data');
    }
    setIsLoading(false);
  };

  const getStatusColor = (status) => {
    const colors = {
      'scheduled': '#3B82F6', // Blue
      'in-progress': '#F59E0B', // Amber
      'completed': '#10B981', // Green
      'cancelled': '#EF4444', // Red
      'on-hold': '#8B5CF6' // Purple
    };
    return colors[status] || '#6B7280'; // Gray default
  };

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
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <ScheduleComponent
          height="650px"
          selectedDate={new Date()}
          eventSettings={{ dataSource: scheduleData }}
          eventClick={onEventClick}
          eventRendered={onEventRendered}
          showQuickInfo={true}
          enableAdaptiveUI={true}
          allowDragAndDrop={false}
          allowResizing={false}
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
                    <p className="text-gray-600">{selectedJob.customerName || selectedJob.customer?.name || 'Unknown Customer'}</p>
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
                        <p className="text-sm text-gray-600">{selectedJob.customerName || selectedJob.customer?.name || 'Unknown'}</p>
                        {(selectedJob.customerPhone || selectedJob.customer?.phone) && (
                          <p className="text-xs text-gray-500">{selectedJob.customerPhone || selectedJob.customer.phone}</p>
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
                  {(selectedJob.duration || selectedJob.estimatedDuration) && (
                    <div className="flex items-center">
                      <ClockIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Duration</p>
                        <p className="text-sm text-gray-600">{selectedJob.duration || selectedJob.estimatedDuration} hour{(selectedJob.duration || selectedJob.estimatedDuration) != 1 ? 's' : ''}</p>
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

                  {(selectedJob.assignedToName || selectedJob.assignedTo) && (
                    <div className="flex items-center">
                      <UserIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Assigned To</p>
                        <p className="text-sm text-gray-600">{selectedJob.assignedToName || selectedJob.assignedTo}</p>
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
    </motion.div>
  );
};

export default CalendarPage;
