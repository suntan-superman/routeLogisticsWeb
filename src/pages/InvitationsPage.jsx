import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCompany } from '../contexts/CompanyContext';
import CompanyService from '../services/companyService';
import InvitationService from '../services/invitationService';
import { auth } from '../services/firebase';
import { 
  EnvelopeIcon,
  PlusIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import {
  GridComponent,
  ColumnsDirective,
  ColumnDirective,
  Page,
  Toolbar,
  Sort,
  Filter,
  ExcelExport,
  Selection,
  Search,
  Resize,
  Inject
} from '@syncfusion/ej2-react-grids';
import { ROLE_COLORS } from '../utils/roleColors';
import { ROLE_OPTIONS, DEFAULT_ROLE } from '../constants/roles';

const InvitationsPage = () => {
  const { userProfile, isSuperAdmin } = useAuth();
  const { getEffectiveCompanyId } = useCompany();
  const [company, setCompany] = useState(null);
  const [invitations, setInvitations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState(DEFAULT_ROLE);

  const invitationsGridRef = useRef(null);
  const invitationsToolbarOptions = useMemo(() => ['Search', 'ExcelExport'], []);
  const invitationsPageSettings = useMemo(() => ({ pageSize: 25, pageSizes: [25, 50, 100, 200] }), []);
  const invitationsFilterSettings = useMemo(() => ({ type: 'Excel' }), []);

  useEffect(() => {
    const companyId = getEffectiveCompanyId();
    if (companyId) {
      loadCompany(companyId);
      loadInvitations(companyId);
    }
  }, [userProfile]);

  const loadCompany = async (companyId) => {
    if (!companyId) return;
    
    try {
      const result = await CompanyService.getCompany(companyId);
      if (result.success) {
        setCompany(result.company);
      }
    } catch (error) {
      console.error('Error loading company:', error);
    }
  };

  const loadInvitations = async (companyId) => {
    if (!companyId) return;
    
    setIsLoading(true);
    try {
      const result = await InvitationService.getCompanyInvitations(companyId);
      if (result.success) {
        setInvitations(result.invitations);
      }
    } catch (error) {
      console.error('Error loading invitations:', error);
      toast.error('Failed to load invitations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateInvitation = async () => {
    if (!newInviteEmail.trim()) {
      toast.error('Please enter an email address');
      return;
    }

    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('No company selected');
      return;
    }

    setIsLoading(true);
    try {
      const result = await InvitationService.createInvitation(
        companyId,
        newInviteEmail,
        newInviteRole,
        userProfile?.id || auth.currentUser?.uid
      );

      if (result.success) {
        toast.success('Invitation created successfully!');
        
        // Send email invitation
        await sendInvitationEmail(result.invitation);
        
        setNewInviteEmail('');
        setNewInviteRole(DEFAULT_ROLE);
        setShowInviteModal(false);
        loadInvitations(companyId);
      } else {
        toast.error(result.error || 'Failed to create invitation');
      }
    } catch (error) {
      console.error('Error creating invitation:', error);
      toast.error('Failed to create invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const sendInvitationEmail = async (invitation) => {
    try {
      // Call Firebase function to send email via HTTP request (like invoice email)
      const projectId = 'mi-factotum-field-service';
      const sendInviteEmailUrl = `https://us-central1-${projectId}.cloudfunctions.net/sendInvitationEmail`;
      
      // Get current user's auth token
      const token = await auth.currentUser?.getIdToken();
      
      const response = await fetch(sendInviteEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          invitationId: invitation.id,
          email: invitation.email,
          companyName: invitation.companyName,
          invitationCode: invitation.invitationCode,
          role: invitation.role,
          expiresAt: invitation.expiresAt
        })
      });

      if (!response.ok) {
        throw new Error('Failed to send email');
      }

      toast.success('Invitation email sent!');
    } catch (error) {
      console.error('Error sending invitation email:', error);
      // Don't show error - invitation was created, just email failed
      toast.info('Invitation created, but email sending failed. Share the code manually.');
    }
  };

  const handleCancelInvitation = async (invitationId) => {
    if (!confirm('Are you sure you want to cancel this invitation?')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await InvitationService.cancelInvitation(invitationId);
      if (result.success) {
        toast.success('Invitation cancelled');
        const companyId = getEffectiveCompanyId();
        if (companyId) loadInvitations(companyId);
      } else {
        toast.error(result.error || 'Failed to cancel invitation');
      }
    } catch (error) {
      console.error('Error cancelling invitation:', error);
      toast.error('Failed to cancel invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendInvitation = async (invitation) => {
    setIsLoading(true);
    try {
      const result = await InvitationService.resendInvitation(invitation.id);
      if (result.success) {
        await sendInvitationEmail(result.invitation);
        toast.success('Invitation resent!');
        const companyId = getEffectiveCompanyId();
        if (companyId) loadInvitations(companyId);
      } else {
        toast.error(result.error || 'Failed to resend invitation');
      }
    } catch (error) {
      console.error('Error resending invitation:', error);
      toast.error('Failed to resend invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const copyInvitationCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success('Invitation code copied to clipboard!');
  };

  const handleInvitationsToolbarClick = useCallback((args) => {
    if (!invitationsGridRef.current) return;
    const id = args.item?.id || '';
    if (id.includes('_excelexport')) {
      invitationsGridRef.current.excelExport({
        fileName: `team-invitations-${new Date().toISOString().split('T')[0]}.xlsx`
      });
    }
  }, []);

  const invitationEmailTemplate = (props) => (
    <div className="flex items-center">
      <EnvelopeIcon className="h-5 w-5 text-gray-400 mr-2" />
      <span className="text-sm font-medium text-gray-900">{props.email}</span>
    </div>
  );

  const invitationRoleTemplate = (props) => (
    <span className="text-sm text-gray-800">
      {ROLE_OPTIONS.find((r) => r.value === props.role)?.label || props.role}
    </span>
  );

  const invitationCodeTemplate = (props) => (
    <button
      type="button"
      onClick={() => copyInvitationCode(props.invitationCode)}
      className="font-mono text-primary-600 hover:text-primary-800 underline"
      title="Click to copy"
    >
      {props.invitationCode}
    </button>
  );

  const invitationStatusTemplate = (props) => getStatusBadge(props.status, props.expiresAt);

  const invitationExpiryTemplate = (props) => (
    <span className="text-sm text-gray-700">
      {props.expiresAt ? new Date(props.expiresAt).toLocaleDateString() : '—'}
    </span>
  );

  const invitationActionsTemplate = (props) => (
    <div className="flex justify-end gap-3">
      {props.status === 'pending' && (
        <>
          <button
            type="button"
            onClick={() => handleResendInvitation(props)}
            className="text-primary-600 hover:text-primary-900"
            title="Resend invitation"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleCancelInvitation(props.id)}
            className="text-red-600 hover:text-red-900"
            title="Cancel invitation"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );

  const getStatusBadge = (status, expiresAt) => {
    if (status === 'accepted') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="w-4 h-4 mr-1" />
          Accepted
        </span>
      );
    }
    
    if (status === 'expired') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          <ClockIcon className="w-4 h-4 mr-1" />
          Expired
        </span>
      );
    }

    if (new Date(expiresAt) < new Date()) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <ClockIcon className="w-4 h-4 mr-1" />
          Expired
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <ClockIcon className="w-4 h-4 mr-1" />
        Pending
      </span>
    );
  };

  if (!userProfile?.companyId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center">
          <p className="text-gray-500">Please set up your company first.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team Invitations</h1>
          <p className="mt-1 text-sm text-gray-500">
            Invite team members to join {company?.name || 'your company'}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <PlusIcon className="w-5 h-5 mr-2" />
          New Invitation
        </button>
      </div>

      {/* Invitations List */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {isLoading && invitations.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-gray-500">
            Loading invitations...
          </div>
        ) : (
          <div className="px-3 pb-4">
            {!isLoading && invitations.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-500">
                No invitations yet. Create your first invitation above.
              </div>
            ) : (
              <GridComponent
                id="invitationsGrid"
                dataSource={invitations}
                allowPaging
                allowSorting
                allowFiltering
                allowSelection
                allowExcelExport
                filterSettings={invitationsFilterSettings}
                toolbar={invitationsToolbarOptions}
                toolbarClick={handleInvitationsToolbarClick}
                selectionSettings={{ type: 'Single' }}
                pageSettings={invitationsPageSettings}
                height="480"
                ref={invitationsGridRef}
              >
                <ColumnsDirective>
                  <ColumnDirective
                    field="email"
                    headerText="Email"
                    width="250"
                    template={invitationEmailTemplate}
                  />
                  <ColumnDirective
                    field="role"
                    headerText="Role"
                    width="200"
                    template={invitationRoleTemplate}
                  />
                  <ColumnDirective
                    field="invitationCode"
                    headerText="Code"
                    width="160"
                    template={invitationCodeTemplate}
                  />
                  <ColumnDirective
                    field="status"
                    headerText="Status"
                    width="150"
                    template={invitationStatusTemplate}
                    allowFiltering={false}
                  />
                  <ColumnDirective
                    field="expiresAt"
                    headerText="Expires"
                    width="140"
                    template={invitationExpiryTemplate}
                  />
                  <ColumnDirective
                    headerText="Actions"
                    width="160"
                    template={invitationActionsTemplate}
                    allowFiltering={false}
                    allowSorting={false}
                  />
                </ColumnsDirective>
                <Inject services={[Page, Toolbar, Sort, Filter, ExcelExport, Selection, Search, Resize]} />
              </GridComponent>
            )}
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-medium text-gray-900">Invite Team Member</h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-gray-500"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  value={newInviteEmail}
                  onChange={(e) => setNewInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="team@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role *
                </label>
                <select
                  value={newInviteRole}
                  onChange={(e) => setNewInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> An invitation email will be sent with a code. 
                  The user can use this code during signup or enter it manually.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowInviteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateInvitation}
                disabled={isLoading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
              >
                {isLoading ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvitationsPage;

