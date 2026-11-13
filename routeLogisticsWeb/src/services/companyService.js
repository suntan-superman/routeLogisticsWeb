import { 
  collection, 
  doc, 
  getDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where,
  addDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { syncTenancy } from './tenancy';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

class CompanyService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Create a new company
  static async createCompany(companyData) {
    try {
      const userId = this.getCurrentUserId();
      
      const company = {
        ...companyData,
        ownerId: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      // Add company to companies collection
      const docRef = await addDoc(collection(db, 'companies'), company);
      
      // Update user profile with company ID
      await updateDoc(doc(db, 'users', userId), {
        companyId: docRef.id,
        updatedAt: new Date().toISOString()
      });

      // Server mints owner claims and backfills existing data with the new companyId.
      await syncTenancy();

      return {
        success: true,
        companyId: docRef.id,
        company: { id: docRef.id, ...company }
      };
    } catch (error) {
      console.error('Error creating company:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get company by ID
  static async getCompany(companyId) {
    try {
      const companyDoc = await getDoc(doc(db, 'companies', companyId));
      
      if (!companyDoc.exists()) {
        return {
          success: false,
          error: 'Company not found'
        };
      }

      return {
        success: true,
        company: { id: companyDoc.id, ...companyDoc.data() }
      };
    } catch (error) {
      console.error('Error getting company:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get company by user ID
  static async getCompanyByUserId(userId) {
    try {
      const q = query(
        collection(db, 'companies'),
        where('ownerId', '==', userId)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return {
          success: false,
          error: 'No company found for this user'
        };
      }

      const companyDoc = querySnapshot.docs[0];
      return {
        success: true,
        company: { id: companyDoc.id, ...companyDoc.data() }
      };
    } catch (error) {
      console.error('Error getting company by user ID:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update company
  static async updateCompany(companyId, updates) {
    try {
      const userId = this.getCurrentUserId();
      
      // Verify user owns the company
      const companyResult = await this.getCompany(companyId);
      if (!companyResult.success) {
        return companyResult;
      }

      if (companyResult.company.ownerId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to update this company'
        };
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'companies', companyId), updatedData);

      return {
        success: true,
        company: { ...companyResult.company, ...updatedData }
      };
    } catch (error) {
      console.error('Error updating company:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async addTeamMember(companyId, email, role = 'technician') {
    try {
      const result = await httpsCallable(functions, 'sendTeamInviteEmail')({ companyId, email, role });
      // Directly shared links use the app the owner is actually visiting. Email links
      // use the separately configured server origin when SMTP is enabled.
      const invitation = new URL(result.data.inviteUrl);
      const inviteUrl = new URL(`${invitation.pathname}${invitation.search}${invitation.hash}`, window.location.origin).href;
      return { success: true, ...result.data, inviteUrl };
    } catch (error) { return { success: false, error: error.message }; }
  }

  // Get team members for a company
  static async getTeamMembers(companyId) {
    try {
      const q = query(
        collection(db, 'teamMembers'),
        where('companyId', '==', companyId)
      );
      
      const querySnapshot = await getDocs(q);
      const teamMembers = [];
      
      querySnapshot.forEach((doc) => {
        if (!['removed', 'superseded'].includes(doc.data().status)) teamMembers.push({ ...doc.data(), id: doc.id });
      });

      return {
        success: true,
        teamMembers
      };
    } catch (error) {
      console.error('Error getting team members:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async updateTeamMember(memberId, updates) {
    try {
      await httpsCallable(functions, 'manageTeamMember')({ memberId, ...updates });
      return { success: true };
    } catch (error) { return { success: false, error: error.message }; }
  }

  // Removal is audited and revokes access without deleting the original record.
  static async removeTeamMember(teamMemberId) {
    return this.updateTeamMember(teamMemberId, { action: 'remove' });
  }
}

export default CompanyService;
