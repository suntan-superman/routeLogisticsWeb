import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from './firebase';
import InvitationService from './invitationService';

class CompanyService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  static getInvitationRole(role) {
    const mapping = {
      technician: 'field_tech',
      field_tech: 'field_tech',
      tech: 'field_tech',
      manager: 'supervisor',
      supervisor: 'supervisor',
      admin: 'admin'
    };

    return mapping[role] || 'field_tech';
  }

  static getRoleDisplay(role) {
    const labels = {
      admin: 'Admin',
      supervisor: 'Supervisor',
      field_tech: 'Field Technician',
      technician: 'Technician',
      manager: 'Manager'
    };

    return labels[role] || role;
  }

  static async sendTeamMemberInvitationEmail(invitation) {
    try {
      const projectId = 'mi-factotum-field-service';
      const sendInviteEmailUrl = `https://us-central1-${projectId}.cloudfunctions.net/sendInvitationEmail`;
      const token = await auth.currentUser?.getIdToken();

      if (!token) {
        throw new Error('Authentication token unavailable for sending invitation email');
      }

      const response = await fetch(sendInviteEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          invitationId: invitation.id,
          email: invitation.email,
          companyId: invitation.companyId,
          companyName: invitation.companyName,
          companyCode: invitation.companyCode,
          invitationCode: invitation.invitationCode,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        })
      });

      if (!response.ok) {
        throw new Error(`Invitation email request failed with status ${response.status}`);
      }

      return true;
    } catch (error) {
      console.error('Error sending invitation email:', error);
      return false;
    }
  }

  // Generate unique company code
  static generateCompanyCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  // Create a new company
  static async createCompany(companyData) {
    try {
      const userId = this.getCurrentUserId();
      
      // Generate unique company code
      let companyCode = this.generateCompanyCode();
      let codeExists = true;
      let attempts = 0;
      
      // Ensure code is unique (check against existing companies)
      while (codeExists && attempts < 10) {
        const codeCheck = query(
          collection(db, 'companies'),
          where('code', '==', companyCode)
        );
        const codeSnapshot = await getDocs(codeCheck);
        if (codeSnapshot.empty) {
          codeExists = false;
        } else {
          companyCode = this.generateCompanyCode();
          attempts++;
        }
      }
      
      const company = {
        ...companyData,
        code: companyCode,
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
        role: 'admin',
        updatedAt: new Date().toISOString()
      });

      return {
        success: true,
        companyId: docRef.id,
        companyCode: companyCode,
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

  // Find company by code
  static async getCompanyByCode(code) {
    try {
      if (!code || code.length !== 6) {
        return {
          success: false,
          error: 'Invalid company code'
        };
      }

      const q = query(
        collection(db, 'companies'),
        where('code', '==', code.toUpperCase()),
        where('isActive', '==', true)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        return {
          success: false,
          error: 'Company not found with this code'
        };
      }

      const companyDoc = querySnapshot.docs[0];
      const companyData = { id: companyDoc.id, ...companyDoc.data() };

      // Filter out admin/protected companies (not joinable via code)
      if (companyData.isAdminCompany === true || companyData.isProtected === true) {
        return {
          success: false,
          error: 'This company is not available for public signup'
        };
      }

      return {
        success: true,
        company: companyData
      };
    } catch (error) {
      console.error('Error finding company by code:', error);
      return {
        success: false,
        error: error.message
      };
      }
  }

  // Link user to company by code
  static async joinCompanyByCode(userId, companyCode, role = 'field_tech') {
    try {
      if (!userId) {
        return {
          success: false,
          error: 'User ID is required to join a company'
        };
      }

      const companyResult = await this.getCompanyByCode(companyCode);
      
      if (!companyResult.success) {
        return companyResult;
      }

      // Double-check admin company protection (should already be filtered in getCompanyByCode)
      if (companyResult.company.isAdminCompany === true || companyResult.company.isProtected === true) {
        return {
          success: false,
          error: 'This company is not available for public signup'
        };
      }

      const userDocRef = doc(db, 'users', userId);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        return {
          success: false,
          error: 'User profile not found'
        };
      }

      const userData = userDocSnap.data() || {};

      if (userData.companyId && userData.companyId !== companyResult.company.id) {
        return {
          success: false,
          error: 'This account is already associated with another company. Please contact your administrator to transfer access.'
        };
      }

      // Update user profile with company ID and role
      const updates = {
        companyId: companyResult.company.id,
        updatedAt: new Date().toISOString()
      };

      if (role && userData.role !== role) {
        updates.role = role;
      }

      await updateDoc(userDocRef, updates);

      return {
        success: true,
        company: companyResult.company
      };
    } catch (error) {
      console.error('Error joining company:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get company by ID
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

  // Create company for super admin (for other users)
  static async createCompanyForUser(companyData, ownerEmail) {
    try {
      const userId = this.getCurrentUserId();
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';
      
      if (!isSuperAdmin) {
        return {
          success: false,
          error: 'Only super admins can create companies for other users'
        };
      }

      // Find user by email to get their userId
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', ownerEmail)
      );
      const usersSnapshot = await getDocs(usersQuery);
      
      if (usersSnapshot.empty) {
        return {
          success: false,
          error: 'User not found with email: ' + ownerEmail
        };
      }

      const ownerUser = usersSnapshot.docs[0];
      const ownerId = ownerUser.id;
      const ownerData = ownerUser.data() || {};

      if (ownerData.companyId) {
        return {
          success: false,
          error: 'This user already manages another company. Remove them from the existing company before assigning a new one.'
        };
      }

      // Generate unique company code
      let companyCode = this.generateCompanyCode();
      let codeExists = true;
      let attempts = 0;
      
      while (codeExists && attempts < 10) {
        const codeCheck = query(
          collection(db, 'companies'),
          where('code', '==', companyCode)
        );
        const codeSnapshot = await getDocs(codeCheck);
        if (codeSnapshot.empty) {
          codeExists = false;
        } else {
          companyCode = this.generateCompanyCode();
          attempts++;
        }
      }
      
      const company = {
        ...companyData,
        code: companyCode,
        ownerId: ownerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      // Add company to companies collection
      const docRef = await addDoc(collection(db, 'companies'), company);
      
      // Update owner's user profile with company ID and admin role
      await updateDoc(doc(db, 'users', ownerId), {
        companyId: docRef.id,
        role: 'admin',
        updatedAt: new Date().toISOString()
      });

      return {
        success: true,
        companyId: docRef.id,
        companyCode: companyCode,
        company: { id: docRef.id, ...company },
        ownerEmail: ownerEmail
      };
    } catch (error) {
      console.error('Error creating company for user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check company history (customers, jobs, invoices, estimates, etc.)
  static async checkCompanyHistory(companyId) {
    try {
      const history = {
        customers: 0,
        jobs: 0,
        invoices: 0,
        estimates: 0,
        teamMembers: 0,
        total: 0
      };

      // Count customers
      const customersQuery = query(
        collection(db, 'customers'),
        where('companyId', '==', companyId)
      );
      const customersSnapshot = await getDocs(customersQuery);
      history.customers = customersSnapshot.size;

      // Count jobs (by team members)
      const teamMembersQuery = query(
        collection(db, 'teamMembers'),
        where('companyId', '==', companyId)
      );
      const teamMembersSnapshot = await getDocs(teamMembersQuery);
      history.teamMembers = teamMembersSnapshot.size;

      // Get all user IDs for this company
      const userIds = [];
      const usersQuery = query(
        collection(db, 'users'),
        where('companyId', '==', companyId)
      );
      const usersSnapshot = await getDocs(usersQuery);
      usersSnapshot.forEach(doc => userIds.push(doc.id));

      // Count jobs
      let jobsCount = 0;
      if (userIds.length > 0) {
        // Note: Firestore 'in' queries are limited to 10 items
        for (let i = 0; i < userIds.length; i += 10) {
          const batch = userIds.slice(i, i + 10);
          const jobsQuery = query(
            collection(db, 'jobs'),
            where('userId', 'in', batch)
          );
          const jobsSnapshot = await getDocs(jobsQuery);
          jobsCount += jobsSnapshot.size;
        }
      }
      history.jobs = jobsCount;

      // Count estimates
      let estimatesCount = 0;
      if (userIds.length > 0) {
        for (let i = 0; i < userIds.length; i += 10) {
          const batch = userIds.slice(i, i + 10);
          const estimatesQuery = query(
            collection(db, 'estimates'),
            where('userId', 'in', batch)
          );
          const estimatesSnapshot = await getDocs(estimatesQuery);
          estimatesCount += estimatesSnapshot.size;
        }
      }
      history.estimates = estimatesCount;

      // Count invoices
      let invoicesCount = 0;
      if (userIds.length > 0) {
        for (let i = 0; i < userIds.length; i += 10) {
          const batch = userIds.slice(i, i + 10);
          const invoicesQuery = query(
            collection(db, 'invoices'),
            where('userId', 'in', batch)
          );
          const invoicesSnapshot = await getDocs(invoicesQuery);
          invoicesCount += invoicesSnapshot.size;
        }
      }
      history.invoices = invoicesCount;

      history.total = history.customers + history.jobs + history.invoices + 
                      history.estimates + history.teamMembers;

      return {
        success: true,
        history,
        hasHistory: history.total > 0
      };
    } catch (error) {
      console.error('Error checking company history:', error);
      return {
        success: false,
        error: error.message,
        history: null
      };
    }
  }

  // Delete company (only if no history)
  static async deleteCompany(companyId) {
    try {
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';
      
      if (!isSuperAdmin) {
        return {
          success: false,
          error: 'Only super admins can delete companies'
        };
      }

      // Check history first
      const historyResult = await this.checkCompanyHistory(companyId);
      if (!historyResult.success) {
        return historyResult;
      }

      if (historyResult.hasHistory) {
        return {
          success: false,
          error: 'Cannot delete company with existing data. Use deactivate instead.',
          history: historyResult.history
        };
      }

      // Get company to get owner ID
      const companyResult = await this.getCompany(companyId);
      if (!companyResult.success) {
        return companyResult;
      }

      // Prevent deletion of protected/admin companies (e.g., Workside Software)
      if (companyResult.company.isAdminCompany === true || companyResult.company.isProtected === true) {
        return {
          success: false,
          error: 'Cannot delete protected administrative companies. This company is used for system administration and must be preserved.'
        };
      }

      const ownerId = companyResult.company.ownerId;

      // Remove companyId from owner's user profile
      await updateDoc(doc(db, 'users', ownerId), {
        companyId: null,
        updatedAt: new Date().toISOString()
      });

      // Delete company
      await deleteDoc(doc(db, 'companies', companyId));

      return {
        success: true,
        message: 'Company deleted successfully'
      };
    } catch (error) {
      console.error('Error deleting company:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Deactivate company
  static async deactivateCompany(companyId, isActive = false) {
    try {
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';
      
      if (!isSuperAdmin) {
        return {
          success: false,
          error: 'Only super admins can deactivate companies'
        };
      }

      // Prevent deactivation of protected/admin companies
      const companyResult = await this.getCompany(companyId);
      if (companyResult.success && (companyResult.company.isAdminCompany === true || companyResult.company.isProtected === true)) {
        return {
          success: false,
          error: 'Cannot deactivate protected administrative companies. This company is used for system administration and must remain active.'
        };
      }

      await updateDoc(doc(db, 'companies', companyId), {
        isActive: isActive,
        updatedAt: new Date().toISOString()
      });

      return {
        success: true,
        message: `Company ${isActive ? 'activated' : 'deactivated'} successfully`
      };
    } catch (error) {
      console.error('Error deactivating company:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all companies (super admin only)
  static async getAllCompanies() {
    try {
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';
      
      if (!isSuperAdmin) {
        return {
          success: false,
          error: 'Only super admins can view all companies'
        };
      }

      // Get all companies - we'll filter admin companies in JavaScript
      // because Firestore != operator doesn't work well with undefined/null fields
      const companiesQuery = query(collection(db, 'companies'));
      
      const snapshot = await getDocs(companiesQuery);
      const companies = [];
      
      snapshot.forEach((doc) => {
        const companyData = doc.data();
        // Filter out admin/protected companies
        if (!companyData.isAdminCompany && !companyData.isProtected) {
          companies.push({
            id: doc.id,
            ...companyData
          });
        }
      });

      // Get owner info for each company
      const companiesWithOwners = await Promise.all(
        companies.map(async (company) => {
          try {
            const ownerDoc = await getDoc(doc(db, 'users', company.ownerId));
            if (ownerDoc.exists()) {
              return {
                ...company,
                ownerEmail: ownerDoc.data().email || '',
                ownerName: ownerDoc.data().name || ''
              };
            }
            return company;
          } catch (error) {
            return company;
          }
        })
      );

      return {
        success: true,
        companies: companiesWithOwners
      };
    } catch (error) {
      console.error('Error getting all companies:', error);
      return {
        success: false,
        error: error.message,
        companies: []
      };
    }
  }

  // Update company
  static async updateCompany(companyId, updates) {
    try {
      const userId = this.getCurrentUserId();
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';
      
      // Verify user owns the company (or is super admin)
      const companyResult = await this.getCompany(companyId);
      if (!companyResult.success) {
        return companyResult;
      }

      if (!isSuperAdmin && companyResult.company.ownerId !== userId) {
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

  static async addTeamMember(companyId, userEmail, role = 'technician') {
    try {
      const userId = this.getCurrentUserId();
      
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';
      
      // Verify user owns the company (or is super admin)
      const companyResult = await this.getCompany(companyId);
      if (!companyResult.success) {
        return companyResult;
      }

      if (!isSuperAdmin && companyResult.company.ownerId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to add team members'
        };
      }

      const normalizedEmail = userEmail.trim().toLowerCase();
      const invitationRole = this.getInvitationRole(role);

      // Check if a team member already exists for this email in the company
      const existingTeamMemberQuery = query(
        collection(db, 'teamMembers'),
        where('companyId', '==', companyId),
        where('email', '==', normalizedEmail)
      );

      const existingTeamMemberSnapshot = await getDocs(existingTeamMemberQuery);
      if (!existingTeamMemberSnapshot.empty) {
        return {
          success: false,
          error: 'A team member with this email already exists.'
        };
      }

      // Check if user already belongs to another company
      const existingUserQuery = query(
        collection(db, 'users'),
        where('email', '==', normalizedEmail)
      );
      const existingUserSnapshot = await getDocs(existingUserQuery);

      if (!existingUserSnapshot.empty) {
        const existingUserData = existingUserSnapshot.docs[0].data() || {};
        if (existingUserData.companyId && existingUserData.companyId !== companyId) {
          return {
            success: false,
            error: 'This email address is already associated with another company. Ask the user to be removed from their current company before inviting them here.'
          };
        }
      }

      const invitationResult = await InvitationService.createInvitation(
        companyId,
        normalizedEmail,
        invitationRole,
        userId
      );

      if (!invitationResult.success) {
        return {
          success: false,
          error: invitationResult.error || 'Failed to create invitation'
        };
      }

      const { invitation } = invitationResult;

      // Create team member record
      const timestamp = new Date().toISOString();
      const teamMember = {
        companyId,
        email: normalizedEmail,
        role: invitationRole,
        roleDisplay: this.getRoleDisplay(invitationRole),
        invitedBy: userId,
        status: 'pending', // pending, active, inactive
        invitationId: invitation.id,
        invitationCode: invitation.invitationCode,
        invitationExpiresAt: invitation.expiresAt,
        emailSent: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      const docRef = await addDoc(collection(db, 'teamMembers'), teamMember);

      const emailSent = await this.sendTeamMemberInvitationEmail(invitation);

      if (emailSent) {
        await updateDoc(doc(db, 'teamMembers', docRef.id), {
          emailSent: true,
          emailSentAt: new Date().toISOString()
        });
      }

      return {
        success: true,
        teamMemberId: docRef.id,
        teamMember: { id: docRef.id, ...teamMember, emailSent },
        invitation,
        emailSent
      };
    } catch (error) {
      console.error('Error adding team member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static async resendTeamMemberInvite(teamMemberId) {
    try {
      const userId = this.getCurrentUserId();
      const user = auth.currentUser;
      const isSuperAdmin = user?.email === 'sroy@worksidesoftware.com';

      const teamMemberRef = doc(db, 'teamMembers', teamMemberId);
      const teamMemberSnap = await getDoc(teamMemberRef);

      if (!teamMemberSnap.exists()) {
        return {
          success: false,
          error: 'Team member not found'
        };
      }

      const teamMember = teamMemberSnap.data();
      const companyResult = await this.getCompany(teamMember.companyId);

      if (!companyResult.success) {
        return companyResult;
      }

      if (!isSuperAdmin && companyResult.company.ownerId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to resend invitation for this team member'
        };
      }

      if (teamMember.status && teamMember.status !== 'pending') {
        return {
          success: false,
          error: 'Only pending team members can be resent invitations'
        };
      }

      const invitationId = teamMember.invitationId;
      let invitationResult = null;

      if (invitationId) {
        invitationResult = await InvitationService.refreshInvitation(invitationId);
      }

      if (!invitationResult || !invitationResult.success) {
        invitationResult = await InvitationService.createInvitation(
          teamMember.companyId,
          teamMember.email,
          teamMember.role,
          userId
        );
      }

      if (!invitationResult.success) {
        return {
          success: false,
          error: invitationResult.error || 'Failed to refresh invitation'
        };
      }

      const { invitation } = invitationResult;
      const emailSent = await this.sendTeamMemberInvitationEmail(invitation);
      const now = new Date().toISOString();

      const updatePayload = {
        invitationId: invitation.id,
        invitationCode: invitation.invitationCode,
        invitationExpiresAt: invitation.expiresAt,
        status: 'pending',
        updatedAt: now,
        lastResentAt: now,
      };

      if (emailSent) {
        updatePayload.emailSent = true;
        updatePayload.emailSentAt = now;
      }

      await updateDoc(teamMemberRef, updatePayload);

      return {
        success: true,
        teamMember: {
          id: teamMemberId,
          ...teamMember,
          ...updatePayload,
          emailSent: emailSent ? true : teamMember.emailSent,
        },
        invitation,
        emailSent
      };
    } catch (error) {
      console.error('Error resending team member invitation:', error);
      return {
        success: false,
        error: error.message
      };
    }
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
        teamMembers.push({ id: doc.id, ...doc.data() });
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

  // Update team member
  static async updateTeamMember(teamMemberId, updates) {
    try {
      const userId = this.getCurrentUserId();
      
      // Get team member to verify permissions
      const teamMemberDoc = await getDoc(doc(db, 'teamMembers', teamMemberId));
      if (!teamMemberDoc.exists()) {
        return {
          success: false,
          error: 'Team member not found'
        };
      }

      const teamMember = teamMemberDoc.data();
      const companyResult = await this.getCompany(teamMember.companyId);
      
      if (!companyResult.success || companyResult.company.ownerId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to update this team member'
        };
      }

      const updatedData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, 'teamMembers', teamMemberId), updatedData);

      return {
        success: true,
        teamMember: { ...teamMember, ...updatedData }
      };
    } catch (error) {
      console.error('Error updating team member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Remove team member
  static async removeTeamMember(teamMemberId) {
    try {
      const userId = this.getCurrentUserId();
      
      // Get team member to verify permissions
      const teamMemberDoc = await getDoc(doc(db, 'teamMembers', teamMemberId));
      if (!teamMemberDoc.exists()) {
        return {
          success: false,
          error: 'Team member not found'
        };
      }

      const teamMember = teamMemberDoc.data();
      const companyResult = await this.getCompany(teamMember.companyId);
      
      if (!companyResult.success || companyResult.company.ownerId !== userId) {
        return {
          success: false,
          error: 'Unauthorized to remove this team member'
        };
      }

      await deleteDoc(doc(db, 'teamMembers', teamMemberId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error removing team member:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default CompanyService;
