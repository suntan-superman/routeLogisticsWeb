import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';
import { motion } from 'framer-motion';
import { 
  BuildingOfficeIcon,
  UserGroupIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

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
  
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [validatingCode, setValidatingCode] = useState(false);
  const [codeValidationMessage, setCodeValidationMessage] = useState('');

  useEffect(() => {
    // Validate company code when it's 6 characters
    if (companyOption === 'existing' && companyCode.length === 6) {
      validateCompanyCode();
    } else {
      setCodeValidationMessage('');
      setSelectedCompany(null);
    }
  }, [companyCode, companyOption]);

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
      // If creating new company, user must be admin
      // Company name will be validated in Step 4
      setRole('admin');
      setStep(4); // Skip to company details
    }
  };

  const handleStep3Next = () => {
    if (!role) {
      toast.error('Please select a role');
      return;
    }

    // If admin creating new company, go to company details
    if (companyOption === 'new') {
      setStep(4);
    } else {
      handleSignUp();
    }
  };

  const handleStep4Next = () => {
    if (!companyName || !companyPhone || !companyAddress) {
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
        phoneNumber: '',
        businessName: companyOption === 'new' ? companyName : '',
        address: companyOption === 'new' ? companyAddress : '',
        services: [],
        serviceCategories: [],
        role: role
      };

      const signupResult = await signup(email, password, userData);

      if (!signupResult.success) {
        toast.error(signupResult.error || 'Failed to create account');
        setIsLoading(false);
        return;
      }

      const userId = signupResult.user?.uid;

      // If creating new company, create it now
      if (companyOption === 'new') {
        const companyData = {
          name: companyName,
          phone: companyPhone,
          address: companyAddress,
          email: email,
          services: [],
          serviceCategories: []
        };

        const companyResult = await CompanyService.createCompany(companyData);
        
        if (companyResult.success) {
          toast.success(`Account and company created! Your company code is: ${companyResult.companyCode}`);
          // User profile already updated by createCompany
          navigate('/company-setup');
        } else {
          toast.error('Account created but company setup failed: ' + companyResult.error);
          navigate('/company-setup');
        }
      } else {
        // For existing company, link user via company code
        if (companyCode) {
          const joinResult = await CompanyService.joinCompanyByCode(userId, companyCode, role);
          
          if (joinResult.success) {
            toast.success(`Successfully joined ${joinResult.company.name}!`);
            navigate('/');
          } else {
            toast.error('Failed to join company: ' + joinResult.error);
            toast.info('You can complete company setup later');
            navigate('/');
          }
        } else {
          toast.success('Account created successfully!');
          toast.info('Please contact your company administrator to complete setup');
          navigate('/');
        }
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password *
                </label>
                <input
                  id="password"
                  type="password"
                  required
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
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="Confirm your password"
                />
              </div>
            </div>

            <button
              onClick={handleStep1Next}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
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

        {/* Step 3: Role Selection (only for existing company) */}
        {step === 3 && (
          <div className="space-y-6">
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
                <label className="block text-sm font-medium text-gray-700">
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
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="(555) 123-4567"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Address *
                </label>
                <input
                  type="text"
                  required
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                  placeholder="123 Main St, City, State ZIP"
                />
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

