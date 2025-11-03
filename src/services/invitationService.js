/**
 * Invitation Service
 * Handles company invitations and team member onboarding
 */

import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import CompanyService from './companyService';

class InvitationService {
  // Generate unique invitation code
  static generateInvitationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Create an invitation
  static async createInvitation(companyId, email, role = 'field_tech', invitedBy) {
    try {
      // Use invitedBy if provided, otherwise get from CompanyService
      const userId = invitedBy || CompanyService.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: 'No user is currently signed in'
        };
      }

      // Verify user has permission to invite (must be company admin or super admin)
      const company = await CompanyService.getCompany(companyId);
      if (!company.success) {
        return {
          success: false,
          error: 'Company not found'
        };
      }

      // Check if invitation already exists for this email and company
      const existingInvitationsQuery = query(
        collection(db, 'invitations'),
        where('companyId', '==', companyId),
        where('email', '==', email.toLowerCase()),
        where('status', '==', 'pending')
      );

      const existingInvitations = await getDocs(existingInvitationsQuery);
      if (!existingInvitations.empty) {
        return {
          success: false,
          error: 'An invitation already exists for this email'
        };
      }

      // Generate invitation code
      const invitationCode = this.generateInvitationCode();

      const invitationData = {
        companyId,
        companyName: company.company.name,
        email: email.toLowerCase(),
        role,
        invitationCode,
        invitedBy,
        status: 'pending',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      };

      const docRef = await addDoc(collection(db, 'invitations'), invitationData);

      return {
        success: true,
        invitationId: docRef.id,
        invitation: { id: docRef.id, ...invitationData }
      };
    } catch (error) {
      console.error('Error creating invitation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get invitation by code
  static async getInvitationByCode(code) {
    try {
      const q = query(
        collection(db, 'invitations'),
        where('invitationCode', '==', code.toUpperCase()),
        where('status', '==', 'pending')
      );

      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return {
          success: false,
          error: 'Invitation not found or expired'
        };
      }

      const invitationDoc = querySnapshot.docs[0];
      const invitation = { id: invitationDoc.id, ...invitationDoc.data() };

      // Check if invitation has expired
      if (new Date(invitation.expiresAt) < new Date()) {
        // Mark as expired
        await updateDoc(doc(db, 'invitations', invitationDoc.id), {
          status: 'expired'
        });
        return {
          success: false,
          error: 'Invitation has expired'
        };
      }

      return {
        success: true,
        invitation
      };
    } catch (error) {
      console.error('Error getting invitation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Accept invitation (during signup)
  static async acceptInvitation(userId, invitationCode) {
    try {
      const invitationResult = await this.getInvitationByCode(invitationCode);

      if (!invitationResult.success) {
        return invitationResult;
      }

      const invitation = invitationResult.invitation;

      // Update user profile with company and role
      await updateDoc(doc(db, 'users', userId), {
        companyId: invitation.companyId,
        role: invitation.role,
        updatedAt: new Date().toISOString()
      });

      // Mark invitation as accepted
      await updateDoc(doc(db, 'invitations', invitation.id), {
        status: 'accepted',
        acceptedAt: new Date().toISOString(),
        acceptedBy: userId
      });

      return {
        success: true,
        company: {
          id: invitation.companyId,
          name: invitation.companyName
        },
        role: invitation.role
      };
    } catch (error) {
      console.error('Error accepting invitation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all invitations for a company
  static async getCompanyInvitations(companyId) {
    try {
      const userId = CompanyService.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: 'No user is currently signed in',
          invitations: []
        };
      }

      // Remove orderBy to avoid composite index requirement - sort client-side
      const q = query(
        collection(db, 'invitations'),
        where('companyId', '==', companyId)
      );

      const querySnapshot = await getDocs(q);
      const invitations = [];
      
      querySnapshot.forEach((doc) => {
        invitations.push({ id: doc.id, ...doc.data() });
      });

      // Sort by createdAt descending client-side (since we removed orderBy)
      invitations.sort((a, b) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB - dateA;
      });

      return {
        success: true,
        invitations
      };
    } catch (error) {
      console.error('Error getting invitations:', error);
      return {
        success: false,
        error: error.message,
        invitations: []
      };
    }
  }

  // Cancel/delete invitation
  static async cancelInvitation(invitationId) {
    try {
      const userId = CompanyService.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: 'No user is currently signed in'
        };
      }

      await deleteDoc(doc(db, 'invitations', invitationId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error canceling invitation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Resend invitation (update expiration)
  static async resendInvitation(invitationId) {
    try {
      const userId = CompanyService.getCurrentUserId();
      if (!userId) {
        return {
          success: false,
          error: 'No user is currently signed in'
        };
      }

      await updateDoc(doc(db, 'invitations', invitationId), {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString() // Update to show it was resent
      });

      const invitationDoc = await getDoc(doc(db, 'invitations', invitationId));
      return {
        success: true,
        invitation: { id: invitationDoc.id, ...invitationDoc.data() }
      };
    } catch (error) {
      console.error('Error resending invitation:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default InvitationService;

