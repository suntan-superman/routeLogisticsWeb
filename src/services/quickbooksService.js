/**
 * QuickBooks Integration Service
 * Frontend service for interacting with QuickBooks Cloud Functions
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth } from './firebase';

const functions = getFunctions();
const functionsUrl = 'https://us-central1-mi-factotum-field-service.cloudfunctions.net';

class QuickBooksService {
  /**
   * Get Firebase Auth ID token for authenticated requests
   */
  static async getIdToken() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('User not authenticated');
    }
    return await user.getIdToken();
  }

  /**
   * Initiate QuickBooks OAuth flow
   * @param {string} companyId - Company ID
   * @param {string} redirectUri - OAuth redirect URI
   * @returns {Promise<Object>} { authUrl, state }
   */
  static async initiateOAuth(companyId, redirectUri) {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${functionsUrl}/initiateQuickBooksOAuth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId,
          redirectUri
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to initiate OAuth flow');
      }

      return data;
    } catch (error) {
      console.error('Error initiating QuickBooks OAuth:', error);
      throw error;
    }
  }

  /**
   * Get QuickBooks connection status
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Connection status
   */
  static async getConnectionStatus(companyId) {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(
        `${functionsUrl}/getQuickBooksConnectionStatus?companyId=${companyId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${idToken}`
          }
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get connection status');
      }

      return data;
    } catch (error) {
      console.error('Error getting QuickBooks connection status:', error);
      throw error;
    }
  }

  /**
   * Disconnect QuickBooks connection
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Success response
   */
  static async disconnect(companyId) {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${functionsUrl}/disconnectQuickBooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disconnect QuickBooks');
      }

      return data;
    } catch (error) {
      console.error('Error disconnecting QuickBooks:', error);
      throw error;
    }
  }

  /**
   * Sync customer to QuickBooks
   * @param {string} customerId - Customer ID
   * @param {string} companyId - Company ID
   * @returns {Promise<Object>} Sync result
   */
  static async syncCustomer(customerId, companyId) {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${functionsUrl}/syncCustomerToQuickBooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          customerId,
          companyId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync customer');
      }

      return data;
    } catch (error) {
      console.error('Error syncing customer to QuickBooks:', error);
      throw error;
    }
  }

  /**
   * Sync all services to QuickBooks
   * @param {string} companyId - Company ID
   * @param {Object} glAccountMapping - GL account mapping
   * @returns {Promise<Object>} Sync result
   */
  static async syncServices(companyId, glAccountMapping = {}) {
    try {
      const idToken = await this.getIdToken();

      const response = await fetch(`${functionsUrl}/syncServicesToQuickBooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          companyId,
          glAccountMapping
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync services');
      }

      return data;
    } catch (error) {
      console.error('Error syncing services to QuickBooks:', error);
      throw error;
    }
  }
}

export default QuickBooksService;

