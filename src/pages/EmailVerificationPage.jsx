import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../services/firebase';
import { sendEmailVerification, reload, applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { 
  EnvelopeIcon,
  CheckCircleIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const EmailVerificationPage = () => {
  const [email, setEmail] = useState('');
  const [isResending, setIsResending] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signin } = useAuth();

  useEffect(() => {
    // Check if user is coming from Firebase email verification link
    // Firebase includes action code parameters in the URL
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const actionCode = urlParams.get('oobCode');
    const continueUrl = urlParams.get('continueUrl');
    
    // Handle email verification action code from Firebase email
    if (mode === 'verifyEmail' && actionCode) {
      handleEmailVerification(actionCode, continueUrl);
      return;
    }
    
    // Get email from location state or from auth user
    const emailFromState = location.state?.email;
    const currentUser = auth.currentUser;
    
    if (emailFromState) {
      setEmail(emailFromState);
    } else if (currentUser?.email) {
      setEmail(currentUser.email);
    } else {
      // No email available, redirect to login
      navigate('/login', { 
        state: { message: 'Please sign in to verify your email' } 
      });
    }

    // Check verification status periodically
    const checkVerification = async () => {
      if (currentUser) {
        await reload(currentUser);
        if (currentUser.emailVerified) {
          toast.success('Email verified! Redirecting...');
          
          // Check if user needs company setup
          const pendingCompanyData = localStorage.getItem('pendingCompanyData');
          if (pendingCompanyData) {
            // User signed up with new company - redirect to company setup
            navigate('/company-setup');
          } else {
            // User signed up with existing company or no company - go to home
            navigate('/');
          }
        }
      }
    };

    // Check immediately
    checkVerification();

    // Check every 3 seconds
    const interval = setInterval(checkVerification, 3000);

    return () => clearInterval(interval);
  }, [location.state, navigate]);

  // Handle email verification from Firebase action link
  const handleEmailVerification = async (actionCode, continueUrl) => {
    try {
      // Apply the action code to verify the email
      await applyActionCode(auth, actionCode);
      
      toast.success('Email verified successfully!');
      
      // Reload the current user to update emailVerified status
      const currentUser = auth.currentUser;
      if (currentUser) {
        await reload(currentUser);
      }
      
      // Check if user has pending company data (new company signup)
      const pendingCompanyData = localStorage.getItem('pendingCompanyData');
      
      // Redirect appropriately
      if (pendingCompanyData) {
        // User signed up with new company - redirect to company setup
        navigate('/company-setup', { replace: true });
      } else if (continueUrl) {
        // Use the continue URL if provided
        window.location.href = continueUrl;
      } else {
        // Default redirect to home
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('Error verifying email:', error);
      
      let errorMessage = 'Failed to verify email. ';
      switch (error.code) {
        case 'auth/invalid-action-code':
          errorMessage += 'The verification link is invalid or has expired.';
          break;
        case 'auth/expired-action-code':
          errorMessage += 'The verification link has expired. Please request a new one.';
          break;
        default:
          errorMessage += error.message || 'Please try again.';
      }
      
      toast.error(errorMessage);
      
      // Still show the verification page so user can request a new verification email
      const currentUser = auth.currentUser;
      if (currentUser?.email) {
        setEmail(currentUser.email);
      }
    }
  };

  const handleResendVerification = async () => {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      toast.error('Please sign in to resend verification email');
      navigate('/login', { 
        state: { 
          email: email,
          message: 'Please sign in to resend verification email' 
        } 
      });
      return;
    }

    setIsResending(true);
    try {
      await sendEmailVerification(currentUser);
      toast.success('Verification email sent! Please check your inbox.');
    } catch (error) {
      console.error('Error resending verification:', error);
      toast.error('Failed to resend verification email. Please try again.');
    } finally {
      setIsResending(false);
    }
  };

  const handleCheckVerification = async () => {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      toast.error('Please sign in first');
      navigate('/login', { 
        state: { 
          email: email,
          message: 'Please sign in to verify your email' 
        } 
      });
      return;
    }

    setIsChecking(true);
    try {
      await reload(currentUser);
      
      if (currentUser.emailVerified) {
        toast.success('Email verified! Redirecting...');
        
        // Check if user has pending company data (new company signup)
        const pendingCompanyData = localStorage.getItem('pendingCompanyData');
        if (pendingCompanyData) {
          // User signed up with new company - redirect to company setup
          navigate('/company-setup');
        } else {
          // User signed up with existing company or no company - go to home
          navigate('/');
        }
      } else {
        toast.error('Email not yet verified. Please check your inbox and click the verification link.');
      }
    } catch (error) {
      console.error('Error checking verification:', error);
      toast.error('Failed to check verification status. Please try again.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
              <EnvelopeIcon className="h-8 w-8 text-blue-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Verify Your Email
            </h2>
            
            <p className="text-sm text-gray-600 mb-6">
              We've sent a verification email to:
            </p>
            
            <p className="text-lg font-medium text-gray-900 mb-8">
              {email || 'your email address'}
            </p>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800">
                <strong>Please check your inbox</strong> and click the verification link to activate your account.
              </p>
              <p className="text-xs text-blue-700 mt-2">
                Don't see the email? Check your spam folder.
              </p>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleCheckVerification}
                disabled={isChecking}
                className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isChecking ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-5 w-5" />
                    I've Verified My Email
                  </>
                )}
              </button>

              <button
                onClick={handleResendVerification}
                disabled={isResending}
                className="w-full flex justify-center items-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 bg-white rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResending ? (
                  <>
                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <EnvelopeIcon className="h-5 w-5" />
                    Resend Verification Email
                  </>
                )}
              </button>

              <div className="pt-4 border-t border-gray-200">
                <Link
                  to="/login"
                  className="text-sm text-primary-600 hover:text-primary-700"
                >
                  Already verified? Sign in here
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerificationPage;

