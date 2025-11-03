import { storage } from './firebase';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

/**
 * Storage Service for handling file uploads to Firebase Storage
 */
class StorageService {
  /**
   * Upload a file to Firebase Storage
   * @param {File} file - The file to upload
   * @param {string} path - Storage path (e.g., 'companies/{companyId}/logo.png')
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  static async uploadFile(file, path, onProgress = null) {
    try {
      // Validate file
      if (!file) {
        return { success: false, error: 'No file provided' };
      }

      // Create storage reference
      const storageRef = ref(storage, path);

      // Upload file
      const snapshot = await uploadBytes(storageRef, file);

      // Get download URL
      const downloadURL = await getDownloadURL(snapshot.ref);

      return {
        success: true,
        url: downloadURL,
        path: snapshot.ref.fullPath
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload file'
      };
    }
  }

  /**
   * Upload company logo
   * @param {File} file - Logo image file
   * @param {string} companyId - Company ID
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  static async uploadCompanyLogo(file, companyId) {
    try {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        return {
          success: false,
          error: 'Invalid file type. Please upload a JPEG, PNG, GIF, or WebP image.'
        };
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        return {
          success: false,
          error: 'File size too large. Maximum size is 5MB.'
        };
      }

      // Generate unique filename
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const fileName = `logo_${timestamp}.${fileExtension}`;
      const path = `companies/${companyId}/logos/${fileName}`;

      return await this.uploadFile(file, path);
    } catch (error) {
      console.error('Error uploading company logo:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload logo'
      };
    }
  }

  /**
   * Delete a file from Firebase Storage
   * @param {string} path - Storage path to delete
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  static async deleteFile(path) {
    try {
      if (!path) {
        return { success: false, error: 'No path provided' };
      }

      const storageRef = ref(storage, path);
      await deleteObject(storageRef);

      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      // File might not exist, which is okay
      return { success: true }; // Return success even if file doesn't exist
    }
  }

  /**
   * Get download URL for a file
   * @param {string} path - Storage path
   * @returns {Promise<{success: boolean, url?: string, error?: string}>}
   */
  static async getDownloadURL(path) {
    try {
      const storageRef = ref(storage, path);
      const url = await getDownloadURL(storageRef);
      return { success: true, url };
    } catch (error) {
      console.error('Error getting download URL:', error);
      return {
        success: false,
        error: error.message || 'Failed to get download URL'
      };
    }
  }
}

export default StorageService;

