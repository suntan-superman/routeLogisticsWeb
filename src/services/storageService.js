import { storage } from './firebase';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

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
   * Upload a job photo to Firebase Storage with optional progress tracking
   * @param {File|Blob} file - Photo file (web) or blob-like object
   * @param {Object} options
   * @param {string} options.companyId
   * @param {string} options.jobId
   * @param {string} options.uploadedBy
   * @param {Function} [options.onProgress] - progress callback (0-100)
   * @returns {Promise<{success: boolean, url?: string, path?: string, error?: string}>}
   */
  static async uploadJobPhoto(file, { companyId, jobId, uploadedBy, onProgress } = {}) {
    try {
      if (!file) {
        return { success: false, error: 'No file provided' };
      }

      if (!companyId || !jobId || !uploadedBy) {
        return { success: false, error: 'Missing required photo metadata (companyId, jobId, uploadedBy).' };
      }

      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (file.type && !allowedImageTypes.includes(file.type)) {
        return { success: false, error: 'Unsupported image format. Please upload JPEG, PNG, or HEIC files.' };
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size && file.size > maxSize) {
        return { success: false, error: 'Image too large. Maximum size is 10MB.' };
      }

      const fileExtensionFromType = () => {
        if (!file.type) return 'jpg';
        const [, subtype] = file.type.split('/');
        if (!subtype) return 'jpg';
        if (subtype === 'jpeg') return 'jpg';
        return subtype;
      };

      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const extension = (file.name && file.name.includes('.'))
        ? file.name.split('.').pop()
        : fileExtensionFromType();
      const timestamp = Date.now();
      const fileName = `${timestamp}_${randomSuffix}.${extension}`;
      const path = `companies/${companyId}/jobs/${jobId}/photos/${fileName}`;
      const storageRef = ref(storage, path);

      const uploadTask = uploadBytesResumable(storageRef, file);

      const snapshot = await new Promise((resolve, reject) => {
        uploadTask.on(
          'state_changed',
          (uploadSnapshot) => {
            if (onProgress) {
              const progress = Math.round((uploadSnapshot.bytesTransferred / uploadSnapshot.totalBytes) * 100);
              onProgress(progress);
            }
          },
          reject,
          () => resolve(uploadTask.snapshot)
        );
      });

      const downloadURL = await getDownloadURL(snapshot.ref);

      return {
        success: true,
        url: downloadURL,
        path: snapshot.ref.fullPath,
        size: snapshot.totalBytes,
        contentType: file.type || snapshot.metadata?.contentType || 'image/jpeg'
      };
    } catch (error) {
      console.error('Error uploading job photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload photo'
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

