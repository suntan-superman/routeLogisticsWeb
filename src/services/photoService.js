import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { ref, deleteObject } from 'firebase/storage';
import { storage } from './firebase';

class PhotoService {
  /**
   * Get all photos for a specific job
   */
  static async getJobPhotos(jobId) {
    try {
      if (!jobId) {
        return {
          success: false,
          error: 'Job ID is required',
          photos: []
        };
      }

      const photosRef = collection(db, 'jobPhotos');
      const q = query(photosRef, where('jobId', '==', jobId));
      
      const snapshot = await getDocs(q);
      const photos = [];

      snapshot.forEach((doc) => {
        photos.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Sort by capturedAt descending (newest first)
      photos.sort((a, b) => {
        const timeA = new Date(a.capturedAt || a.uploadedAt || 0).getTime();
        const timeB = new Date(b.capturedAt || b.uploadedAt || 0).getTime();
        return timeB - timeA;
      });

      return {
        success: true,
        photos
      };
    } catch (error) {
      console.error('Error getting job photos:', error);
      return {
        success: false,
        error: error.message,
        photos: []
      };
    }
  }

  /**
   * Delete a photo and its metadata
   */
  static async deletePhoto(photoId) {
    try {
      const user = auth.currentUser;
      if (!user) {
        return {
          success: false,
          error: 'User must be authenticated'
        };
      }

      // Get photo metadata
      const photoRef = doc(db, 'jobPhotos', photoId);
      const photoDoc = await getDoc(photoRef);

      if (!photoDoc.exists()) {
        return {
          success: false,
          error: 'Photo not found'
        };
      }

      const photoData = photoDoc.data();

      // Delete from storage if URL exists
      if (photoData.downloadURL || photoData.url || photoData.storagePath) {
        try {
          const storageRef = ref(storage, photoData.storagePath || photoData.url);
          await deleteObject(storageRef);
        } catch (storageError) {
          console.warn('Warning: Could not delete photo from storage:', storageError);
          // Continue with metadata deletion even if storage delete fails
        }
      }

      // Delete thumbnail from storage if it exists
      if (photoData.thumbnailPath) {
        try {
          const thumbnailRef = ref(storage, photoData.thumbnailPath);
          await deleteObject(thumbnailRef);
        } catch (thumbnailError) {
          console.warn('Warning: Could not delete thumbnail from storage:', thumbnailError);
          // Continue even if thumbnail delete fails
        }
      }

      // Delete metadata
      await deleteDoc(photoRef);

      return {
        success: true,
        message: 'Photo deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting photo:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get photo statistics for a job
   */
  static async getPhotoStats(jobId) {
    try {
      const result = await this.getJobPhotos(jobId);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error,
          stats: null
        };
      }

      const photos = result.photos;
      const stats = {
        totalPhotos: photos.length,
        withGPS: photos.filter(p => p.latitude && p.longitude).length,
        withNotes: photos.filter(p => p.notes).length,
        firstPhoto: photos.length > 0 ? photos[photos.length - 1].capturedAt : null,
        lastPhoto: photos.length > 0 ? photos[0].capturedAt : null
      };

      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('Error getting photo stats:', error);
      return {
        success: false,
        error: error.message,
        stats: null
      };
    }
  }

  /**
   * Export photos as a zip file (requires backend implementation)
   */
  static async exportPhotosAsZip(jobId, jobName) {
    try {
      const result = await this.getJobPhotos(jobId);
      
      if (!result.success) {
        return {
          success: false,
          error: result.error
        };
      }

      // In a full implementation, this would:
      // 1. Call a Cloud Function to create a zip file
      // 2. Return a download URL
      // For now, just return the list of photos for client-side zipping
      
      return {
        success: true,
        photos: result.photos,
        message: 'Use client-side zip library (e.g., jszip) to create zip file'
      };
    } catch (error) {
      console.error('Error exporting photos:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default PhotoService;

