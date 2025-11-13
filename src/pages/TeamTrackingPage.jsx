import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import LocationService from '../services/locationService';
import LocationSettingsService from '../services/locationSettingsService';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { GoogleMap, Marker, Polyline, useJsApiLoader } from '@react-google-maps/api';
import {
  MapPinIcon,
  ClockIcon,
  UserIcon,
  CalendarIcon,
  ArrowPathIcon,
  ChartBarIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Google Maps API Key - check both VITE and EXPO_PUBLIC env vars for compatibility
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 
                             import.meta.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 
                             '';

// Move libraries constant outside component to avoid re-renders
const GOOGLE_MAPS_LIBRARIES = ['places'];

const mapContainerStyle = {
  width: '100%',
  height: '400px',
};

const defaultCenter = {
  lat: 35.3733,
  lng: -119.0187,
};

const TeamTrackingPage = () => {
  const { userProfile } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  
  // Load Google Maps API
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });
  
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserName, setSelectedUserName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [locations, setLocations] = useState([]);
  const [currentLocations, setCurrentLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState('route'); // 'route' or 'current'
  const [stats, setStats] = useState(null);
  const [mapCenter, setMapCenter] = useState(defaultCenter);
  const [mapZoom, setMapZoom] = useState(12);
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [settings, setSettings] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [editingSettings, setEditingSettings] = useState(null);
  const [showExceptionForm, setShowExceptionForm] = useState(false);
  const [newException, setNewException] = useState({
    type: 'sick_day',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    description: '',
    userId: '',
  });
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    loadTeamMembers();
    if (viewMode === 'current') {
      loadCurrentLocations();
      // Auto-refresh every 30 seconds
      const interval = setInterval(loadCurrentLocations, 30000);
      return () => clearInterval(interval);
    }
  }, [viewMode, getEffectiveCompanyId()]);

  // Load location settings when modal opens
  useEffect(() => {
    if (showLocationSettings) {
      loadLocationSettings();
    }
  }, [showLocationSettings]);

  useEffect(() => {
    if (selectedUserId && startDate && endDate && viewMode === 'route') {
      loadRouteData();
    }
  }, [selectedUserId, startDate, endDate, viewMode]);

  // Calculate map bounds when locations change
  useEffect(() => {
    if (locations.length > 0) {
      const lats = locations.map(loc => loc.latitude);
      const lngs = locations.map(loc => loc.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      setMapCenter({
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2,
      });
      
      // Adjust zoom based on spread
      const latDiff = maxLat - minLat;
      const lngDiff = maxLng - minLng;
      const maxDiff = Math.max(latDiff, lngDiff);
      
      if (maxDiff > 0.1) setMapZoom(10);
      else if (maxDiff > 0.05) setMapZoom(12);
      else setMapZoom(14);
    }
  }, [locations]);

  const loadTeamMembers = async () => {
    try {
      const companyId = getEffectiveCompanyId() || userProfile?.companyId;
      if (!companyId) return;

      const teamMembersRef = collection(db, 'teamMembers');
      const q = query(
        teamMembersRef,
        where('companyId', '==', companyId),
        where('status', '==', 'active')
      );

      const snapshot = await getDocs(q);
      const members = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        members.push({
          id: doc.id,
          userId: data.userId,
          name: data.name || data.email || 'Unknown',
          email: data.email || '',
          role: data.role || 'field_tech',
        });
      });

      setTeamMembers(members);
      
      // Set default dates (today)
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      setStartDate(todayStr);
      setEndDate(todayStr);
    } catch (error) {
      console.error('Error loading team members:', error);
      toast.error('Failed to load team members');
    }
  };

  const loadCurrentLocations = async () => {
    try {
      const companyId = getEffectiveCompanyId() || userProfile?.companyId;
      if (!companyId) return;

      const result = await LocationService.getCurrentLocations(companyId);
      if (result.success) {
        setCurrentLocations(result.locations);
      }
    } catch (error) {
      console.error('Error loading current locations:', error);
    }
  };

  const loadRouteData = async () => {
    if (!selectedUserId || !startDate || !endDate) return;

    setIsLoading(true);
    try {
      const companyId = getEffectiveCompanyId() || userProfile?.companyId;
      
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const [locationsResult, statsResult] = await Promise.all([
        LocationService.getUserLocations(selectedUserId, companyId, start, end),
        LocationService.getRouteStatistics(selectedUserId, companyId, start, end),
      ]);

      if (locationsResult.success) {
        setLocations(locationsResult.locations);
      }

      if (statsResult.success) {
        setStats(statsResult.stats);
      }
    } catch (error) {
      console.error('Error loading route data:', error);
      toast.error('Failed to load route data');
    } finally {
      setIsLoading(false);
    }
  };

  // Prepare route path for polyline
  const routePath = useMemo(() => {
    if (locations.length === 0) return [];
    
    return locations.map(loc => ({
      lat: loc.latitude,
      lng: loc.longitude,
    }));
  }, [locations]);

  // Get job site locations
  const jobSiteLocations = useMemo(() => {
    return locations.filter(loc => loc.isJobSite && loc.jobId);
  }, [locations]);

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit' 
    });
  };

  const loadLocationSettings = async () => {
    try {
      setSettingsLoading(true);
      const companyId = getEffectiveCompanyId() || userProfile?.companyId;
      if (!companyId) return;

      const result = await LocationSettingsService.getCompanySettings(companyId);
      if (result) {
        setEditingSettings({ ...result });
      }

      const exceptionsResult = await LocationSettingsService.getTechnicianExceptions(companyId);
      setExceptions(exceptionsResult || []);
    } catch (error) {
      console.error('Error loading location settings:', error);
      toast.error('Failed to load location settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      const companyId = getEffectiveCompanyId() || userProfile?.companyId;
      if (!companyId) return;

      await LocationSettingsService.saveCompanySettings(companyId, editingSettings);
      toast.success('Location settings saved successfully');
      setShowLocationSettings(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save location settings');
    }
  };

  const handleAddException = async () => {
    try {
      const companyId = getEffectiveCompanyId() || userProfile?.companyId;
      if (!companyId || !newException.userId) {
        toast.error('Please select a technician');
        return;
      }

      await LocationSettingsService.addTechnicianException({
        ...newException,
        companyId,
      });

      toast.success('Exception added successfully');
      setNewException({
        type: 'sick_day',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        description: '',
        userId: '',
      });
      setShowExceptionForm(false);
      await loadLocationSettings();
    } catch (error) {
      console.error('Error adding exception:', error);
      toast.error('Failed to add exception');
    }
  };

  const handleDeleteException = async (exceptionId) => {
    if (!window.confirm('Are you sure you want to delete this exception?')) return;

    try {
      await LocationSettingsService.deleteTechnicianException(exceptionId);
      toast.success('Exception deleted successfully');
      await loadLocationSettings();
    } catch (error) {
      console.error('Error deleting exception:', error);
      toast.error('Failed to delete exception');
    }
  };

  const getExceptionTypeLabel = (type) => {
    const labels = {
      sick_day: '🤒 Sick Day',
      vacation: '🏖️ Vacation',
      off_day: '📅 Off Day',
      overtime: '⏰ Overtime',
    };
    return labels[type] || type;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team GPS Tracking</h1>
          <p className="mt-1 text-sm text-gray-500">
            View technician routes and current locations
          </p>
        </div>
        <button
          onClick={() => setShowLocationSettings(true)}
          className="inline-flex items-center px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 shadow-sm transition-colors"
        >
          <Cog6ToothIcon className="w-5 h-5 mr-2" />
          Settings
        </button>
      </div>

      {/* Mode Toggle */}
      <div className="mb-6">
        <div className="flex gap-4 bg-white shadow rounded-lg p-1">
          <button
            onClick={() => setViewMode('route')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'route'
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <MapPinIcon className="w-5 h-5 inline mr-2" />
            View Routes
          </button>
          <button
            onClick={() => setViewMode('current')}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'current'
                ? 'bg-primary-600 text-white'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <UserIcon className="w-5 h-5 inline mr-2" />
            Current Locations
          </button>
        </div>
      </div>

      {viewMode === 'route' ? (
        /* Route View */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Filters Sidebar */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Select Route</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Technician
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => {
                    const selected = teamMembers.find(m => m.userId === e.target.value);
                    setSelectedUserId(e.target.value);
                    setSelectedUserName(selected?.name || '');
                  }}
                  className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm transition-colors bg-white"
                >
                  <option value="">Select technician...</option>
                  {teamMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500"
                />
              </div>

              <button
                onClick={loadRouteData}
                disabled={!selectedUserId || !startDate || !endDate || isLoading}
                className="w-full px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 inline mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  'Load Route'
                )}
              </button>
            </div>

            {/* Statistics */}
            {stats && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  <ChartBarIcon className="w-4 h-4 inline mr-2" />
                  Route Statistics
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Points:</span>
                    <span className="font-medium">{stats.totalPoints}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Distance:</span>
                    <span className="font-medium">{stats.totalDistance} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium">{Math.round(stats.totalTime / 60)}h {stats.totalTime % 60}m</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Job Sites:</span>
                    <span className="font-medium">{stats.jobSitesVisited}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Route Display */}
          <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              {selectedUserName ? `${selectedUserName}'s Route` : 'Select a technician to view route'}
            </h2>

            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <ArrowPathIcon className="w-8 h-8 text-primary-600 animate-spin" />
              </div>
            ) : locations.length > 0 ? (
              <div className="space-y-4">
                {/* Google Maps Route Visualization */}
                <div className="bg-gray-100 rounded-lg overflow-hidden border-2 border-gray-200">
                  {loadError && (
                    <div className="h-96 flex items-center justify-center">
                      <p className="text-red-600">Error loading Google Maps. Please check your API key.</p>
                    </div>
                  )}
                  {!isLoaded && !loadError && (
                    <div className="h-96 flex items-center justify-center">
                      <ArrowPathIcon className="w-8 h-8 text-primary-600 animate-spin" />
                    </div>
                  )}
                  {isLoaded && (
                    <GoogleMap
                      mapContainerStyle={mapContainerStyle}
                      center={mapCenter}
                      zoom={mapZoom}
                      options={{
                        mapTypeControl: true,
                        streetViewControl: false,
                        fullscreenControl: true,
                      }}
                    >
                      {/* Route Polyline */}
                      {routePath.length > 1 && (
                        <Polyline
                          path={routePath}
                          options={{
                            strokeColor: '#3b82f6',
                            strokeOpacity: 0.8,
                            strokeWeight: 4,
                            geodesic: true,
                          }}
                        />
                      )}

                      {/* Start Marker */}
                      {locations[0] && (
                        <Marker
                          position={{ lat: locations[0].latitude, lng: locations[0].longitude }}
                          label={{
                            text: 'START',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '12px',
                          }}
                          icon={{
                            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                              <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="16" cy="16" r="14" fill="#10b981"/>
                                <text x="16" y="21" font-size="16" font-weight="bold" text-anchor="middle" fill="white">S</text>
                              </svg>
                            `),
                            scaledSize: { width: 32, height: 32 },
                          }}
                          title="Start Location"
                        />
                      )}

                      {/* End Marker */}
                      {locations[locations.length - 1] && (
                        <Marker
                          position={{ 
                            lat: locations[locations.length - 1].latitude, 
                            lng: locations[locations.length - 1].longitude 
                          }}
                          label={{
                            text: 'END',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '12px',
                          }}
                          icon={{
                            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                              <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="16" cy="16" r="14" fill="#ef4444"/>
                                <text x="16" y="21" font-size="16" font-weight="bold" text-anchor="middle" fill="white">E</text>
                              </svg>
                            `),
                            scaledSize: { width: 32, height: 32 },
                          }}
                          title="End Location"
                        />
                      )}

                      {/* Job Site Markers */}
                      {jobSiteLocations.map((location, idx) => (
                        <Marker
                          key={location.id || idx}
                          position={{ lat: location.latitude, lng: location.longitude }}
                          icon={{
                            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                              <svg width="24" height="24" xmlns="http://www.w3.org/2000/svg">
                                <circle cx="12" cy="12" r="10" fill="#10b981" opacity="0.8"/>
                                <circle cx="12" cy="12" r="5" fill="#ffffff"/>
                              </svg>
                            `),
                            scaledSize: { width: 24, height: 24 },
                          }}
                          title={`Job Site - ${formatTime(location.timestamp?.toDate?.() || location.timestamp)}`}
                        />
                      ))}
                    </GoogleMap>
                  )}
                </div>

                {/* Route Timeline */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Route Timeline</h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {locations.map((location, idx) => (
                      <div
                        key={location.id || idx}
                        className="flex items-start gap-3 p-2 rounded hover:bg-gray-50"
                      >
                        <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-2 ${
                          location.isJobSite ? 'bg-green-500' : 'bg-primary-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-900">
                              {formatTime(location.timestamp?.toDate?.() || location.timestamp)}
                            </span>
                            {location.isJobSite && (
                              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                At Job Site
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">
                            {location.latitude?.toFixed(6)}, {location.longitude?.toFixed(6)}
                          </div>
                          {location.accuracy && (
                            <div className="text-xs text-gray-400">
                              Accuracy: {Math.round(location.accuracy)}m
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedUserId ? (
              <div className="text-center py-12">
                <MapPinIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">No location data found for selected date range</p>
              </div>
            ) : (
              <div className="text-center py-12">
                <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                <p className="text-gray-500">Select a technician and date range to view route</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Current Locations View */
        <div className="bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900">Current Technician Locations</h2>
            <button
              onClick={loadCurrentLocations}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              <ArrowPathIcon className="w-4 h-4 inline mr-1" />
              Refresh
            </button>
          </div>

          {currentLocations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentLocations.map((loc) => (
                <div
                  key={loc.userId}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-gray-900">{loc.userName}</h3>
                    <span className="text-xs text-gray-500">
                      {loc.minutesAgo} min ago
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    <div>
                      <span className="font-medium">Lat:</span> {loc.location.latitude.toFixed(6)}
                    </div>
                    <div>
                      <span className="font-medium">Lng:</span> {loc.location.longitude.toFixed(6)}
                    </div>
                    {loc.location.accuracy && (
                      <div className="text-xs text-gray-500">
                        Accuracy: {Math.round(loc.location.accuracy)}m
                      </div>
                    )}
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${loc.location.latitude},${loc.location.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-primary-600 hover:text-primary-700"
                  >
                    View on Google Maps →
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <UserIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500">No technicians currently have active location tracking</p>
            </div>
          )}
        </div>
      )}

      {/* Location Settings Modal */}
      {showLocationSettings && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative my-8 mx-auto w-full max-w-2xl bg-white rounded-lg shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 flex items-center">
                <Cog6ToothIcon className="w-5 h-5 mr-2 text-primary-600" />
                Location Tracking Settings
              </h3>
              <button
                onClick={() => setShowLocationSettings(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-4 max-h-96 overflow-y-auto">
              {settingsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Business Settings */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-4">Business Settings</h4>
                    <div className="space-y-4">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          checked={editingSettings?.autoTrackingEnabled || false}
                          onChange={(e) => setEditingSettings({
                            ...editingSettings,
                            autoTrackingEnabled: e.target.checked
                          })}
                          className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                        />
                        <label className="ml-3 text-sm font-medium text-gray-700">
                          Enable Automatic Location Tracking
                        </label>
                      </div>

                      {editingSettings?.autoTrackingEnabled && (
                        <>
                          <div className="grid grid-cols-2 gap-4 pl-7">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Business Hours Start
                              </label>
                              <input
                                type="time"
                                value={editingSettings?.businessHoursStart || '08:00'}
                                onChange={(e) => setEditingSettings({
                                  ...editingSettings,
                                  businessHoursStart: e.target.value
                                })}
                                className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">
                                Business Hours End
                              </label>
                              <input
                                type="time"
                                value={editingSettings?.businessHoursEnd || '17:00'}
                                onChange={(e) => setEditingSettings({
                                  ...editingSettings,
                                  businessHoursEnd: e.target.value
                                })}
                                className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                              />
                            </div>
                          </div>

                          <div className="pl-7">
                            <label className="block text-xs font-medium text-gray-700 mb-2">
                              Work Days
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                                <label key={day} className="flex items-center">
                                  <input
                                    type="checkbox"
                                    checked={(editingSettings?.workDays || []).includes(day)}
                                    onChange={(e) => {
                                      const workDays = editingSettings?.workDays || [];
                                      if (e.target.checked) {
                                        setEditingSettings({
                                          ...editingSettings,
                                          workDays: [...workDays, day]
                                        });
                                      } else {
                                        setEditingSettings({
                                          ...editingSettings,
                                          workDays: workDays.filter(d => d !== day)
                                        });
                                      }
                                    }}
                                    className="h-3 w-3 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                                  />
                                  <span className="ml-2 text-xs text-gray-600">{day}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div className="pl-7">
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Data Retention (days)
                            </label>
                            <input
                              type="number"
                              min="7"
                              max="365"
                              value={editingSettings?.retentionDays || 30}
                              onChange={(e) => setEditingSettings({
                                ...editingSettings,
                                retentionDays: parseInt(e.target.value)
                              })}
                              className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Schedule Exceptions */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-900">Schedule Exceptions</h4>
                      <button
                        onClick={() => setShowExceptionForm(!showExceptionForm)}
                        className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary-50 text-primary-700 hover:bg-primary-100 transition-colors"
                      >
                        + Add Exception
                      </button>
                    </div>

                    {showExceptionForm && (
                      <div className="bg-gray-50 p-3 rounded-lg mb-3 space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Technician
                          </label>
                          <select
                            value={newException.userId}
                            onChange={(e) => setNewException({ ...newException, userId: e.target.value })}
                            className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                          >
                            <option value="">Select technician...</option>
                            {teamMembers.map((member) => (
                              <option key={member.userId} value={member.userId}>
                                {member.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Exception Type
                          </label>
                          <select
                            value={newException.type}
                            onChange={(e) => setNewException({ ...newException, type: e.target.value })}
                            className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                          >
                            <option value="sick_day">🤒 Sick Day</option>
                            <option value="vacation">🏖️ Vacation</option>
                            <option value="off_day">📅 Off Day</option>
                            <option value="overtime">⏰ Overtime</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Start Date
                            </label>
                            <input
                              type="date"
                              value={newException.startDate}
                              onChange={(e) => setNewException({ ...newException, startDate: e.target.value })}
                              className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              End Date
                            </label>
                            <input
                              type="date"
                              value={newException.endDate}
                              onChange={(e) => setNewException({ ...newException, endDate: e.target.value })}
                              className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Description (optional)
                          </label>
                          <input
                            type="text"
                            value={newException.description}
                            onChange={(e) => setNewException({ ...newException, description: e.target.value })}
                            placeholder="e.g., Annual vacation, doctor appointment"
                            className="block w-full px-3 py-2 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 text-sm"
                          />
                        </div>

                        <div className="flex gap-2 justify-end pt-2">
                          <button
                            onClick={() => setShowExceptionForm(false)}
                            className="px-3 py-1.5 rounded text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleAddException}
                            className="px-3 py-1.5 rounded text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 transition-colors"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    {exceptions.length > 0 ? (
                      <div className="space-y-2">
                        {exceptions.map((exception) => (
                          <div key={exception.id} className="flex items-start justify-between p-2 bg-gray-50 rounded text-xs">
                            <div className="flex-1">
                              <div className="font-medium text-gray-900">
                                {teamMembers.find(m => m.userId === exception.userId)?.name || 'Unknown Technician'}
                              </div>
                              <div className="text-gray-600 mt-0.5">
                                {getExceptionTypeLabel(exception.type)} • {exception.startDate} to {exception.endDate}
                              </div>
                              {exception.description && (
                                <div className="text-gray-500 mt-0.5">{exception.description}</div>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteException(exception.id)}
                              className="text-red-600 hover:text-red-700 font-medium ml-2"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 py-2">No exceptions scheduled</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowLocationSettings(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={settingsLoading}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamTrackingPage;
