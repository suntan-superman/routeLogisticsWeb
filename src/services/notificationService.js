/**
 * Notification Service for Web App
 * Allows admins to send push notifications to users
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import app from './firebase';

class NotificationService {
  /**
   * Send push notification to one or more users
   * @param {string|Array<string>} userIds - Single user ID or array of user IDs
   * @param {string} title - Notification title
   * @param {string} body - Notification body/message
   * @param {Object} data - Optional data payload (e.g., { screen: 'jobs', jobId: '123' })
   * @returns {Promise<{success: boolean, sent?: number, total?: number, error?: string}>}
   */
  static async sendNotification(userIds, title, body, data = {}) {
    try {
      // Convert single userId to array
      const targetUserIds = Array.isArray(userIds) ? userIds : [userIds];

      if (targetUserIds.length === 0) {
        return {
          success: false,
          error: 'At least one user ID is required'
        };
      }

      if (!title || !body) {
        return {
          success: false,
          error: 'Title and body are required'
        };
      }

      // Call Firebase Cloud Function
      const sendPushNotification = httpsCallable(
        getFunctions(app, 'us-central1'),
        'sendPushNotification'
      );

      const result = await sendPushNotification({
        userIds: targetUserIds,
        title,
        body,
        data
      });

      return {
        success: true,
        sent: result.data?.sent || 0,
        total: result.data?.total || 0,
        recipients: result.data?.recipients || []
      };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return {
        success: false,
        error: error.message || 'Failed to send notification'
      };
    }
  }

  /**
   * Send notification to all users in a company
   * @param {string} companyId - Company ID
   * @param {string} title - Notification title
   * @param {string} body - Notification body/message
   * @param {Object} data - Optional data payload
   * @returns {Promise<{success: boolean, sent?: number, total?: number, error?: string}>}
   */
  static async sendNotificationToCompany(companyId, title, body, data = {}) {
    try {
      // This would need to fetch all user IDs for the company first
      // For now, we'll need to implement this in the Cloud Function
      // or fetch user IDs here and call sendNotification
      
      // TODO: Implement company-wide notifications
      // This requires fetching all users with companyId from Firestore
      
      return {
        success: false,
        error: 'Company-wide notifications not yet implemented. Please specify user IDs.'
      };
    } catch (error) {
      console.error('Error sending company notification:', error);
      return {
        success: false,
        error: error.message || 'Failed to send notification'
      };
    }
  }
}

export default NotificationService;

