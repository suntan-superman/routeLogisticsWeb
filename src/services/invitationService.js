/**
 * Invitation Service
 * Handles company invitations and team member onboarding
 */

import {
  collection,
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
import { db, auth } from './firebase';

const PROJECT_ID = 'mi-factotum-field-service';
const FUNCTIONS_BASE_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;

class InvitationService {
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      return null;
    }
    return user.uid;
  }

  static async getCompany(companyId) {
    try {
      if (!companyId) {
        return {
          success: false,
          error: 'Company ID is required'
        };
      }

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

  static getFunctionUrl(name) {
    return `${FUNCTIONS_BASE_URL}/${name}`;
  }

  // Create an invitation
  static async createInvitation(companyId, email, role = 'field_tech', invitedBy, options = {}) {
    try {
      const currentUserId = invitedBy || this.getCurrentUserId();
      if (!currentUserId) {
        return {
          success: false,
          error: 'No user is currently signed in'
        };
      }

      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        return {
          success: false,
          error: 'Authentication token unavailable'
        };
      }

      const response = await fetch(this.getFunctionUrl('createCompanyInvitation'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          companyId,
          email,
          role,
          createTeamMember: Boolean(options.createTeamMember)
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.success) {
        return {
          success: false,
          error: data.error || 'Failed to create invitation'
        };
      }

      return {
        success: true,
        invitationId: data.invitation?.id,
        invitation: data.invitation,
        teamMember: data.teamMember || null
      };
    } catch (error) {
      console.error('Error creating invitation:', error.code, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async verifyInvitationCode(invitationCode) {
    try {
      const normalizedCode = (invitationCode || '').toString().trim().toUpperCase();
      if (!normalizedCode) {
        return {
          success: false,
          error: 'Invitation code is required'
        };
      }

      const response = await fetch(this.getFunctionUrl('verifyInvitationCode'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: normalizedCode })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to verify invitation code'
        };
      }

      return {
        success: true,
        invitation: data.invitation
      };
    } catch (error) {
      console.error('Error verifying invitation code via function:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async refreshInvitation(invitationId, options = {}) {
    try {
      if (!invitationId) {
        return {
          success: false,
          error: 'Invitation ID is required'
        };
      }

      const invitationRef = doc(db, 'invitations', invitationId);
      const invitationSnap = await getDoc(invitationRef);

      if (!invitationSnap.exists()) {
        return {
          success: false,
          error: 'Invitation not found'
        };
      }

      const invitation = { id: invitationSnap.id, ...invitationSnap.data() };
      const regenerateCode = options.regenerateCode !== false;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const updatedAt = now.toISOString();

      const updatedData = {
        expiresAt,
        status: 'pending',
        updatedAt,
        resentAt: updatedAt,
      };

      if (regenerateCode) {
        updatedData.invitationCode = this.generateInvitationCode();
      }

      await updateDoc(invitationRef, updatedData);

      return {
        success: true,
        invitation: { ...invitation, ...updatedData }
      };
    } catch (error) {
      console.error('Error refreshing invitation:', error);
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
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        return {
          success: false,
          error: 'User is not authenticated'
        };
      }

      const normalizedCode = (invitationCode || '').toString().trim().toUpperCase();
      if (!normalizedCode) {
        return {
          success: false,
          error: 'Invitation code is required'
        };
      }

      const token = await user.getIdToken();
      const response = await fetch(this.getFunctionUrl('acceptInvitation'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ invitationCode: normalizedCode })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          success: false,
          error: data.error || 'Failed to accept invitation'
        };
      }

      return {
        success: true,
        company: data.company,
        role: data.role
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
      const userId = this.getCurrentUserId();
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
      const userId = this.getCurrentUserId();
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
      const userId = this.getCurrentUserId();
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

