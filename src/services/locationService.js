// Location Service for Web App
// Provides access to GPS tracking data for administrators

import { collection, query, where, orderBy, getDocs, limit, getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

class LocationService {
  // Get locations for a specific user within a date range
  static async getUserLocations(userId, companyId, startDate, endDate) {
    try {
      const locationsRef = collection(db, 'locations');
      
      const q = query(
        locationsRef,
        where('userId', '==', userId),
        where('companyId', '==', companyId),
        where('timestamp', '>=', startDate),
        where('timestamp', '<=', endDate),
        orderBy('timestamp', 'asc')
      );

      const snapshot = await getDocs(q);
      const locations = [];
      
      snapshot.forEach((doc) => {
        locations.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return {
        success: true,
        locations,
      };
    } catch (error) {
      console.error('Error fetching user locations:', error);
      return {
        success: false,
        error: error.message,
        locations: [],
      };
    }
  }

  // Get all technicians' locations for a company (current location only)
  static async getCurrentLocations(companyId) {
    try {
      // Get all team members for the company first
      const teamMembersRef = collection(db, 'teamMembers');
      const teamQuery = query(
        teamMembersRef,
        where('companyId', '==', companyId),
        where('status', '==', 'active')
      );
      
      const teamSnapshot = await getDocs(teamQuery);
      const userIds = [];
      
      teamSnapshot.forEach((doc) => {
        userIds.push(doc.data().userId);
      });

      // Get current locations for each user
      const currentLocations = [];
      
      for (const userId of userIds) {
        try {
          const userRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.currentLocation && userData.locationUpdatedAt) {
              // Check if location is recent (within last 10 minutes)
              const updateTime = new Date(userData.locationUpdatedAt);
              const now = new Date();
              const minutesSinceUpdate = (now - updateTime) / (1000 * 60);
              
              if (minutesSinceUpdate <= 10) {
                currentLocations.push({
                  userId,
                  userName: userData.name || 'Unknown',
                  userEmail: userData.email || '',
                  location: userData.currentLocation,
                  updatedAt: userData.locationUpdatedAt,
                  minutesAgo: Math.round(minutesSinceUpdate),
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error fetching location for user ${userId}:`, error);
        }
      }

      return {
        success: true,
        locations: currentLocations,
      };
    } catch (error) {
      console.error('Error fetching current locations:', error);
      return {
        success: false,
        error: error.message,
        locations: [],
      };
    }
  }

  // Get work sessions for a user within a date range
  static async getUserWorkSessions(userId, companyId, startDate, endDate) {
    try {
      const sessionsRef = collection(db, 'workSessions');
      
      const q = query(
        sessionsRef,
        where('userId', '==', userId),
        where('companyId', '==', companyId),
        where('startTime', '>=', startDate),
        where('startTime', '<=', endDate),
        orderBy('startTime', 'desc')
      );

      const snapshot = await getDocs(q);
      const sessions = [];
      
      snapshot.forEach((doc) => {
        sessions.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return {
        success: true,
        sessions,
      };
    } catch (error) {
      console.error('Error fetching work sessions:', error);
      return {
        success: false,
        error: error.message,
        sessions: [],
      };
    }
  }

  // Get route statistics for a date range
  static async getRouteStatistics(userId, companyId, startDate, endDate) {
    try {
      const result = await this.getUserLocations(userId, companyId, startDate, endDate);
      
      if (!result.success || result.locations.length === 0) {
        return {
          success: true,
          stats: {
            totalPoints: 0,
            totalDistance: 0,
            totalTime: 0,
            averageSpeed: 0,
            jobSitesVisited: 0,
          },
        };
      }

      const locations = result.locations;
      let totalDistance = 0;
      let jobSitesVisited = new Set();
      
      // Calculate distance between consecutive points
      for (let i = 1; i < locations.length; i++) {
        const prev = locations[i - 1];
        const curr = locations[i];
        
        const distance = this.calculateDistance(
          prev.latitude,
          prev.longitude,
          curr.latitude,
          curr.longitude
        );
        
        totalDistance += distance;
        
        if (curr.isJobSite && curr.jobId) {
          jobSitesVisited.add(curr.jobId);
        }
      }

      // Calculate time span
      const startTime = new Date(locations[0].timestamp);
      const endTime = new Date(locations[locations.length - 1].timestamp);
      const totalTime = (endTime - startTime) / (1000 * 60); // minutes
      
      // Calculate average speed (if speed data available)
      const speeds = locations
        .filter((loc) => loc.speed && loc.speed > 0)
        .map((loc) => loc.speed);
      const averageSpeed = speeds.length > 0
        ? speeds.reduce((a, b) => a + b, 0) / speeds.length
        : 0;

      return {
        success: true,
        stats: {
          totalPoints: locations.length,
          totalDistance: Math.round(totalDistance / 1000 * 100) / 100, // km, 2 decimals
          totalTime: Math.round(totalTime), // minutes
          averageSpeed: Math.round(averageSpeed * 100) / 100, // km/h, 2 decimals
          jobSitesVisited: jobSitesVisited.size,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        },
      };
    } catch (error) {
      console.error('Error calculating route statistics:', error);
      return {
        success: false,
        error: error.message,
        stats: null,
      };
    }
  }

  // Calculate distance between two coordinates (Haversine formula)
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }
}

export default LocationService;

