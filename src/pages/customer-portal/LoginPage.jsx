import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerPortal } from '../../contexts/CustomerPortalContext';
import { EnvelopeIcon, SparklesIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const LoginPage = () => {
  const navigate = useNavigate();
  const { requestOTP, isLoading, error } = useCustomerPortal();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState('email'); // 'email' or 'otp'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsSubmitting(true);

    try {
      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setLocalError('Please enter a valid email address');
        return;
      }

      // Request OTP
      const result = await requestOTP(email);

      if (result.success) {
        setStep('otp');
        toast.success('OTP sent to your email!');
      } else {
        setLocalError(result.error || 'Failed to send OTP');
        toast.error(result.error || 'Failed to send OTP');
      }
    } catch (err) {
      setLocalError(err.message || 'An error occurred');
      toast.error(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendOTP = async () => {
    setIsSubmitting(true);
    try {
      const result = await requestOTP(email);
      if (result.success) {
        toast.success('OTP resent to your email!');
      } else {
        setLocalError(result.error || 'Failed to resend OTP');
        toast.error(result.error || 'Failed to resend OTP');
      }
    } catch (err) {
      setLocalError(err.message || 'An error occurred');
      toast.error(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    setStep('email');
    setEmail('');
    setLocalError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo Area */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <SparklesIcon className="w-10 h-10 text-green-600" />
            <h1 className="text-3xl font-bold text-gray-900">mi Factotum</h1>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white py-8 px-6 shadow-lg rounded-lg sm:px-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {step === 'email' ? 'Customer Portal' : 'Verify Your Email'}
            </h2>
            <p className="text-sm text-gray-600">
              {step === 'email' 
                ? 'Sign in to view your service history and invoices'
                : 'Enter the 6-digit code we sent to your email'}
            </p>
          </div>

          {/* Error Message */}
          {(localError || error) && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{localError || error}</p>
            </div>
          )}

          {/* Email Step */}
          {step === 'email' && (
            <form onSubmit={handleEmailSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setLocalError('');
                    }}
                    placeholder="you@example.com"
                    className="block w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg shadow-sm focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 text-sm placeholder-gray-400"
                    disabled={isSubmitting || isLoading}
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isLoading || !email.trim()}
                className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isSubmitting || isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Code'
                )}
              </button>

              {/* Info Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>New to this portal?</strong> Enter your email and we'll send you a code to log in. No password needed!
                </p>
              </div>
            </form>
          )}

          {/* OTP Step */}
          {step === 'otp' && (
            <OTPVerificationForm
              email={email}
              isSubmitting={isSubmitting}
              isLoading={isLoading}
              onBack={handleBack}
              onResend={handleResendOTP}
              onSuccess={() => navigate('/customer-portal/dashboard')}
            />
          )}

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-600">
              Your data is secure and encrypted. We never share your information.
            </p>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-center text-sm text-gray-600">
          <p>Having trouble? <a href="mailto:support@mifactotum.com" className="text-green-600 hover:text-green-700 font-medium">Contact support</a></p>
        </div>
      </div>
    </div>
  );
};

/**
 * OTP Verification Form Component
 */
function OTPVerificationForm({ email, isSubmitting, isLoading, onBack, onResend, onSuccess }) {
  const { verifyOTPAndLogin } = useCustomerPortal();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [localError, setLocalError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  // Handle OTP input
  const handleOTPChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    // Auto-focus to next input
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }

    setLocalError('');
  };

  // Handle backspace
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  // Submit OTP
  const handleOTPSubmit = async (e) => {
    e.preventDefault();
    
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setLocalError('Please enter all 6 digits');
      return;
    }

    setIsVerifying(true);
    setLocalError('');

    try {
      const result = await verifyOTPAndLogin(email, otpCode);
      
      if (result.success) {
        toast.success('Successfully logged in!');
        onSuccess();
      } else {
        setLocalError(result.error || 'Verification failed');
        toast.error(result.error || 'Verification failed');
        setOtp(['', '', '', '', '', '']);
      }
    } catch (err) {
      setLocalError(err.message || 'An error occurred');
      toast.error(err.message || 'An error occurred');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <form onSubmit={handleOTPSubmit} className="space-y-6">
      {/* Email Display */}
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-xs text-gray-600 mb-1">Code sent to:</p>
        <p className="text-sm font-medium text-gray-900 break-all">{email}</p>
      </div>

      {/* Error Message */}
      {localError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{localError}</p>
        </div>
      )}

      {/* OTP Input Fields */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Enter 6-Digit Code
        </label>
        <div className="flex gap-2 justify-center">
          {otp.map((digit, index) => (
            <input
              key={index}
              id={`otp-${index}`}
              type="text"
              inputMode="numeric"
              maxLength="1"
              value={digit}
              onChange={(e) => handleOTPChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-12 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
              disabled={isVerifying || isLoading}
              autoComplete="off"
            />
          ))}
        </div>
      </div>

      {/* Verify Button */}
      <button
        type="submit"
        disabled={isVerifying || isLoading || otp.some(d => !d)}
        className="w-full bg-green-600 text-white py-2.5 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {isVerifying || isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Verifying...
          </>
        ) : (
          'Verify Code'
        )}
      </button>

      {/* Resend & Back */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={onResend}
          disabled={isVerifying || isLoading}
          className="w-full text-green-600 hover:text-green-700 font-medium text-sm py-2 disabled:opacity-50"
        >
          Didn't receive a code? Resend
        </button>
        
        <button
          type="button"
          onClick={onBack}
          disabled={isVerifying || isLoading}
          className="w-full text-gray-600 hover:text-gray-700 font-medium text-sm py-2 disabled:opacity-50"
        >
          Change Email
        </button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-xs text-blue-700 leading-relaxed">
          <strong>Tip:</strong> Check your spam folder if you don't see the email. The code expires in 10 minutes.
        </p>
      </div>
    </form>
  );
}

export default LoginPage;

