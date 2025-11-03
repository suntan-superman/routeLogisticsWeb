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

class CompanyService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
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

      // Update user profile with company ID and role
      await updateDoc(doc(db, 'users', userId), {
        companyId: companyResult.company.id,
        role: role,
        updatedAt: new Date().toISOString()
      });

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

  // Add team member to company
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

      // Create team member record
      const teamMember = {
        companyId,
        email: userEmail,
        role,
        invitedBy: userId,
        status: 'pending', // pending, active, inactive
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'teamMembers'), teamMember);

      return {
        success: true,
        teamMemberId: docRef.id,
        teamMember: { id: docRef.id, ...teamMember }
      };
    } catch (error) {
      console.error('Error adding team member:', error);
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
