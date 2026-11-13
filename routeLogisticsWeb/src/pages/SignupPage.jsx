import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { returnPath } from '../utils/returnPath';
import toast from 'react-hot-toast';
import { motion as Motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import CompanyService from '../services/companyService';

const SignupPage = () => {
  const { signup, refreshSession } = useAuth();
  const location = useLocation();
  const next = returnPath(location.search);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', businessName: '', email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    const result = await signup(form.email, form.password, {
      name: form.name,
      businessName: form.businessName
    });
    if (result.success) {
      // Create the company shell right away so the new owner lands in
      // Company Setup with a real company instead of a blank state.
      if (next) {
        navigate(next);
      } else {
        const company = await CompanyService.createCompany({ name: form.businessName || `${form.name}'s Company` });
        if (!company.success) toast.error(company.error);
        await refreshSession();
        navigate('/company-setup');
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full space-y-8"
      >
        <div>
          <Link to="/" className="mx-auto h-12 w-12 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xl">RL</span>
          </Link>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">Create your account</h2>
          <p className="mt-2 text-center text-sm text-gray-600">{next ? 'Create your personal login to accept your company invitation. Your company and role are already selected.' : 'Set up your company in Route Logistics'}</p>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Your name</label>
            <input
              id="name"
              required
              value={form.name}
              onChange={set('name')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              placeholder="Jane Smith"
            />
          </div>
          {!next && <div>
            <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">Company name</label>
            <input
              id="businessName"
              required={!next}
              disabled={!!next}
              value={form.businessName}
              onChange={set('businessName')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              placeholder="Acme Pest Control"
            />
          </div>}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={set('email')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={form.password}
              onChange={set('password')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              placeholder="At least 6 characters"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 transition-colors"
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
          <p className="text-sm text-gray-600">Read how service information is handled in our <Link className="underline" to="/privacy">privacy notice</Link>.</p>

          <p className="text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to={`/login${location.search}`} className="font-medium text-primary-600 hover:text-primary-500">Sign in</Link>
          </p>
        </form>
      </Motion.div>
    </div>
  );
};

export default SignupPage;
