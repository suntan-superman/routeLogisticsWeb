import React, { useState, useEffect, useCallback } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import QuickBooksService from '../services/quickbooksService';
import {
  LinkIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const QuickBooksSettingsPage = () => {
  const { getEffectiveCompanyId, userProfile } = useCompany();
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLogs, setSyncLogs] = useState([]);

  const companyId = getEffectiveCompanyId();

  const loadConnectionStatus = useCallback(async () => {
    if (!companyId) return;

    setIsLoading(true);
    try {
      const status = await QuickBooksService.getConnectionStatus(companyId);
      setConnectionStatus(status);
    } catch (error) {
      console.error('Error loading connection status:', error);
      toast.error('Failed to load QuickBooks connection status');
      setConnectionStatus({ connected: false, status: 'error' });
    }
    setIsLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadConnectionStatus();
  }, [loadConnectionStatus]);

  const handleConnect = async () => {
    if (!companyId) {
      toast.error('Company ID not found');
      return;
    }

    setIsConnecting(true);
    try {
      // Get OAuth URL
      const redirectUri = `${window.location.origin}/quickbooks/callback`;
      const { authUrl } = await QuickBooksService.initiateOAuth(companyId, redirectUri);

      // Open OAuth flow in popup window
      const popup = window.open(
        authUrl,
        'QuickBooks OAuth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      // Listen for OAuth completion message
      const messageListener = (event) => {
        if (event.data.type === 'quickbooks_connected' && event.data.companyId === companyId) {
          window.removeEventListener('message', messageListener);
          popup.close();
          setIsConnecting(false);
          loadConnectionStatus();
          toast.success('QuickBooks connected successfully!');
        }
      };

      window.addEventListener('message', messageListener);

      // Check if popup was closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageListener);
          setIsConnecting(false);
        }
      }, 1000);
    } catch (error) {
      console.error('Error connecting QuickBooks:', error);
      toast.error(error.message || 'Failed to connect QuickBooks');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!companyId) return;

    if (!window.confirm('Are you sure you want to disconnect QuickBooks? This will stop all synchronization.')) {
      return;
    }

    setIsLoading(true);
    try {
      await QuickBooksService.disconnect(companyId);
      setConnectionStatus({ connected: false, status: 'not_connected' });
      toast.success('QuickBooks disconnected successfully');
    } catch (error) {
      console.error('Error disconnecting QuickBooks:', error);
      toast.error(error.message || 'Failed to disconnect QuickBooks');
    }
    setIsLoading(false);
  };

  const handleSyncServices = async () => {
    if (!companyId) return;

    setIsSyncing(true);
    try {
      // TODO: Get GL account mapping from company settings
      const glAccountMapping = {}; // Will be populated from company settings
      
      const result = await QuickBooksService.syncServices(companyId, glAccountMapping);
      
      if (result.success) {
        toast.success(`Successfully synced ${result.synced.length} services`);
        if (result.errors.length > 0) {
          toast.error(`${result.errors.length} services failed to sync`);
        }
      } else {
        toast.error('Failed to sync services');
      }
    } catch (error) {
      console.error('Error syncing services:', error);
      toast.error(error.message || 'Failed to sync services');
    }
    setIsSyncing(false);
  };

  if (isLoading && !connectionStatus) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">QuickBooks Integration</h1>
          <p className="mt-2 text-sm text-gray-600">
            Connect your QuickBooks Online account to sync customers, services, invoices, and payments
          </p>
        </div>

        {/* Connection Status Card */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {connectionStatus?.connected ? (
                <CheckCircleIcon className="w-8 h-8 text-green-600 mr-3" />
              ) : (
                <XCircleIcon className="w-8 h-8 text-gray-400 mr-3" />
              )}
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {connectionStatus?.connected ? 'QuickBooks Connected' : 'Not Connected'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {connectionStatus?.connected
                    ? `Connected to QuickBooks company (Realm ID: ${connectionStatus.realmId})`
                    : 'Connect your QuickBooks account to enable synchronization'}
                </p>
                {connectionStatus?.connected && connectionStatus.lastSyncAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    Last sync: {new Date(connectionStatus.lastSyncAt.toDate()).toLocaleString()}
                  </p>
                )}
                {connectionStatus?.errorMessage && (
                  <div className="mt-2 flex items-center text-sm text-red-600">
                    <ExclamationTriangleIcon className="w-4 h-4 mr-1" />
                    {connectionStatus.errorMessage}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              {connectionStatus?.connected ? (
                <>
                  <button
                    onClick={handleSyncServices}
                    disabled={isSyncing}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowPathIcon className={`w-5 h-5 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                    Sync Services
                  </button>
                  <button
                    onClick={handleDisconnect}
                    disabled={isLoading}
                    className="inline-flex items-center px-4 py-2 border border-red-300 rounded-lg bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XMarkIcon className="w-5 h-5 mr-2" />
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <LinkIcon className={`w-5 h-5 mr-2 ${isConnecting ? 'animate-spin' : ''}`} />
                  {isConnecting ? 'Connecting...' : 'Connect QuickBooks'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Sync Status */}
        {connectionStatus?.connected && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Sync Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500">Customers</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {connectionStatus.customersSynced || 0}
                </div>
                <div className="text-xs text-gray-400 mt-1">Synced</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500">Services</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {connectionStatus.servicesSynced || 0}
                </div>
                <div className="text-xs text-gray-400 mt-1">Synced</div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-500">Invoices</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {connectionStatus.invoicesSynced || 0}
                </div>
                <div className="text-xs text-gray-400 mt-1">Synced</div>
              </div>
            </div>
          </div>
        )}

        {/* Information Section */}
        <div className="bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <Cog6ToothIcon className="w-5 h-5 mr-2 text-green-600" />
            How It Works
          </h3>
          <div className="prose prose-sm max-w-none">
            <ul className="list-disc list-inside space-y-2 text-gray-600">
              <li>
                <strong>Customer Sync:</strong> Customers are automatically synced to QuickBooks every 10 minutes, 
                or you can manually sync individual customers.
              </li>
              <li>
                <strong>Service Sync:</strong> Your company services are synced as QuickBooks Items. 
                You can manually sync all services at once.
              </li>
              <li>
                <strong>Invoice Sync:</strong> When an invoice is created and sent, it automatically syncs to QuickBooks.
              </li>
              <li>
                <strong>Payment Sync:</strong> Payments processed through Stripe are automatically synced to QuickBooks.
              </li>
              <li>
                <strong>Two-Way Sync:</strong> Changes made in QuickBooks (customers, items) are synced back to Route Logistics via webhooks.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuickBooksSettingsPage;

