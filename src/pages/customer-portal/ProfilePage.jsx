import React, { useState, useEffect } from 'react';
import { useCustomerPortal } from '../../contexts/CustomerPortalContext';
import { 
  UserIcon, 
  BellIcon, 
  ShieldCheckIcon,
  EnvelopeIcon,
  PhoneIcon,
  MapPinIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ProfilePage = () => {
  const { customer, updateCustomerProfile } = useCustomerPortal();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: customer?.name || '',
    email: customer?.email || '',
    phone: customer?.phone || '',
    address: customer?.address || '',
    city: customer?.city || '',
    state: customer?.state || '',
    zipCode: customer?.zipCode || ''
  });
  const [notifications, setNotifications] = useState({
    emailNotifications: customer?.emailNotifications !== false,
    jobReminders: customer?.jobReminders !== false,
    invoiceNotifications: customer?.invoiceNotifications !== false,
    marketingEmails: customer?.marketingEmails === true
  });

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        zipCode: customer.zipCode || ''
      });
      setNotifications({
        emailNotifications: customer.emailNotifications !== false,
        jobReminders: customer.jobReminders !== false,
        invoiceNotifications: customer.invoiceNotifications !== false,
        marketingEmails: customer.marketingEmails === true
      });
    }
  }, [customer]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleNotificationChange = (key) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSaveProfile = async () => {
    if (!formData.name) {
      toast.error('Name is required');
      return;
    }

    if (!formData.phone) {
      toast.error('Phone number is required');
      return;
    }

    setIsSaving(true);
    try {
      await updateCustomerProfile({
        ...formData,
        ...notifications
      });
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    if (customer) {
      setFormData({
        name: customer.name || '',
        email: customer.email || '',
        phone: customer.phone || '',
        address: customer.address || '',
        city: customer.city || '',
        state: customer.state || '',
        zipCode: customer.zipCode || ''
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Your Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Personal Information */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <UserIcon className="w-5 h-5 text-green-600" />
            Personal Information
          </h2>
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            {isEditing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              />
            ) : (
              <p className="text-gray-900">{formData.name}</p>
            )}
          </div>

          {/* Email - Read Only */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <p className="text-gray-900">{formData.email}</p>
            <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <PhoneIcon className="w-4 h-4" /> Phone Number
            </label>
            {isEditing ? (
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="(555) 123-4567"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              />
            ) : (
              <p className="text-gray-900">{formData.phone || 'Not provided'}</p>
            )}
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <MapPinIcon className="w-4 h-4" /> Street Address
            </label>
            {isEditing ? (
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="123 Main St"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              />
            ) : (
              <p className="text-gray-900">{formData.address || 'Not provided'}</p>
            )}
          </div>

          {/* City, State, Zip */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              {isEditing ? (
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="New York"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                />
              ) : (
                <p className="text-gray-900">{formData.city || 'N/A'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              {isEditing ? (
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="NY"
                  maxLength="2"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 uppercase"
                />
              ) : (
                <p className="text-gray-900">{formData.state || 'N/A'}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
              {isEditing ? (
                <input
                  type="text"
                  name="zipCode"
                  value={formData.zipCode}
                  onChange={handleInputChange}
                  placeholder="10001"
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                />
              ) : (
                <p className="text-gray-900">{formData.zipCode || 'N/A'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {isEditing && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <CheckIcon className="w-5 h-5" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <BellIcon className="w-5 h-5 text-green-600" />
          Notification Preferences
        </h2>

        <div className="space-y-4">
          {/* Email Notifications */}
          <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
            <div>
              <h3 className="font-medium text-gray-900">Email Notifications</h3>
              <p className="text-sm text-gray-600 mt-1">
                Receive updates about your jobs and services
              </p>
            </div>
            <button
              onClick={() => handleNotificationChange('emailNotifications')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                notifications.emailNotifications ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  notifications.emailNotifications ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Job Reminders */}
          <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
            <div>
              <h3 className="font-medium text-gray-900">Job Reminders</h3>
              <p className="text-sm text-gray-600 mt-1">
                Get reminders before your scheduled appointments
              </p>
            </div>
            <button
              onClick={() => handleNotificationChange('jobReminders')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                notifications.jobReminders ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  notifications.jobReminders ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Invoice Notifications */}
          <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
            <div>
              <h3 className="font-medium text-gray-900">Invoice Notifications</h3>
              <p className="text-sm text-gray-600 mt-1">
                Get notified when new invoices are ready
              </p>
            </div>
            <button
              onClick={() => handleNotificationChange('invoiceNotifications')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                notifications.invoiceNotifications ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  notifications.invoiceNotifications ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Marketing Emails */}
          <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
            <div>
              <h3 className="font-medium text-gray-900">Marketing Emails</h3>
              <p className="text-sm text-gray-600 mt-1">
                Receive promotional offers and company updates
              </p>
            </div>
            <button
              onClick={() => handleNotificationChange('marketingEmails')}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                notifications.marketingEmails ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  notifications.marketingEmails ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Account Security */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center gap-2">
          <ShieldCheckIcon className="w-5 h-5 text-green-600" />
          Account Security
        </h2>

        <div className="space-y-4">
          {/* Session Info */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">Active Session</h3>
            <p className="text-sm text-gray-600 mb-1">
              Last login: {customer?.lastLogin ? new Date(customer.lastLogin).toLocaleDateString() : 'Today'}
            </p>
            <p className="text-xs text-gray-500">
              Your session will expire in 30 minutes of inactivity
            </p>
          </div>

          {/* Logout All Devices */}
          <button className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Sign Out All Devices
          </button>

          {/* Change Password */}
          <button className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            Change Password (Coming Soon)
          </button>
        </div>
      </div>

      {/* Privacy Note */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          💡 Your data is secure and encrypted. We never share your information with third parties.
        </p>
      </div>
    </div>
  );
};

export default ProfilePage;

