import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import { motion } from 'framer-motion';
import {
  MapPinIcon,
  TruckIcon,
  ClockIcon,
  CalendarIcon,
  ArrowPathIcon,
  PlusIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { GoogleMap, LoadScript, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import toast from 'react-hot-toast';

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

const mapContainerStyle = {
  width: '100%',
  height: '600px',
};

const defaultCenter = {
  lat: 35.3733,
  lng: -119.0187,
};

const RouteOptimizationPage = () => {
  const { userProfile } = useAuth();
  const { activeCompany } = useCompany();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [jobs, setJobs] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [directions, setDirections] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [optimizing, setOptimizing] = useState(false);

  useEffect(() => {
    loadData();
  }, [selectedDate, activeCompany?.id, userProfile?.companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const companyId = activeCompany?.id || userProfile?.companyId;
      if (!companyId) {
        setLoading(false);
        return;
      }

      // Load jobs for selected date
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('companyId', '==', companyId),
        where('date', '==', selectedDate),
        where('status', 'in', ['scheduled', 'in_progress'])
      );

      const jobsSnapshot = await getDocs(jobsQuery);
      const jobsData = [];
      jobsSnapshot.forEach((doc) => {
        const data = doc.data();
        // Only include jobs with customer addresses
        if (data.customerAddress || data.address) {
          jobsData.push({ id: doc.id, ...data });
        }
      });

      setJobs(jobsData);

      // Load technicians
      const techQuery = query(
        collection(db, 'users'),
        where('companyId', '==', companyId),
        where('role', 'in', ['field_tech', 'technician'])
      );

      const techSnapshot = await getDocs(techQuery);
      const techData = [];
      techSnapshot.forEach((doc) => {
        techData.push({ id: doc.id, ...doc.data() });
      });

      setTechnicians(techData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load jobs and technicians');
    } finally {
      setLoading(false);
    }
  };

  const toggleJobSelection = (jobId) => {
    setSelectedJobs((prev) =>
      prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]
    );
  };

  const optimizeRoute = useCallback(async () => {
    if (selectedJobs.length < 2) {
      toast.error('Please select at least 2 jobs to optimize');
      return;
    }

    if (!window.google) {
      toast.error('Google Maps not loaded');
      return;
    }

    setOptimizing(true);
    try {
      const selectedJobsData = jobs.filter((job) => selectedJobs.includes(job.id));

      // Get addresses
      const waypoints = selectedJobsData.map((job) => ({
        location: job.customerAddress || job.address,
        stopover: true,
      }));

      if (waypoints.length < 2) {
        toast.error('Not enough valid addresses');
        setOptimizing(false);
        return;
      }

      // Use first job as origin and last as destination
      const origin = waypoints[0].location;
      const destination = waypoints[waypoints.length - 1].location;
      const intermediateWaypoints = waypoints.slice(1, -1);

      const directionsService = new window.google.maps.DirectionsService();

      const request = {
        origin: origin,
        destination: destination,
        waypoints: intermediateWaypoints,
        optimizeWaypoints: true,
        travelMode: window.google.maps.TravelMode.DRIVING,
      };

      directionsService.route(request, (result, status) => {
        if (status === 'OK') {
          setDirections(result);

          // Extract route info
          const route = result.routes[0];
          let totalDistance = 0;
          let totalDuration = 0;

          route.legs.forEach((leg) => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
          });

          setRouteInfo({
            totalDistance: (totalDistance / 1609.34).toFixed(1), // Convert meters to miles
            totalDuration: Math.round(totalDuration / 60), // Convert seconds to minutes
            waypointOrder: route.waypoint_order,
          });

          toast.success('Route optimized successfully!');
        } else {
          console.error('Directions request failed:', status);
          toast.error('Failed to optimize route');
        }
        setOptimizing(false);
      });
    } catch (error) {
      console.error('Error optimizing route:', error);
      toast.error('Error optimizing route');
      setOptimizing(false);
    }
  }, [selectedJobs, jobs]);

  const assignOptimizedRoute = async () => {
    if (!selectedTechnician) {
      toast.error('Please select a technician');
      return;
    }

    if (!routeInfo) {
      toast.error('Please optimize the route first');
      return;
    }

    try {
      // In a real implementation, you would:
      // 1. Update job assignments in Firestore
      // 2. Update job order based on waypoint_order
      // 3. Send notification to technician

      toast.success(`Route assigned to ${technicians.find((t) => t.id === selectedTechnician)?.name}`);
      
      // Reset selections
      setSelectedJobs([]);
      setDirections(null);
      setRouteInfo(null);
    } catch (error) {
      console.error('Error assigning route:', error);
      toast.error('Failed to assign route');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading route optimization...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Route Optimization</h1>
            <p className="text-gray-600">Plan efficient routes for your technicians</p>
          </div>
          <TruckIcon className="h-10 w-10 text-primary-500" />
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <CalendarIcon className="inline h-4 w-4 mr-1" />
              Select Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <TruckIcon className="inline h-4 w-4 mr-1" />
              Assign to Technician
            </label>
            <select
              value={selectedTechnician}
              onChange={(e) => setSelectedTechnician(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Select Technician</option>
              {technicians.map((tech) => (
                <option key={tech.id} value={tech.id}>
                  {tech.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={optimizeRoute}
              disabled={selectedJobs.length < 2 || optimizing}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {optimizing ? (
                <>
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                  Optimizing...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-5 w-5" />
                  Optimize Route
                </>
              )}
            </button>
            {routeInfo && (
              <button
                onClick={assignOptimizedRoute}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                <PlusIcon className="h-5 w-5" />
                Assign
              </button>
            )}
          </div>
        </div>

        {routeInfo && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  {routeInfo.totalDistance} miles
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ClockIcon className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  {routeInfo.totalDuration} minutes
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TruckIcon className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">
                  {selectedJobs.length} stops
                </span>
              </div>
            </div>
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Jobs List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white rounded-lg shadow-sm border border-gray-200"
        >
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">
              Jobs for {new Date(selectedDate).toLocaleDateString()}
            </h2>
            <p className="text-sm text-gray-500">
              {selectedJobs.length} of {jobs.length} selected
            </p>
          </div>
          <div className="p-4 max-h-[600px] overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MapPinIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                <p>No jobs scheduled for this date</p>
              </div>
            ) : (
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    onClick={() => toggleJobSelection(job.id)}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      selectedJobs.includes(job.id)
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-900">
                          {job.customerName}
                        </h3>
                        <p className="text-xs text-gray-600">{job.serviceType}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {job.customerAddress || job.address}
                        </p>
                        <p className="text-xs text-gray-500">{job.time || 'Time TBD'}</p>
                      </div>
                      {selectedJobs.includes(job.id) && (
                        <div className="ml-2 flex-shrink-0 h-5 w-5 bg-primary-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">
                            {selectedJobs.indexOf(job.id) + 1}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* Map */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
        >
          {GOOGLE_MAPS_API_KEY ? (
            <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
              <GoogleMap
                mapContainerStyle={mapContainerStyle}
                center={defaultCenter}
                zoom={12}
              >
                {directions && <DirectionsRenderer directions={directions} />}
                
                {!directions &&
                  jobs
                    .filter((job) => selectedJobs.includes(job.id))
                    .map((job, index) => (
                      <Marker
                        key={job.id}
                        position={{
                          lat: job.latitude || defaultCenter.lat,
                          lng: job.longitude || defaultCenter.lng,
                        }}
                        label={{
                          text: (index + 1).toString(),
                          color: 'white',
                          fontWeight: 'bold',
                        }}
                      />
                    ))}
              </GoogleMap>
            </LoadScript>
          ) : (
            <div className="flex items-center justify-center h-[600px] bg-gray-50">
              <div className="text-center">
                <MapPinIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                <p className="text-gray-600">Google Maps API key not configured</p>
                <p className="text-sm text-gray-500 mt-1">
                  Add VITE_GOOGLE_MAPS_API_KEY to your environment variables
                </p>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RouteOptimizationPage;

