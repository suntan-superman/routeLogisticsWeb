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
import { GoogleMap, useJsApiLoader, Marker, DirectionsRenderer } from '@react-google-maps/api';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import toast from 'react-hot-toast';
import { GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LIBRARIES, DEFAULT_MAP_CENTER } from '../constants/googleMaps';

const mapContainerStyle = {
  width: '100%',
  height: '600px',
};

const RouteOptimizationPage = () => {
  const { userProfile } = useAuth();
  const { activeCompany } = useCompany();
  
  // Load Google Maps API
  const { isLoaded: isMapsLoaded, loadError: mapsLoadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES
  });
  
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [jobs, setJobs] = useState([]);
  const [selectedJobs, setSelectedJobs] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [selectedTechnician, setSelectedTechnician] = useState('');
  const [directions, setDirections] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [optimizing, setOptimizing] = useState(false);
  const [showSaveRouteModal, setShowSaveRouteModal] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [showLoadRouteModal, setShowLoadRouteModal] = useState(false);
  const [savingRoute, setSavingRoute] = useState(false);
  const [loadingRoutes, setLoadingRoutes] = useState(false);
  const [templateRoutes, setTemplateRoutes] = useState([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateTargetDate, setTemplateTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

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

    if (!isMapsLoaded || !window.google || !window.google.maps) {
      toast.error('Google Maps not loaded. Please wait for maps to load.');
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
        waypoints: intermediateWaypoints.length > 0 ? intermediateWaypoints : undefined,
        optimizeWaypoints: intermediateWaypoints.length > 0,
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
      toast.error('Error optimizing route: ' + (error.message || 'Unknown error'));
      setOptimizing(false);
    }
  }, [selectedJobs, jobs, isMapsLoaded]);

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

  const handleSaveRoute = async () => {
    if (!routeInfo || selectedJobs.length === 0) {
      toast.error('Please optimize a route first before saving');
      return;
    }

    if (!routeName.trim()) {
      toast.error('Please enter a route name');
      return;
    }

    setSavingRoute(true);
    try {
      const selectedTechnicianData = technicians.find((t) => t.id === selectedTechnician);
      
      const result = await RouteService.saveRoute({
        name: routeName.trim(),
        date: selectedDate,
        technicianId: selectedTechnician || null,
        technicianName: selectedTechnicianData?.name || null,
        jobIds: selectedJobs,
        routeInfo,
        directions,
        isTemplate: saveAsTemplate
      });

      if (result.success) {
        toast.success(saveAsTemplate ? 'Route template saved successfully!' : 'Route saved successfully!');
        setShowSaveRouteModal(false);
        setRouteName('');
        setSaveAsTemplate(false);
      } else {
        toast.error(result.error || 'Failed to save route');
      }
    } catch (error) {
      console.error('Error saving route:', error);
      toast.error('Failed to save route: ' + (error.message || 'Unknown error'));
    } finally {
      setSavingRoute(false);
    }
  };

  const loadSavedRoutes = async () => {
    setLoadingRoutes(true);
    try {
      const result = await RouteService.getRoutes(null, {
        templatesOnly: false
      });

      if (result.success) {
        setSavedRoutes(result.routes || []);
        setShowLoadRouteModal(true);
      } else {
        toast.error(result.error || 'Failed to load routes');
      }
    } catch (error) {
      console.error('Error loading routes:', error);
      toast.error('Failed to load routes: ' + (error.message || 'Unknown error'));
    } finally {
      setLoadingRoutes(false);
    }
  };

  const handleLoadRoute = async (routeId) => {
    try {
      const result = await RouteService.loadRoute(routeId);

      if (result.success && result.jobs) {
        // Filter jobs that still exist and have valid addresses
        const validJobs = result.jobs.filter(
          (job) => job && (job.customerAddress || job.address)
        );

        if (validJobs.length === 0) {
          toast.error('No valid jobs found in this route');
          return;
        }

        // Set the selected jobs
        setSelectedJobs(validJobs.map((job) => job.id));
        
        // Set the route date if it exists
        if (result.route.date) {
          setSelectedDate(result.route.date);
        }

        // Set the technician if it exists
        if (result.route.technicianId) {
          setSelectedTechnician(result.route.technicianId);
        }

        // Close the modal
        setShowLoadRouteModal(false);

        // Re-optimize the route with the loaded jobs
        // Wait a bit for state to update
        setTimeout(() => {
          toast.success(`Loaded route: ${result.route.name}`);
          // The user can now click "Optimize Route" to regenerate the directions
        }, 300);
      } else {
        toast.error(result.error || 'Failed to load route');
      }
    } catch (error) {
      console.error('Error loading route:', error);
      toast.error('Failed to load route: ' + (error.message || 'Unknown error'));
    }
  };

  const handleDeleteRoute = async (routeId, routeName) => {
    if (!confirm(`Are you sure you want to delete "${routeName}"?`)) {
      return;
    }

    try {
      const result = await RouteService.deleteRoute(routeId);
      if (result.success) {
        toast.success('Route deleted successfully');
        // Reload routes if modal is open
        if (showLoadRouteModal) {
          loadSavedRoutes();
        }
        // Reload templates if template modal is open
        if (showTemplateModal) {
          loadTemplateRoutes();
        }
      } else {
        toast.error(result.error || 'Failed to delete route');
      }
    } catch (error) {
      console.error('Error deleting route:', error);
      toast.error('Failed to delete route: ' + (error.message || 'Unknown error'));
    }
  };

  const loadTemplateRoutes = async () => {
    setLoadingTemplates(true);
    try {
      const result = await RouteService.getTemplateRoutes(null);

      if (result.success) {
        setTemplateRoutes(result.templates || []);
        setShowTemplateModal(true);
      } else {
        toast.error(result.error || 'Failed to load template routes');
      }
    } catch (error) {
      console.error('Error loading template routes:', error);
      toast.error('Failed to load template routes: ' + (error.message || 'Unknown error'));
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleApplyTemplate = (template) => {
    setSelectedTemplate(template);
    setTemplateTargetDate(new Date().toISOString().split('T')[0]);
    setShowTemplateModal(false);
    setShowApplyTemplateModal(true);
  };

  const confirmApplyTemplate = async () => {
    if (!selectedTemplate) {
      return;
    }

    if (!templateTargetDate) {
      toast.error('Please select a target date');
      return;
    }

    setApplyingTemplate(true);
    try {
      const result = await RouteService.applyTemplateRoute(
        selectedTemplate.id,
        templateTargetDate,
        selectedTechnician || null
      );

      if (result.success) {
        toast.success(result.message || `Template applied successfully! Created ${result.jobs?.length || 0} jobs.`);
        setShowApplyTemplateModal(false);
        setSelectedTemplate(null);
        // Reload jobs for the target date
        await loadData();
        // Set the date to the target date to show the new jobs
        setSelectedDate(templateTargetDate);
      } else {
        toast.error(result.error || 'Failed to apply template');
      }
    } catch (error) {
      console.error('Error applying template:', error);
      toast.error('Failed to apply template: ' + (error.message || 'Unknown error'));
    } finally {
      setApplyingTemplate(false);
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
              onClick={loadTemplateRoutes}
              disabled={loadingTemplates}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="View route templates"
            >
              <BookmarkIcon className="h-5 w-5" />
              Templates
            </button>
            <button
              onClick={loadSavedRoutes}
              disabled={loadingRoutes}
              className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <FolderIcon className="h-5 w-5" />
              Load
            </button>
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
              <>
                <button
                  onClick={() => setShowSaveRouteModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                >
                  <BookmarkIcon className="h-5 w-5" />
                  Save
                </button>
                <button
                  onClick={assignOptimizedRoute}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
                >
                  <PlusIcon className="h-5 w-5" />
                  Assign
                </button>
              </>
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
              Jobs for {new Date(selectedDate + 'T12:00:00').toLocaleDateString()}
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
          {!GOOGLE_MAPS_API_KEY ? (
            <div className="flex items-center justify-center h-[600px] bg-gray-50">
              <div className="text-center">
                <MapPinIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                <p className="text-gray-600">Google Maps API key not configured</p>
                <p className="text-sm text-gray-500 mt-1">
                  Add VITE_GOOGLE_MAPS_API_KEY to your environment variables
                </p>
              </div>
            </div>
          ) : mapsLoadError ? (
            <div className="flex items-center justify-center h-[600px] bg-gray-50">
              <div className="text-center">
                <MapPinIcon className="mx-auto h-12 w-12 text-red-400 mb-2" />
                <p className="text-red-600">Error loading Google Maps</p>
                <p className="text-sm text-gray-500 mt-1">Please check your API key</p>
              </div>
            </div>
          ) : !isMapsLoaded ? (
            <div className="flex items-center justify-center h-[600px] bg-gray-50">
              <div className="text-center">
                <ArrowPathIcon className="mx-auto h-12 w-12 text-gray-400 mb-2 animate-spin" />
                <p className="text-gray-600">Loading Google Maps...</p>
              </div>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={DEFAULT_MAP_CENTER}
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
                        lat: job.latitude || DEFAULT_MAP_CENTER.lat,
                        lng: job.longitude || DEFAULT_MAP_CENTER.lng,
                      }}
                      label={{
                        text: (index + 1).toString(),
                        color: 'white',
                        fontWeight: 'bold',
                      }}
                    />
                  ))}
            </GoogleMap>
          )}
        </motion.div>
      </div>

      {/* Save Route Modal */}
      {showSaveRouteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Save Route</h2>
              <button
                onClick={() => {
                  setShowSaveRouteModal(false);
                  setRouteName('');
                  setSaveAsTemplate(false);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Route Name *
                </label>
                <input
                  type="text"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  placeholder="e.g., Monday Morning Route"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  autoFocus
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="saveAsTemplate"
                  checked={saveAsTemplate}
                  onChange={(e) => setSaveAsTemplate(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="saveAsTemplate" className="ml-2 block text-sm text-gray-700">
                  Save as template (can be reused for other dates)
                </label>
              </div>

              <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-600">
                <p><strong>Date:</strong> {new Date(selectedDate + 'T12:00:00').toLocaleDateString()}</p>
                <p><strong>Jobs:</strong> {selectedJobs.length}</p>
                <p><strong>Distance:</strong> {routeInfo?.totalDistance || 'N/A'} miles</p>
                <p><strong>Duration:</strong> {routeInfo?.totalDuration || 'N/A'} minutes</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowSaveRouteModal(false);
                    setRouteName('');
                    setSaveAsTemplate(false);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveRoute}
                  disabled={!routeName.trim() || savingRoute}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingRoute ? 'Saving...' : 'Save Route'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Load Routes Modal */}
      {showLoadRouteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Load Saved Route</h2>
              <button
                onClick={() => setShowLoadRouteModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {savedRoutes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FolderIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p>No saved routes found</p>
                  <p className="text-sm mt-1">Create and save a route to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRoutes.map((route) => (
                    <div
                      key={route.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{route.name}</h3>
                            {route.isTemplate && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 rounded">
                                Template
                              </span>
                            )}
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-gray-600">
                            {route.date && (
                              <p><strong>Date:</strong> {new Date(route.date + 'T12:00:00').toLocaleDateString()}</p>
                            )}
                            <p><strong>Jobs:</strong> {route.jobCount || route.jobIds?.length || 0}</p>
                            {route.routeInfo && (
                              <>
                                <p><strong>Distance:</strong> {route.routeInfo.totalDistance} miles</p>
                                <p><strong>Duration:</strong> {route.routeInfo.totalDuration} minutes</p>
                              </>
                            )}
                            {route.technicianName && (
                              <p><strong>Technician:</strong> {route.technicianName}</p>
                            )}
                            {route.createdAt && (
                              <p className="text-xs text-gray-400">
                                Saved: {new Date(route.createdAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleLoadRoute(route.id)}
                            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDeleteRoute(route.id, route.name)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setShowLoadRouteModal(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Template Routes Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Route Templates</h2>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingTemplates ? (
                <div className="text-center py-8 text-gray-500">
                  <ArrowPathIcon className="mx-auto h-12 w-12 text-gray-400 mb-2 animate-spin" />
                  <p>Loading templates...</p>
                </div>
              ) : templateRoutes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <BookmarkIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p>No route templates found</p>
                  <p className="text-sm mt-1">Save a route as a template to see it here</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templateRoutes.map((template) => (
                    <div
                      key={template.id}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-gray-900">{template.name}</h3>
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded">
                              Template
                            </span>
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-gray-600">
                            <p><strong>Jobs:</strong> {template.jobCount || template.jobIds?.length || 0}</p>
                            {template.routeInfo && (
                              <>
                                <p><strong>Distance:</strong> {template.routeInfo.totalDistance} miles</p>
                                <p><strong>Duration:</strong> {template.routeInfo.totalDuration} minutes</p>
                              </>
                            )}
                            {template.technicianName && (
                              <p><strong>Technician:</strong> {template.technicianName}</p>
                            )}
                            {template.createdAt && (
                              <p className="text-xs text-gray-400">
                                Created: {new Date(template.createdAt).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleApplyTemplate(template)}
                            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700"
                          >
                            Apply
                          </button>
                          <button
                            onClick={() => handleDeleteRoute(template.id, template.name)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Apply Template Modal */}
      {showApplyTemplateModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Apply Template</h2>
              <button
                onClick={() => {
                  setShowApplyTemplateModal(false);
                  setSelectedTemplate(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-md text-sm">
                <p className="font-medium text-gray-900 mb-2">{selectedTemplate.name}</p>
                <p className="text-gray-600"><strong>Jobs:</strong> {selectedTemplate.jobCount || selectedTemplate.jobIds?.length || 0}</p>
                {selectedTemplate.routeInfo && (
                  <>
                    <p className="text-gray-600"><strong>Distance:</strong> {selectedTemplate.routeInfo.totalDistance} miles</p>
                    <p className="text-gray-600"><strong>Duration:</strong> {selectedTemplate.routeInfo.totalDuration} minutes</p>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <CalendarIcon className="inline h-4 w-4 mr-1" />
                  Target Date *
                </label>
                <input
                  type="date"
                  value={templateTargetDate}
                  onChange={(e) => setTemplateTargetDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <TruckIcon className="inline h-4 w-4 mr-1" />
                  Assign to Technician (Optional)
                </label>
                <select
                  value={selectedTechnician}
                  onChange={(e) => setSelectedTechnician(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">No change (use template default)</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm text-blue-800">
                <p><strong>Note:</strong> This will create new jobs from the template for the selected date. Existing jobs will not be modified.</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowApplyTemplateModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmApplyTemplate}
                  disabled={!templateTargetDate || applyingTemplate}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applyingTemplate ? 'Applying...' : 'Apply Template'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default RouteOptimizationPage;

