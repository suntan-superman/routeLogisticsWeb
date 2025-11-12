import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import NotificationService from '../services/notificationService';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../services/firebase';
import {
  BellIcon,
  PaperAirplaneIcon,
  UsersIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const NotificationsPage = () => {
  const { userProfile, isSuperAdmin } = useAuth();
  const { activeCompany, getEffectiveCompanyId } = useCompany();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  
  // Notification form state
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationBody, setNotificationBody] = useState('');
  const [notificationData, setNotificationData] = useState({ screen: '' });
  const [sendToAll, setSendToAll] = useState(false);

  useEffect(() => {
    loadUsers();
  }, [activeCompany, isSuperAdmin]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const companyId = getEffectiveCompanyId();
      
      if (!companyId && !isSuperAdmin) {
        toast.error('No company selected');
        return;
      }

      const usersRef = collection(db, 'users');
      let q;
      
      if (isSuperAdmin && !companyId) {
        // Super admin can see all users
        q = query(usersRef, orderBy('createdAt', 'desc'));
      } else {
        // Filter by company
        q = query(
          usersRef,
          where('companyId', '==', companyId),
          orderBy('createdAt', 'desc')
        );
      }

      const querySnapshot = await getDocs(q);
      const usersList = [];
      
      querySnapshot.forEach((doc) => {
        const userData = doc.data();
        usersList.push({
          id: doc.id,
          ...userData,
          hasPushToken: !!userData.pushToken,
          notificationsEnabled: userData.notificationsEnabled !== false
        });
      });

      // Sort by name for better UX
      usersList.sort((a, b) => {
        const nameA = (a.name || a.email || '').toLowerCase();
        const nameB = (b.name || b.email || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setUsers(usersList);
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUserToggle = (userId) => {
    if (sendToAll) {
      setSendToAll(false);
      setSelectedUserIds([userId]);
    } else {
      setSelectedUserIds(prev => {
        if (prev.includes(userId)) {
          return prev.filter(id => id !== userId);
        } else {
          return [...prev, userId];
        }
      });
    }
  };

  const handleSelectAll = () => {
    if (sendToAll) {
      setSendToAll(false);
      setSelectedUserIds([]);
    } else {
      setSendToAll(true);
      // Select all users with push tokens
      const eligibleUsers = users.filter(u => u.hasPushToken && u.notificationsEnabled);
      setSelectedUserIds(eligibleUsers.map(u => u.id));
    }
  };

  const handleSendNotification = async () => {
    if (!notificationTitle.trim() || !notificationBody.trim()) {
      toast.error('Please enter both title and message');
      return;
    }

    const targetUserIds = sendToAll 
      ? users.filter(u => u.hasPushToken && u.notificationsEnabled).map(u => u.id)
      : selectedUserIds;

    if (targetUserIds.length === 0) {
      toast.error('Please select at least one user with push notifications enabled');
      return;
    }

    setIsSending(true);
    try {
      const result = await NotificationService.sendNotification(
        targetUserIds,
        notificationTitle,
        notificationBody,
        notificationData.screen ? notificationData : {}
      );

      if (result.success) {
        toast.success(`Notification sent to ${result.sent} of ${result.total} users`);
        
        // Reset form
        setNotificationTitle('');
        setNotificationBody('');
        setNotificationData({ screen: '' });
        setSelectedUserIds([]);
        setSendToAll(false);
      } else {
        toast.error(result.error || 'Failed to send notification');
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error('Failed to send notification');
    } finally {
      setIsSending(false);
    }
  };

  const eligibleUsersCount = users.filter(u => u.hasPushToken && u.notificationsEnabled).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BellIcon className="h-8 w-8 text-primary-500" />
              Push Notifications
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Send important notifications to team members
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: User Selection */}
        <div className="lg:col-span-1 bg-white shadow rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <UsersIcon className="h-5 w-5 text-primary-500" />
              Select Recipients
            </h2>
            <button
              onClick={handleSelectAll}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {sendToAll ? 'Deselect All' : 'Select All'}
            </button>
          </div>

          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
              <p className="mt-2 text-sm text-gray-500">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8">
              <UsersIcon className="h-12 w-12 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No users found</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {users.map((user) => {
                const isSelected = selectedUserIds.includes(user.id);
                const canReceive = user.hasPushToken && user.notificationsEnabled;
                
                return (
                  <div
                    key={user.id}
                    onClick={() => canReceive && handleUserToggle(user.id)}
                    className={`
                      p-3 rounded-lg border cursor-pointer transition-colors
                      ${isSelected 
                        ? 'bg-primary-50 border-primary-500' 
                        : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                      }
                      ${!canReceive ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.name || user.email || 'Unknown User'}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        {user.role && (
                          <p className="text-xs text-gray-400 mt-1 capitalize">{user.role.replace('_', ' ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        {isSelected && (
                          <CheckCircleIcon className="h-5 w-5 text-primary-500" />
                        )}
                        {!canReceive && (
                          <ExclamationTriangleIcon className="h-4 w-4 text-yellow-500" title="No push token or notifications disabled" />
                        )}
                      </div>
                    </div>
                    {!canReceive && (
                      <p className="text-xs text-gray-400 mt-1">
                        {!user.hasPushToken ? 'No push token' : 'Notifications disabled'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-600">
              <strong>{eligibleUsersCount}</strong> of <strong>{users.length}</strong> users can receive notifications
            </p>
          </div>
        </div>

        {/* Right: Notification Form */}
        <div className="lg:col-span-2 bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PaperAirplaneIcon className="h-5 w-5 text-primary-500" />
            Compose Notification
          </h2>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label htmlFor="notification-title" className="block text-sm font-medium text-gray-700 mb-1.5">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="notification-title"
                value={notificationTitle}
                onChange={(e) => setNotificationTitle(e.target.value)}
                placeholder="e.g., New Job Assignment"
                maxLength={100}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
            </div>

            {/* Body/Message */}
            <div>
              <label htmlFor="notification-body" className="block text-sm font-medium text-gray-700 mb-1.5">
                Message <span className="text-red-500">*</span>
              </label>
              <textarea
                id="notification-body"
                value={notificationBody}
                onChange={(e) => setNotificationBody(e.target.value)}
                placeholder="Enter your notification message here..."
                rows={5}
                maxLength={500}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">{notificationBody.length}/500 characters</p>
            </div>

            {/* Optional: Screen Navigation */}
            <div>
              <label htmlFor="notification-screen" className="block text-sm font-medium text-gray-700 mb-1.5">
                Open Screen (Optional)
              </label>
              <select
                id="notification-screen"
                value={notificationData.screen || ''}
                onChange={(e) => setNotificationData({ screen: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">No specific screen</option>
                <option value="home">Home</option>
                <option value="jobs">Jobs</option>
                <option value="recurringJobs">Recurring Jobs</option>
                <option value="customers">Customers</option>
                <option value="settings">Settings</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">If set, tapping the notification will open this screen in the mobile app</p>
            </div>

            {/* Send Button */}
            <div className="pt-4 border-t">
              <button
                onClick={handleSendNotification}
                disabled={isSending || selectedUserIds.length === 0 || !notificationTitle.trim() || !notificationBody.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-5 w-5" />
                    <span>Send Notification</span>
                    {selectedUserIds.length > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-primary-700 rounded text-sm">
                        {sendToAll ? eligibleUsersCount : selectedUserIds.length}
                      </span>
                    )}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotificationsPage;

