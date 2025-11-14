import React, { useState, useEffect } from 'react';
import { useCustomerPortal } from '../../contexts/CustomerPortalContext';
import { useAuthSafe } from '../../contexts/AuthContext';
import CustomerPortalService from '../../services/customerPortalService';
import { 
  CalendarIcon, 
  ClockIcon, 
  MapPinIcon,
  StarIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const JobsPage = () => {
  const { customer, selectedCompanyId } = useCustomerPortal();
  const authContext = useAuthSafe();
  const currentUser = authContext?.currentUser || null;
  const userProfile = authContext?.userProfile || null;
  
  // Use customer from CustomerPortalContext if available, otherwise use userProfile from AuthContext
  const customerData = customer || (userProfile?.role === 'customer' ? userProfile : null);
  const effectiveCompanyId = selectedCompanyId || userProfile?.companyId;
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Load jobs on mount or when filters change
  useEffect(() => {
    if (customerData?.id) {
      loadJobs();
    }
  }, [effectiveCompanyId, statusFilter, customerData?.id]);

  const loadJobs = async () => {
    if (!customerData?.id) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await CustomerPortalService.getCustomerJobs(
        customerData.id,
        effectiveCompanyId,
        statusFilter === 'all' ? null : statusFilter
      );

      if (result.success) {
        setJobs(result.jobs);
      } else {
        setError(result.error || 'Failed to load jobs');
        toast.error(result.error || 'Failed to load jobs');
      }
    } catch (err) {
      console.error('Error loading jobs:', err);
      setError('An error occurred while loading jobs');
      toast.error('An error occurred while loading jobs');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter jobs by search term
  const filteredJobs = jobs.filter(job => {
    const searchLower = searchTerm.toLowerCase();
    return (
      (job.serviceType && job.serviceType.toLowerCase().includes(searchLower)) ||
      (job.customerName && job.customerName.toLowerCase().includes(searchLower))
    );
  });

  const handleJobClick = (job) => {
    setSelectedJob(job);
    setShowDetailsModal(true);
  };

  const getStatusColor = (status) => {
    const colors = {
      scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
      'in-progress': 'bg-yellow-50 text-yellow-700 border-yellow-200',
      'in_progress': 'bg-yellow-50 text-yellow-700 border-yellow-200',
      completed: 'bg-green-50 text-green-700 border-green-200',
      cancelled: 'bg-red-50 text-red-700 border-red-200'
    };
    return colors[status] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const getStatusBadgeText = (status) => {
    const text = {
      scheduled: '📅 Scheduled',
      'in-progress': '⏳ In Progress',
      'in_progress': '⏳ In Progress',
      completed: '✅ Completed',
      cancelled: '❌ Cancelled'
    };
    return text[status] || status;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Your Jobs</h1>
        <p className="mt-1 text-sm text-gray-600">
          View and manage all your service appointments
        </p>
      </div>

      {/* No Company Warning */}
      {!effectiveCompanyId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-yellow-900">No Service Company Associated</h3>
            <p className="mt-1 text-sm text-yellow-700">
              You haven't been associated with a service company yet. Once a company adds you as a customer, your jobs will appear here.
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
        {/* Search */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Search Jobs
          </label>
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by service type or customer..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
            />
          </div>
        </div>

        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Filter by Status
          </label>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all', label: 'All Jobs' },
              { value: 'scheduled', label: '📅 Scheduled' },
              { value: 'in-progress', label: '⏳ In Progress' },
              { value: 'completed', label: '✅ Completed' },
              { value: 'cancelled', label: '❌ Cancelled' }
            ].map(option => (
              <button
                key={option.value}
                onClick={() => setStatusFilter(option.value)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  statusFilter === option.value
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="inline-block">
              <div className="w-12 h-12 border-4 border-green-200 border-t-green-600 rounded-full animate-spin" />
            </div>
            <p className="mt-4 text-gray-600 font-medium">Loading your jobs...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700 font-medium">{error}</p>
          <button
            onClick={loadJobs}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && filteredJobs.length === 0 && (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <CalendarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No jobs found</h3>
          <p className="text-gray-600 mb-4">
            {searchTerm
              ? 'Try adjusting your search terms'
              : 'You don\'t have any jobs in this category yet'}
          </p>
        </div>
      )}

      {/* Jobs List */}
      {!isLoading && !error && filteredJobs.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Showing {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''}
          </p>
          <div className="grid gap-4">
            {filteredJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                onViewDetails={() => handleJobClick(job)}
                getStatusColor={getStatusColor}
                getStatusBadgeText={getStatusBadgeText}
              />
            ))}
          </div>
        </div>
      )}

      {/* Job Details Modal */}
      {showDetailsModal && selectedJob && (
        <JobDetailsModal
          job={selectedJob}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedJob(null);
          }}
          getStatusColor={getStatusColor}
          getStatusBadgeText={getStatusBadgeText}
        />
      )}
    </div>
  );
};

/**
 * Job Card Component
 */
function JobCard({ job, onViewDetails, getStatusColor, getStatusBadgeText }) {
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  return (
    <button
      onClick={onViewDetails}
      className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg hover:border-gray-300 transition-all text-left"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{job.serviceType}</h3>
          <p className="text-sm text-gray-600 mt-1">{job.customerName}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(job.status)}`}>
          {getStatusBadgeText(job.status)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 flex-shrink-0" />
          <span>{formatDate(job.scheduledDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <ClockIcon className="w-4 h-4 flex-shrink-0" />
          <span>{job.scheduledTime}</span>
        </div>
        {job.rating && (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <StarIcon
                key={i}
                className={`w-4 h-4 ${i < job.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-gray-500">
        Click to view details
      </div>
    </button>
  );
}

/**
 * Job Details Modal Component
 */
function JobDetailsModal({ job, onClose, getStatusColor, getStatusBadgeText }) {
  const [submittingRating, setSubmittingRating] = useState(false);
  const [rating, setRating] = useState(job.rating || 0);
  const [review, setReview] = useState(job.review || '');

  const handleSubmitRating = async () => {
    if (!rating) {
      toast.error('Please select a rating');
      return;
    }

    setSubmittingRating(true);
    try {
      // TODO: Call Cloud Function to submit rating
      toast.success('Thank you for your rating!');
      onClose();
    } catch (error) {
      toast.error('Failed to submit rating');
    } finally {
      setSubmittingRating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">{job.serviceType}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status and Customer */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Status</h3>
              <p className={`mt-2 px-3 py-1 rounded-full text-sm font-medium border inline-block ${getStatusColor(job.status)}`}>
                {getStatusBadgeText(job.status)}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Customer</h3>
              <p className="mt-2 text-lg font-medium text-gray-900">{job.customerName}</p>
            </div>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <CalendarIcon className="w-4 h-4" /> Date
              </h3>
              <p className="mt-2 text-lg text-gray-900">
                {new Date(job.scheduledDate).toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <ClockIcon className="w-4 h-4" /> Time
              </h3>
              <p className="mt-2 text-lg text-gray-900">{job.scheduledTime}</p>
            </div>
          </div>

          {/* Duration & Location */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Duration</h3>
              <p className="mt-2 text-lg text-gray-900">{job.estimatedDuration} hours</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide flex items-center gap-2">
                <MapPinIcon className="w-4 h-4" /> Location
              </h3>
              <p className="mt-2 text-lg text-gray-900">{job.customerAddress || 'TBD'}</p>
            </div>
          </div>

          {/* Notes */}
          {job.notes && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Notes</h3>
              <p className="mt-2 text-gray-900 whitespace-pre-line">{job.notes}</p>
            </div>
          )}

          {/* Completion Notes */}
          {job.completionNotes && (
            <div>
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide">What Was Done</h3>
              <p className="mt-2 text-gray-900 whitespace-pre-line">{job.completionNotes}</p>
            </div>
          )}

          {/* Technician Info */}
          {job.technician && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">Technician</h3>
              <div className="flex items-center gap-3">
                {job.technician.photoURL && (
                  <img
                    src={job.technician.photoURL}
                    alt={job.technician.name}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-medium text-gray-900">{job.technician.name || 'Technician'}</p>
                  {job.technician.phone && (
                    <a
                      href={`tel:${job.technician.phone}`}
                      className="text-sm text-green-600 hover:text-green-700"
                    >
                      {job.technician.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rating Section - Only show for completed jobs without rating */}
          {job.status === 'completed' && !job.rating && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3">How was your service?</h3>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      onClick={() => setRating(star)}
                      className="transition-transform hover:scale-110"
                    >
                      <StarIcon
                        className={`w-8 h-8 ${
                          star <= rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <textarea
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                  placeholder="Share your feedback (optional)..."
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 text-sm"
                />
                <button
                  onClick={handleSubmitRating}
                  disabled={submittingRating || !rating}
                  className="w-full bg-green-600 text-white font-medium py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {submittingRating ? 'Submitting...' : 'Submit Rating'}
                </button>
              </div>
            </div>
          )}

          {/* Display Existing Rating */}
          {job.rating && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Your Rating</h3>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <StarIcon
                      key={i}
                      className={`w-5 h-5 ${i < job.rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-600">{job.rating}/5</span>
              </div>
              {job.review && (
                <p className="mt-2 text-gray-700 text-sm">{job.review}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default JobsPage;

