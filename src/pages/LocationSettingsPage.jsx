import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import LocationSettingsService from '../services/locationSettingsService';
import CompanyService from '../services/companyService';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import {
  MapPinIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const EXCEPTION_TYPES = [
  { value: 'sick_day', label: '🤒 Sick Day', color: 'bg-red-100 text-red-800' },
  { value: 'vacation', label: '🏖️ Vacation', color: 'bg-blue-100 text-blue-800' },
  { value: 'off_day', label: '❌ Off Day', color: 'bg-gray-100 text-gray-800' },
  { value: 'overtime', label: '⏰ Overtime', color: 'bg-green-100 text-green-800' },
];

const WORK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const LocationSettingsPage = () => {
  const { userProfile } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  const companyId = useMemo(() => getEffectiveCompanyId?.(), [getEffectiveCompanyId]);

  const [settings, setSettings] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSettings, setEditingSettings] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [newException, setNewException] = useState({
    type: 'sick_day',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    description: '',
    userId: '',
  });

  useEffect(() => {
    if (companyId) {
      loadSettings();
      loadTeamMembers();
      loadExceptions();
    }
  }, [companyId]);

  const loadSettings = async () => {
    try {
      const result = await LocationSettingsService.getCompanySettings(companyId);
      if (result.success) {
        setSettings(result.settings || {});
        setEditingSettings(result.settings || {});
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Error loading location settings');
    }
  };

  const loadTeamMembers = async () => {
    try {
      const result = await CompanyService.getTeamMembers(companyId);
      if (result.success) {
        setTeamMembers(
          (result.teamMembers || []).filter(member => member.role === 'field_tech' || member.role === 'technician')
        );
      }
    } catch (error) {
      console.error('Error loading team members:', error);
    }
  };

  const loadExceptions = async () => {
    try {
      const result = await LocationSettingsService.getTechnicianExceptions(companyId);
      if (result.success) {
        setExceptions(result.exceptions || []);
      }
    } catch (error) {
      console.error('Error loading exceptions:', error);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setLoading(true);
      const result = await LocationSettingsService.updateCompanySettings(companyId, {
        autoTrackingEnabled: editingSettings.autoTrackingEnabled ?? true,
        businessHoursStart: editingSettings.businessHoursStart || '06:00',
        businessHoursEnd: editingSettings.businessHoursEnd || '18:00',
        workDays: editingSettings.workDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        retentionDays: editingSettings.retentionDays || 30,
      });

      if (result.success) {
        setSettings(result.settings);
        setShowSettingsModal(false);
        toast.success('Location settings updated');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Error saving settings');
    } finally {
      setLoading(false);
    }
  };

  const handleAddException = async () => {
    try {
      if (!newException.userId) {
        toast.error('Please select a technician');
        return;
      }

      setLoading(true);
      const result = await LocationSettingsService.addScheduleException(
        companyId,
        newException.userId,
        {
          type: newException.type,
          startDate: newException.startDate,
          endDate: newException.endDate,
          description: newException.description,
        }
      );

      if (result.success) {
        setExceptions([...exceptions, result.exception]);
        setShowExceptionModal(false);
        setNewException({
          type: 'sick_day',
          startDate: new Date().toISOString().split('T')[0],
          endDate: new Date().toISOString().split('T')[0],
          description: '',
          userId: '',
        });
        toast.success('Schedule exception added');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error adding exception:', error);
      toast.error('Error adding exception');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteException = async (exceptionId) => {
    if (!window.confirm('Delete this schedule exception?')) return;

    try {
      setLoading(true);
      const result = await LocationSettingsService.deleteScheduleException(exceptionId);
      if (result.success) {
        setExceptions(exceptions.filter(e => e.id !== exceptionId));
        toast.success('Exception deleted');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting exception:', error);
      toast.error('Error deleting exception');
    } finally {
      setLoading(false);
    }
  };

  const getTechnicianName = (userId) => {
    const member = teamMembers.find(m => m.userId === userId);
    return member?.name || 'Unknown';
  };

  const getExceptionTypeInfo = (type) => {
    return EXCEPTION_TYPES.find(t => t.value === type) || EXCEPTION_TYPES[0];
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Location Tracking Settings</h1>
        <p className="mt-2 text-sm text-gray-600">
          Configure technician tracking and manage schedule exceptions
        </p>
      </div>

      {/* Settings Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <ClockIcon className="w-5 h-5 mr-2 text-primary-600" />
            Tracking Configuration
          </h2>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            Edit Settings
          </button>
        </div>

        {settings ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Status */}
            <div className="flex items-center">
              {settings.autoTrackingEnabled ? (
                <div className="flex items-center">
                  <CheckCircleIcon className="w-5 h-5 text-green-600 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Auto-Tracking</p>
                    <p className="text-sm text-green-600">Enabled</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center">
                  <ExclamationCircleIcon className="w-5 h-5 text-gray-400 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Auto-Tracking</p>
                    <p className="text-sm text-gray-600">Disabled</p>
                  </div>
                </div>
              )}
            </div>

            {/* Business Hours */}
            <div>
              <p className="text-sm font-medium text-gray-900">Business Hours</p>
              <p className="text-sm text-gray-700">
                {settings.businessHoursStart} - {settings.businessHoursEnd}
              </p>
            </div>

            {/* Work Days */}
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-gray-900 mb-2">Work Days</p>
              <div className="flex flex-wrap gap-2">
                {(settings.workDays || []).map(day => (
                  <span key={day} className="px-3 py-1 bg-primary-100 text-primary-800 text-xs font-medium rounded-full">
                    {day}
                  </span>
                ))}
              </div>
            </div>

            {/* Retention */}
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-gray-900">Data Retention</p>
              <p className="text-sm text-gray-700">{settings.retentionDays || 30} days</p>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">No tracking configuration set up yet</p>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
            >
              Create Configuration
            </button>
          </div>
        )}
      </motion.div>

      {/* Schedule Exceptions Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-white rounded-lg shadow-sm border border-gray-200 p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <CalendarIcon className="w-5 h-5 mr-2 text-primary-600" />
            Schedule Exceptions
          </h2>
          <button
            onClick={() => setShowExceptionModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center"
          >
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Exception
          </button>
        </div>

        {exceptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Technician</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">End Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {exceptions.map(exception => {
                  const typeInfo = getExceptionTypeInfo(exception.type);
                  return (
                    <tr key={exception.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {getTechnicianName(exception.userId)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {new Date(exception.startDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {new Date(exception.endDate).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{exception.description || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleDeleteException(exception.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-gray-600">No schedule exceptions</p>
          </div>
        )}
      </motion.div>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Tracking Settings</h3>

            <div className="space-y-4">
              {/* Auto-Tracking Toggle */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={editingSettings?.autoTrackingEnabled ?? true}
                  onChange={(e) =>
                    setEditingSettings({ ...editingSettings, autoTrackingEnabled: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label className="ml-2 text-sm font-medium text-gray-900">Enable auto-tracking</label>
              </div>

              {/* Business Hours Start */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours Start</label>
                <input
                  type="time"
                  value={editingSettings?.businessHoursStart || '06:00'}
                  onChange={(e) =>
                    setEditingSettings({ ...editingSettings, businessHoursStart: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                />
              </div>

              {/* Business Hours End */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Business Hours End</label>
                <input
                  type="time"
                  value={editingSettings?.businessHoursEnd || '18:00'}
                  onChange={(e) =>
                    setEditingSettings({ ...editingSettings, businessHoursEnd: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                />
              </div>

              {/* Work Days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Work Days</label>
                <div className="space-y-2">
                  {WORK_DAYS.map(day => (
                    <div key={day} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={(editingSettings?.workDays || []).includes(day)}
                        onChange={(e) => {
                          const workDays = editingSettings?.workDays || [];
                          if (e.target.checked) {
                            setEditingSettings({
                              ...editingSettings,
                              workDays: [...workDays, day],
                            });
                          } else {
                            setEditingSettings({
                              ...editingSettings,
                              workDays: workDays.filter(d => d !== day),
                            });
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label className="ml-2 text-sm text-gray-700">{day}</label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Retention Days */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Retention (Days)</label>
                <input
                  type="number"
                  min="7"
                  max="365"
                  value={editingSettings?.retentionDays || 30}
                  onChange={(e) =>
                    setEditingSettings({ ...editingSettings, retentionDays: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                disabled={loading}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exception Modal */}
      {showExceptionModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Add Schedule Exception</h3>

            <div className="space-y-4">
              {/* Technician */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Technician</label>
                <select
                  value={newException.userId}
                  onChange={(e) => setNewException({ ...newException, userId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                >
                  <option value="">Select a technician...</option>
                  {teamMembers.map(member => (
                    <option key={member.userId} value={member.userId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exception Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={newException.type}
                  onChange={(e) => setNewException({ ...newException, type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                >
                  {EXCEPTION_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={newException.startDate}
                  onChange={(e) => setNewException({ ...newException, startDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={newException.endDate}
                  onChange={(e) => setNewException({ ...newException, endDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={newException.description}
                  onChange={(e) => setNewException({ ...newException, description: e.target.value })}
                  placeholder="e.g., Annual vacation, Recovering from surgery"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary-500"
                  rows="3"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowExceptionModal(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddException}
                disabled={loading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Exception'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LocationSettingsPage;

