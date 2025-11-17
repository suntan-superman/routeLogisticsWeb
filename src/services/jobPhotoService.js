import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from './firebase';
import StorageService from './storageService';

const COLLECTION = 'jobPhotos';

const baseCollectionRef = collection(db, COLLECTION);

/**
 * Format Firestore photo document into UI-friendly object
 * @param {import('firebase/firestore').QueryDocumentSnapshot} snapshot
 */
const mapPhotoDoc = (snapshot) => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    capturedAt: data.capturedAt?.toDate?.() || data.capturedAt || null,
    createdAt: data.createdAt?.toDate?.() || null,
    updatedAt: data.updatedAt?.toDate?.() || null
  };
};

class JobPhotoService {
  /**
   * Upload a job photo and persist metadata
   * @param {Object} params
   * @param {File|Blob} params.file
   * @param {string} params.companyId
   * @param {string} params.jobId
   * @param {string} params.uploadedBy
   * @param {string} [params.caption]
   * @param {Function} [params.onProgress]
   */
  static async uploadPhoto({ file, companyId, jobId, uploadedBy, caption = '', onProgress }) {
    try {
      const uploadResult = await StorageService.uploadJobPhoto(file, {
        companyId,
        jobId,
        uploadedBy,
        onProgress
      });

      if (!uploadResult.success) {
        return uploadResult;
      }

      const now = new Date();

      const payload = {
        companyId,
        jobId,
        uploadedBy,
        caption,
        storagePath: uploadResult.path,
        downloadURL: uploadResult.url,
        thumbnailURL: uploadResult.thumbnailURL || null,
        thumbnailPath: uploadResult.thumbnailPath || null,
        mimeType: uploadResult.contentType || file?.type || 'image/jpeg',
        size: uploadResult.size || file?.size || 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(baseCollectionRef, payload);

      return {
        success: true,
        photo: {
          id: docRef.id,
          ...payload,
          createdAt: now,
          updatedAt: now
        }
      };
    } catch (error) {
      console.error('Error creating job photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload photo'
      };
    }
  }

  /**
   * Retrieve job photos ordered by creation date (desc)
   * @param {string} companyId
   * @param {string} jobId
   */
  static async getJobPhotos(companyId, jobId) {
    try {
      if (!companyId || !jobId) {
        return { success: false, error: 'Missing companyId or jobId' };
      }

      const photosQuery = query(
        baseCollectionRef,
        where('companyId', '==', companyId),
        where('jobId', '==', jobId),
        orderBy('createdAt', 'desc')
      );

      const snapshot = await getDocs(photosQuery);
      const photos = snapshot.docs.map(mapPhotoDoc);

      return {
        success: true,
        photos
      };
    } catch (error) {
      console.error('Error loading job photos:', error);
      return {
        success: false,
        error: error.message || 'Failed to load job photos'
      };
    }
  }

  /**
   * Update photo metadata (e.g., caption)
   * @param {string} photoId
   * @param {Object} updates
   */
  static async updatePhoto(photoId, updates = {}) {
    try {
      if (!photoId) {
        return { success: false, error: 'Missing photoId' };
      }

      const photoRef = doc(db, COLLECTION, photoId);
      await updateDoc(photoRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating job photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to update photo'
      };
    }
  }

  /**
   * Delete a job photo (metadata + storage)
   * @param {Object} params
   * @param {string} params.photoId
   * @param {string} [params.storagePath]
   */
  static async deletePhoto({ photoId, storagePath }) {
    try {
      if (!photoId) {
        return { success: false, error: 'Missing photoId' };
      }

      if (storagePath) {
        await StorageService.deleteFile(storagePath);
      }

      await deleteDoc(doc(db, COLLECTION, photoId));

      return { success: true };
    } catch (error) {
      console.error('Error deleting job photo:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete photo'
      };
    }
  }
}

export default JobPhotoService;

export const getJobPhotos = async (companyId, jobId) => JobPhotoService.getJobPhotos(companyId, jobId);

