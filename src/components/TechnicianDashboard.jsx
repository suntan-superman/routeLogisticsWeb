import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  WrenchScrewdriverIcon
} from '@heroicons/react/24/outline';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const TechnicianDashboard = ({ userProfile }) => {
  const [loading, setLoading] = useState(true);
  const [todayJobs, setTodayJobs] = useState([]);
  const [upcomingJobs, setUpcomingJobs] = useState([]);
  const [stats, setStats] = useState({
    todayTotal: 0,
    todayCompleted: 0,
    weekTotal: 0,
    weekCompleted: 0
  });

  useEffect(() => {
    if (!userProfile?.id) return;

    const loadTechnicianData = async () => {
      setLoading(true);
      try {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        // Get start of week (Sunday)
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        const startOfWeekStr = startOfWeek.toISOString().split('T')[0];
        
        // Get end of week (Saturday)
        const endOfWeek = new Date(today);
        endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
        const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

        // Query jobs assigned to this technician
        const jobsQuery = query(
          collection(db, 'jobs'),
          where('assignedTo', '==', userProfile.id),
          where('date', '>=', todayStr),
          where('date', '<=', endOfWeekStr)
        );

        const jobsSnapshot = await getDocs(jobsQuery);
        const jobs = [];
        
        jobsSnapshot.forEach((doc) => {
          jobs.push({ id: doc.id, ...doc.data() });
        });

        // Sort by date and time
        jobs.sort((a, b) => {
          const dateCompare = a.date.localeCompare(b.date);
          if (dateCompare !== 0) return dateCompare;
          return (a.time || '').localeCompare(b.time || '');
        });

        // Separate today's jobs from upcoming
        const today_jobs = jobs.filter(job => job.date === todayStr);
        const upcoming_jobs = jobs.filter(job => job.date > todayStr);

        // Calculate stats
        const weekJobs = jobs;
        const todayCompletedCount = today_jobs.filter(j => j.status === 'completed').length;
        const weekCompletedCount = weekJobs.filter(j => j.status === 'completed').length;

        setTodayJobs(today_jobs);
        setUpcomingJobs(upcoming_jobs.slice(0, 5)); // Show next 5
        setStats({
          todayTotal: today_jobs.length,
          todayCompleted: todayCompletedCount,
          weekTotal: weekJobs.length,
          weekCompleted: weekCompletedCount
        });
      } catch (error) {
        console.error('Error loading technician data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTechnicianData();
  }, [userProfile?.id]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'scheduled':
        return 'Scheduled';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status || 'Unknown';
    }
  };

  const formatTime = (time) => {
    if (!time) return 'Time TBD';
    // If time is in HH:MM format, convert to 12-hour
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading your schedule...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="h-12 w-12 bg-primary-500 rounded-lg flex items-center justify-center">
              <WrenchScrewdriverIcon className="h-7 w-7 text-white" />
            </div>
          </div>
          <div className="ml-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Welcome back, {userProfile?.name || 'Technician'}!
            </h1>
            <p className="text-gray-600">
              {stats.todayTotal > 0 
                ? `You have ${stats.todayTotal} job${stats.todayTotal !== 1 ? 's' : ''} scheduled today`
                : 'No jobs scheduled for today'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CalendarIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Today's Jobs
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.todayTotal}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Completed Today
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.todayCompleted}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ClockIcon className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    This Week
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.weekTotal}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircleIcon className="h-6 w-6 text-green-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">
                    Week Completed
                  </dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.weekCompleted}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Today's Schedule */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Today's Schedule</h2>
          <p className="text-sm text-gray-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
        <div className="p-6">
          {todayJobs.length === 0 ? (
            <div className="text-center py-8">
              <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No jobs scheduled</h3>
              <p className="mt-1 text-sm text-gray-500">
                Enjoy your day off or check back later for updates.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {todayJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <ClockIcon className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{formatTime(job.time)}</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}>
                          {getStatusLabel(job.status)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <h3 className="text-sm font-medium text-gray-900">{job.customerName || 'Unknown Customer'}</h3>
                        <p className="text-sm text-gray-600">{job.serviceType || 'Service'}</p>
                        {job.notes && (
                          <p className="mt-1 text-sm text-gray-500 line-clamp-2">{job.notes}</p>
                        )}
                      </div>
                      {job.estimatedCost && (
                        <div className="mt-2 text-sm text-gray-600">
                          Estimated: ${Number(job.estimatedCost).toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="ml-4">
                      <MapPinIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </motion.div>

      {/* Upcoming Jobs */}
      {upcomingJobs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Upcoming Jobs</h2>
            <p className="text-sm text-gray-500">
              Next scheduled appointments
            </p>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              {upcomingJobs.map((job) => (
                <Link
                  key={job.id}
                  to={`/jobs/${job.id}`}
                  className="block border border-gray-200 rounded-lg p-4 hover:border-primary-300 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="h-5 w-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{formatDate(job.date)}</span>
                        <span className="text-sm text-gray-600">{formatTime(job.time)}</span>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(job.status)}`}>
                          {getStatusLabel(job.status)}
                        </span>
                      </div>
                      <div className="mt-2">
                        <h3 className="text-sm font-medium text-gray-900">{job.customerName || 'Unknown Customer'}</h3>
                        <p className="text-sm text-gray-600">{job.serviceType || 'Service'}</p>
                      </div>
                    </div>
                    <div className="ml-4">
                      <MapPinIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 text-center">
              <Link
                to="/jobs"
                className="text-sm font-medium text-primary-600 hover:text-primary-500"
              >
                View all jobs →
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Quick Actions for Technicians */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200"
      >
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Quick Actions</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              to="/jobs"
              className="group relative rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg p-3 bg-blue-500">
                  <CalendarIcon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
                    View All Jobs
                  </h3>
                  <p className="text-sm text-gray-500">
                    See your complete schedule
                  </p>
                </div>
              </div>
            </Link>

            <Link
              to="/customers"
              className="group relative rounded-lg border border-gray-200 bg-white p-6 hover:shadow-md transition-shadow duration-200"
            >
              <div className="flex items-center">
                <div className="flex-shrink-0 rounded-lg p-3 bg-green-500">
                  <MapPinIcon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-4">
                  <h3 className="text-sm font-medium text-gray-900 group-hover:text-primary-600 transition-colors duration-200">
                    Customer Locations
                  </h3>
                  <p className="text-sm text-gray-500">
                    View customer addresses
                  </p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default TechnicianDashboard;

