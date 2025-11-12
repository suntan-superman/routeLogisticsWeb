import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';
import InvitationService from '../services/invitationService';
import { motion } from 'framer-motion';
import { 
  BuildingOfficeIcon,
  UserGroupIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { formatPhoneNumber } from '../utils/phoneFormatter';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Company Administrator', description: 'Full access to manage company settings, customers, jobs, and team' },
  { value: 'supervisor', label: 'Supervisor', description: 'View and manage jobs, customers, and team members' },
  { value: 'field_tech', label: 'Field Technician', description: 'View schedules and complete assigned jobs' }
];

const SignUpPage = () => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Step 1: Basic info
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [invitationDetails, setInvitationDetails] = useState(null);
  const [invitationValidationMessage, setInvitationValidationMessage] = useState('');
  const [isValidatingInvitation, setIsValidatingInvitation] = useState(false);
  
  // Step 2: Company selection
  const [companyOption, setCompanyOption] = useState('new'); // 'new' or 'existing'
  const [companyCode, setCompanyCode] = useState('');
  const [companySearchTerm, setCompanySearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  
  // Step 3: Role selection
  const [role, setRole] = useState('field_tech');
  
  // Step 4: New company info (if creating new)
  const [companyName, setCompanyName] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyState, setCompanyState] = useState('');
  const [companyZipCode, setCompanyZipCode] = useState('');
  
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [validatingCode, setValidatingCode] = useState(false);
  const [codeValidationMessage, setCodeValidationMessage] = useState('');

  const parsedInviteParams = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const rawCode = params.get('code') || '';
    const inviteRole = params.get('role') || '';
    const inviteEmail = params.get('email') || '';
    const inviteCompanyCode = params.get('companyCode') || '';

    const normalizedCode = rawCode.trim().toUpperCase();
    const normalizedRole = inviteRole.trim().toLowerCase();
    const normalizedEmail = inviteEmail.trim();
    const normalizedCompanyCode = inviteCompanyCode.trim().toUpperCase();

    const allowedRoles = ['admin', 'supervisor', 'field_tech'];
    return {
      invitationCode: normalizedCode.length >= 6 ? normalizedCode : '',
      role: allowedRoles.includes(normalizedRole) ? normalizedRole : '',
      email: normalizedEmail,
      companyCode: normalizedCompanyCode.length === 6 ? normalizedCompanyCode : ''
    };
  }, [location.search]);

  useEffect(() => {
    // Reset core form state on mount or when invite params change
    setStep(1);
    setName('');
    setPassword('');
    setConfirmPassword('');

    setInvitationCode(parsedInviteParams.invitationCode || '');
    setInvitationDetails(null);
    setInvitationValidationMessage('');
    setIsValidatingInvitation(false);

    setEmail(parsedInviteParams.email || '');
    setCompanyOption(parsedInviteParams.invitationCode ? 'existing' : 'new');
    setCompanyCode(parsedInviteParams.companyCode || '');
    setCompanySearchTerm('');
    setSearchResults([]);
    setSelectedCompany(null);
    setRole(parsedInviteParams.role || 'field_tech');
    setCompanyName('');
    setCompanyPhone('');
    setCompanyAddress('');
    setCompanyCity('');
    setCompanyState('');
    setCompanyZipCode('');
    setCodeValidationMessage('');
    setValidatingCode(false);
  }, [parsedInviteParams]);

  useEffect(() => {
    // Validate company code when it's 6 characters
    if (companyOption === 'existing' && companyCode.length === 6) {
      validateCompanyCode();
    } else {
      setCodeValidationMessage('');
      setSelectedCompany(null);
    }
  }, [companyCode, companyOption]);

  useEffect(() => {
    let isActive = true;

    const validateInvitationCode = async () => {
      if (!invitationCode) {
        if (isActive) {
          setInvitationDetails(null);
          setInvitationValidationMessage('');
          setIsValidatingInvitation(false);
        }
        return;
      }

      setIsValidatingInvitation(true);
      setInvitationValidationMessage('');

      try {
        const result = await InvitationService.verifyInvitationCode(invitationCode);

        if (!isActive) {
          return;
        }

        if (result.success) {
          const invite = result.invitation;
          setInvitationDetails(invite);
          setInvitationValidationMessage(`Invitation verified for ${invite.companyName}`);
          setCompanyOption('existing');

          if (!parsedInviteParams.email && invite.email) {
            setEmail(invite.email || '');
          }

          if (!parsedInviteParams.role && invite.role) {
            setRole(invite.role);
          }

          const resolvedCompanyCode = parsedInviteParams.companyCode || invite.companyCode || '';
          if (resolvedCompanyCode) {
            setCompanyCode(resolvedCompanyCode.slice(0, 6));
          }

          setSelectedCompany({
            id: invite.companyId,
            name: invite.companyName || '',
            code: (invite.companyCode || '').slice(0, 6)
          });
          if (invite.companyName) {
            setCodeValidationMessage(`Company found: ${invite.companyName}`);
          }
        } else {
          setInvitationDetails(null);
          setInvitationValidationMessage(result.error || 'Invitation not found or expired');
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        setInvitationDetails(null);
        setInvitationValidationMessage('Unable to validate invitation code');
      } finally {
        if (isActive) {
          setIsValidatingInvitation(false);
        }
      }
    };

    validateInvitationCode();

    return () => {
      isActive = false;
    };
  }, [invitationCode, parsedInviteParams.email, parsedInviteParams.companyCode, parsedInviteParams.role]);

  const validateCompanyCode = async () => {
    setValidatingCode(true);
    setCodeValidationMessage('');
    
    try {
      const result = await CompanyService.getCompanyByCode(companyCode);
      if (result.success) {
        setSelectedCompany(result.company);
        setCodeValidationMessage(`Company found: ${result.company.name}`);
      } else {
        setSelectedCompany(null);
        setCodeValidationMessage(result.error || 'Company not found');
      }
    } catch (error) {
      setSelectedCompany(null);
      setCodeValidationMessage('Error validating code');
    } finally {
      setValidatingCode(false);
    }
  };

  const handleStep1Next = () => {
    if (!name || !email || !password || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setStep(2);
  };

  const handleStep2Next = () => {
    if (isInviteFlow) {
      setStep(3);
      return;
    }

    if (companyOption === 'existing') {
      if (!companyCode || companyCode.length !== 6) {
        toast.error('Please enter a valid 6-character company code');
        return;
      }
      
      if (!selectedCompany) {
        toast.error('Please validate the company code first');
        return;
      }
      
      setStep(3); // Go to role selection
    } else {
      const nextRole = parsedInviteParams.role || 'admin';
      setRole(nextRole);
      setStep(4); // Skip to company details
    }
  };

  const handleStep3Next = () => {
    if (isInviteFlow) {
      handleSignUp();
      return;
    }

    if (!role) {
      toast.error('Please select a role');
      return;
    }

    if (companyOption === 'new') {
      setStep(4);
    } else {
      handleSignUp();
    }
  };

  const handleStep4Next = () => {
    if (!companyName || !companyPhone || !companyAddress || !companyCity || !companyState || !companyZipCode) {
      toast.error('Please fill in all company fields');
      return;
    }

    handleSignUp();
  };

  const handleSignUp = async () => {
    setIsLoading(true);
    try {
      // Create user account first
      const userData = {
        name,
        phoneNumber: companyOption === 'new' ? companyPhone : '',
        businessName: companyOption === 'new' ? companyName : '',
        address: companyOption === 'new' ? companyAddress : '',
        city: companyOption === 'new' ? companyCity : '',
        state: companyOption === 'new' ? companyState : '',
        zipCode: companyOption === 'new' ? companyZipCode : '',
        services: [],
        serviceCategories: [],
        role: invitedRole || role,
        companyId: invitationDetails?.companyId || null,
        joinedViaInvitation: Boolean(invitationDetails?.companyId)
      };

      console.log('[SignUpPage.handleSignUp] Creating user with companyId:', userData.companyId);

      const signupResult = await signup(email, password, userData);

      if (!signupResult.success) {
        toast.error(signupResult.error || 'Failed to create account');
        setIsLoading(false);
        return;
      }

      // If email verification is required, redirect to verification page
      if (signupResult.needsEmailVerification) {
        navigate('/verify-email', { 
          state: { email: signupResult.email } 
        });
        setIsLoading(false);
        return;
      }

      const userId = signupResult.user?.uid;

      // If creating new company, store data for later (after email verification)
      if (!isInviteFlow && companyOption === 'new') {
        // Company will be created after email verification in Company Setup
        // Data is already stored in localStorage by signup function
        navigate('/verify-email', { 
          state: { email: signupResult.email } 
        });
      } else if (invitationCode) {
        const acceptResult = await InvitationService.acceptInvitation(userId, invitationCode);
        if (!acceptResult.success) {
          toast.error(acceptResult.error || 'Failed to accept invitation');
        } else {
          toast.success(
            acceptResult.company?.name
              ? `Welcome to ${acceptResult.company.name}!`
              : 'Invitation accepted successfully.'
          );
        }

        navigate('/verify-email', {
          state: { email: signupResult.email }
        });
      } else if (companyCode) {
        const joinResult = await CompanyService.joinCompanyByCode(userId, companyCode, role);

        if (joinResult.success) {
          toast.success(`Successfully joined ${joinResult.company.name}!`);
        } else {
          toast.error('Failed to join company: ' + joinResult.error);
        }

        navigate('/verify-email', {
          state: { email: signupResult.email }
        });
      } else {
        navigate('/verify-email', {
          state: { email: signupResult.email }
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const isStep1Complete = Boolean(
    name.trim() &&
    email.trim() &&
    password &&
    confirmPassword &&
    password.length >= 6 &&
    password === confirmPassword
  );

  const hasInviteParams = Boolean(parsedInviteParams.invitationCode);
  const isInviteFlow = Boolean(invitationDetails) || hasInviteParams;
  const invitedRole = invitationDetails?.role || parsedInviteParams.role || role;
  const emailLocked = Boolean(isInviteFlow && email);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-2xl w-full space-y-8 bg-white p-8 rounded-lg shadow-lg"
      >
        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-4 mb-8">
          {[1, 2, 3, 4].map((stepNum) => (
            <React.Fragment key={stepNum}>
              <div className="flex items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    step >= stepNum
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {step > stepNum ? (
                    <CheckCircleIcon className="w-6 h-6" />
                  ) : (
                    <span className="font-medium">{stepNum}</span>
                  )}
                </div>
              </div>
              {stepNum < 4 && (
                <div
                  className={`h-1 w-16 ${
                    step > stepNum ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 text-center">
                Create Your Account
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Enter your basic information to get started
              </p>
            </div>

            {invitationCode && (
              <div
                className={`rounded-md border p-3 text-sm ${
                  invitationDetails
                    ? 'border-green-200 bg-green-50 text-green-800'
                    : invitationValidationMessage
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}
              >
                {isValidatingInvitation ? (
                  <span>Verifying invitation…</span>
                ) : (
                  <span>
                    {invitationValidationMessage ||
                      'Invitation detected. We will prefill your details after verification.'}
                  </span>
                )}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Full Name *
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                  Email Address *
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  disabled={emailLocked || hasInviteParams}
                  className={`block w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm ${emailLocked || hasInviteParams ? 'bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed' : 'border-gray-300'}`}
                  placeholder="john@example.com"
                />
                {emailLocked && (
                  <p className="mt-1 text-xs text-gray-500">
                    This email is tied to your invitation and cannot be changed.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                  Confirm Password *
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Confirm your password"
                />
                {password && confirmPassword && password !== confirmPassword && (
                  <p className="mt-1 text-xs text-red-600">Passwords must match exactly.</p>
                )}
              </div>
            </div>

            <button
              onClick={handleStep1Next}
              disabled={!isStep1Complete}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Continue
            </button>

            <div className="text-center">
              <Link
                to="/login"
                className="text-sm text-primary-600 hover:text-primary-500"
              >
                Already have an account? Sign in
              </Link>
            </div>
          </div>
        )}

        {/* Step 2: Company Selection */}
        {step === 2 && (
          <div className="space-y-6">
            {isInviteFlow ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 text-center">
                    Confirm Company
                  </h2>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    This invitation will connect you to {invitationDetails?.companyName || 'the selected company'}.
                  </p>
                </div>

                <div className="border rounded-lg p-6 bg-gray-50">
                  <p className="text-sm text-gray-500 uppercase tracking-wide">Company</p>
                  <p className="text-lg font-semibold text-gray-900">{invitationDetails?.companyName || '—'}</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600">
                    <div><span className="font-medium text-gray-700">Company Code:</span> {companyCode}</div>
                    <div><span className="font-medium text-gray-700">Invited Email:</span> {invitationDetails?.email || email}</div>
                    <div><span className="font-medium text-gray-700">Invitation Role:</span> {ROLE_OPTIONS.find((opt) => opt.value === invitedRole)?.label || 'Field Technician'}</div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStep2Next}
                    className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 text-center">
                    Company Association
                  </h2>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    Join an existing company or create a new one
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="companyOption"
                        value="existing"
                        checked={companyOption === 'existing'}
                        onChange={(e) => setCompanyOption(e.target.value)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium text-gray-900">Join Existing Company</div>
                        <div className="text-sm text-gray-500">Enter company code or search for your company</div>
                      </div>
                    </label>
                  </div>

                  {companyOption === 'existing' && (
                    <div className="ml-8 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Company Code
                        </label>
                        <input
                          type="text"
                          value={companyCode}
                          onChange={(e) => setCompanyCode(e.target.value.toUpperCase().slice(0, 6))}
                          maxLength={6}
                          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm uppercase"
                          placeholder="Enter 6-character code"
                        />
                        {validatingCode && (
                          <p className="mt-1 text-xs text-blue-600">Validating...</p>
                        )}
                        {codeValidationMessage && !validatingCode && (
                          <p className={`mt-1 text-xs ${
                            selectedCompany ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {codeValidationMessage}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-gray-500">
                          Ask your company administrator for the company code
                        </p>
                        {invitationCode && (
                          <p className="mt-1 text-xs text-gray-500">
                            Invitation codes are 8 characters and are used to validate your invite. The 6-character company code above links you to the correct company.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="border rounded-lg p-4">
                    <label className="flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name="companyOption"
                        value="new"
                        checked={companyOption === 'new'}
                        onChange={(e) => setCompanyOption(e.target.value)}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-medium text-gray-900">Create New Company</div>
                        <div className="text-sm text-gray-500">You'll be set as the company administrator</div>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStep2Next}
                    className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
                  >
                    Continue
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Role Selection (only for existing company) */}
        {step === 3 && (
          <div className="space-y-6">
            {isInviteFlow ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 text-center">
                    Invitation Role
                  </h2>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    Your administrator has assigned your role. Review the details and continue.
                  </p>
                </div>

                <div className="border border-primary-500 bg-primary-50 rounded-lg p-6">
                  <div className="font-medium text-primary-700 uppercase text-xs tracking-wider">Assigned Role</div>
                  <div className="mt-2 text-xl font-semibold text-gray-900">{ROLE_OPTIONS.find((option) => option.value === invitedRole)?.label || 'Field Technician'}</div>
                  <p className="mt-2 text-sm text-gray-600">{ROLE_OPTIONS.find((option) => option.value === invitedRole)?.description}</p>
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStep3Next}
                    disabled={isLoading}
                    className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 text-center">
                    Select Your Role
                  </h2>
                  <p className="mt-2 text-center text-sm text-gray-600">
                    Choose the role that best describes your position
                  </p>
                </div>

                <div className="space-y-3">
                  {ROLE_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      className={`border rounded-lg p-4 cursor-pointer transition-all ${
                        role === option.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setRole(option.value)}
                    >
                      <div className="flex items-start">
                        <input
                          type="radio"
                          name="role"
                          value={option.value}
                          checked={role === option.value}
                          onChange={() => setRole(option.value)}
                          className="mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{option.label}</div>
                          <div className="text-sm text-gray-500 mt-1">{option.description}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep(2)}
                    className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleStep3Next}
                    disabled={isLoading}
                    className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 4: Company Details (for new company) */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 text-center">
                Company Information
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                Provide basic information about your company
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700">
                  Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Acme Services Inc."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={companyPhone}
                  onChange={(e) => {
                    const formatted = formatPhoneNumber(e.target.value);
                    setCompanyPhone(formatted);
                  }}
                  maxLength={14}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Street Address *
                </label>
                <input
                  type="text"
                  required
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="123 Main St"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    City *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyCity}
                    onChange={(e) => setCompanyCity(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="City"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    State *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyState}
                    onChange={(e) => setCompanyState(e.target.value.toUpperCase())}
                    maxLength={2}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="CA"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    ZIP Code *
                  </label>
                  <input
                    type="text"
                    required
                    value={companyZipCode}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                      setCompanyZipCode(value);
                    }}
                    maxLength={5}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    placeholder="12345"
                  />
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex">
                  <BuildingOfficeIcon className="h-5 w-5 text-blue-600 mr-2" />
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">Note:</p>
                    <p className="mt-1">
                      You'll be able to configure services, branding, and team members after account creation.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex space-x-3">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleStep4Next}
                disabled={isLoading}
                className="flex-1 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
              >
                {isLoading ? 'Creating Account...' : 'Create Account & Company'}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default SignUpPage;

