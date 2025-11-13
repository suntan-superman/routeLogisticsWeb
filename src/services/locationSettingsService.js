import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, auth } from './firebase';

class LocationSettingsService {
  // Get location settings for a company
  static async getCompanySettings(companyId) {
    try {
      if (!companyId) {
        return { success: false, error: 'Company ID required' };
      }

      const settingsRef = doc(db, 'technicianLocationSettings', companyId);
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        return {
          success: true,
          settings: settingsDoc.data(),
        };
      }

      // Return null if doesn't exist (admin needs to create it)
      return {
        success: true,
        settings: null,
      };
    } catch (error) {
      console.error('Error getting location settings:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Create/update location settings for a company
  static async updateCompanySettings(companyId, settings) {
    try {
      if (!companyId) {
        return { success: false, error: 'Company ID required' };
      }

      const settingsRef = doc(db, 'technicianLocationSettings', companyId);
      
      const dataToSave = {
        ...settings,
        companyId,
        updatedAt: Timestamp.now(),
      };

      // If this is the first time creating, add createdAt
      const existing = await getDoc(settingsRef);
      if (!existing.exists()) {
        dataToSave.createdAt = Timestamp.now();
      }

      await setDoc(settingsRef, dataToSave, { merge: true });

      return {
        success: true,
        settings: dataToSave,
      };
    } catch (error) {
      console.error('Error updating location settings:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Get technician schedule exceptions (sick, vacation, off days, OT)
  static async getTechnicianExceptions(companyId, userId = null, dateRange = null) {
    try {
      if (!companyId) {
        return { success: false, error: 'Company ID required' };
      }

      let q;
      if (userId) {
        q = query(
          collection(db, 'technicianScheduleExceptions'),
          where('companyId', '==', companyId),
          where('userId', '==', userId)
        );
      } else {
        q = query(
          collection(db, 'technicianScheduleExceptions'),
          where('companyId', '==', companyId)
        );
      }

      const snapshot = await getDocs(q);
      const exceptions = [];

      snapshot.forEach((doc) => {
        const exception = {
          id: doc.id,
          ...doc.data(),
        };

        // Filter by date range if provided
        if (dateRange) {
          const exceptionStart = new Date(exception.startDate);
          const exceptionEnd = new Date(exception.endDate);
          const rangeStart = new Date(dateRange.start);
          const rangeEnd = new Date(dateRange.end);

          if (exceptionStart <= rangeEnd && exceptionEnd >= rangeStart) {
            exceptions.push(exception);
          }
        } else {
          exceptions.push(exception);
        }
      });

      return {
        success: true,
        exceptions,
      };
    } catch (error) {
      console.error('Error getting technician exceptions:', error);
      return {
        success: false,
        error: error.message,
        exceptions: [],
      };
    }
  }

  // Add schedule exception (sick day, vacation, off day, OT)
  static async addScheduleException(companyId, userId, exceptionData) {
    try {
      if (!companyId || !userId) {
        return { success: false, error: 'Company ID and User ID required' };
      }

      const exception = {
        ...exceptionData,
        companyId,
        userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      const docRef = await addDoc(
        collection(db, 'technicianScheduleExceptions'),
        exception
      );

      return {
        success: true,
        exception: {
          id: docRef.id,
          ...exception,
        },
      };
    } catch (error) {
      console.error('Error adding schedule exception:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Update schedule exception
  static async updateScheduleException(exceptionId, updates) {
    try {
      if (!exceptionId) {
        return { success: false, error: 'Exception ID required' };
      }

      const exceptionRef = doc(db, 'technicianScheduleExceptions', exceptionId);
      
      await updateDoc(exceptionRef, {
        ...updates,
        updatedAt: Timestamp.now(),
      });

      return { success: true };
    } catch (error) {
      console.error('Error updating schedule exception:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Delete schedule exception
  static async deleteScheduleException(exceptionId) {
    try {
      if (!exceptionId) {
        return { success: false, error: 'Exception ID required' };
      }

      await deleteDoc(doc(db, 'technicianScheduleExceptions', exceptionId));

      return { success: true };
    } catch (error) {
      console.error('Error deleting schedule exception:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Check if technician should be tracked on a specific date
  static async shouldTrackTechnician(companyId, userId, date) {
    try {
      // Get company settings
      const settingsResult = await this.getCompanySettings(companyId);
      if (!settingsResult.success || !settingsResult.settings?.autoTrackingEnabled) {
        return { shouldTrack: false, reason: 'auto_tracking_disabled' };
      }

      const settings = settingsResult.settings;
      const checkDate = new Date(date);
      const dayName = [
        'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
      ][checkDate.getDay()];

      // Check if it's a work day
      if (!settings.workDays?.includes(dayName)) {
        return { shouldTrack: false, reason: 'not_work_day' };
      }

      // Check for exceptions on this date
      const exceptions = await this.getTechnicianExceptions(companyId, userId);
      if (!exceptions.success) {
        return { shouldTrack: true, reason: 'error_checking_exceptions' };
      }

      const dateStr = date.toISOString().split('T')[0];
      
      for (const exception of exceptions.exceptions || []) {
        const exceptionStart = exception.startDate.toISOString?.().split('T')[0] || exception.startDate;
        const exceptionEnd = exception.endDate.toISOString?.().split('T')[0] || exception.endDate;

        if (dateStr >= exceptionStart && dateStr <= exceptionEnd) {
          if (exception.type === 'sick_day' || exception.type === 'vacation' || exception.type === 'off_day') {
            return { shouldTrack: false, reason: exception.type };
          } else if (exception.type === 'overtime') {
            // OT doesn't affect tracking, just note it
            return { shouldTrack: true, reason: 'overtime_scheduled', overtime: true };
          }
        }
      }

      return { shouldTrack: true, reason: 'normal_workday' };
    } catch (error) {
      console.error('Error checking if should track:', error);
      return { shouldTrack: true, reason: 'error', error: error.message };
    }
  }

  // Get all exceptions for a technician (calendar view)
  static async getTechnicianCalendar(companyId, userId, year, month) {
    try {
      const exceptions = await this.getTechnicianExceptions(companyId, userId);
      if (!exceptions.success) {
        return exceptions;
      }

      const calendar = {};

      exceptions.exceptions?.forEach((exception) => {
        const startDate = new Date(exception.startDate);
        const endDate = new Date(exception.endDate);
        
        // Fill in all dates in the range
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          calendar[dateStr] = {
            type: exception.type,
            description: exception.description,
            exceptionId: exception.id,
          };
          currentDate.setDate(currentDate.getDate() + 1);
        }
      });

      return {
        success: true,
        calendar,
      };
    } catch (error) {
      console.error('Error getting technician calendar:', error);
      return {
        success: false,
        error: error.message,
        calendar: {},
      };
    }
  }
}

export default LocationSettingsService;

