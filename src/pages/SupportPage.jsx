import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  EnvelopeIcon, 
  PhoneIcon, 
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';

export default function SupportPage() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    // Create mailto link with form data
    const subject = encodeURIComponent(formData.subject || 'Support Request');
    const body = encodeURIComponent(
      `Name: ${formData.name}\nEmail: ${formData.email}\n\nMessage:\n${formData.message}`
    );
    const mailtoLink = `mailto:support@route-logistics.com?subject=${subject}&body=${body}`;
    
    // Open email client
    window.location.href = mailtoLink;
    
    // Show success message
    setSubmitStatus('success');
    setIsSubmitting(false);
    
    // Reset form after a delay
    setTimeout(() => {
      setFormData({ name: '', email: '', subject: '', message: '' });
      setSubmitStatus(null);
    }, 3000);
  };

  const faqs = [
    {
      question: 'How do I reset my password?',
      answer: 'If you forgot your password, please contact support at support@route-logistics.com and we will help you reset it.'
    },
    {
      question: 'How do I invite team members?',
      answer: 'Go to the Invitations page in your dashboard, click "New Invitation", enter the team member\'s email and role, then send the invitation. They will receive an email with an invitation code.'
    },
    {
      question: 'How do I track my jobs?',
      answer: 'All your jobs are visible in the Jobs page. You can filter by status, date range, customer, or search by job details. Field technicians can update job status and add photos directly from the mobile app.'
    },
    {
      question: 'How do I create invoices?',
      answer: 'Invoices can be created from completed jobs. Go to the Jobs page, select a completed job, and click "Create Invoice". You can customize invoice templates and send invoices directly to customers.'
    },
    {
      question: 'Can I customize my company profile?',
      answer: 'Yes! Go to Company Setup to update your company information, logo, contact details, and service areas. This information will appear on estimates and invoices.'
    },
    {
      question: 'How do customers access their portal?',
      answer: 'Customers receive an email with a login code (OTP) when they have jobs or invoices. They can use the mobile app or web portal to view their jobs, invoices, and company information.'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header */}
        <div className="mb-8">
          <Link 
            to="/login" 
            className="text-green-600 hover:text-green-700 mb-4 inline-block"
          >
            ← Back to Login
          </Link>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Support & Help Center
          </h1>
          <p className="text-gray-600">
            Get help with Route Logistics Field Service Management Platform
          </p>
        </div>

        {/* Contact Methods */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">
            Contact Us
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-start">
              <EnvelopeIcon className="h-6 w-6 text-green-600 mt-1 mr-3 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Email Support</h3>
                <a 
                  href="mailto:support@route-logistics.com" 
                  className="text-green-600 hover:text-green-700"
                >
                  support@route-logistics.com
                </a>
                <p className="text-sm text-gray-600 mt-1">
                  We typically respond within 24 hours
                </p>
              </div>
            </div>
            <div className="flex items-start">
              <DocumentTextIcon className="h-6 w-6 text-green-600 mt-1 mr-3 flex-shrink-0" />
              <div>
                <h3 className="font-medium text-gray-900 mb-1">Documentation</h3>
                <Link 
                  to="/privacy-policy" 
                  className="text-green-600 hover:text-green-700"
                >
                  Privacy Policy
                </Link>
                <p className="text-sm text-gray-600 mt-1">
                  Review our privacy policy and terms
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="bg-white rounded-lg shadow-sm p-8 mb-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
            <ChatBubbleLeftRightIcon className="h-6 w-6 mr-2 text-green-600" />
            Send Us a Message
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Name *
                </label>
                <input
                  type="text"
                  id="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Your Email *
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
                Subject *
              </label>
              <input
                type="text"
                id="subject"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="e.g., Password Reset, Feature Request, Bug Report"
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">
                Message *
              </label>
              <textarea
                id="message"
                required
                rows={6}
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                placeholder="Please describe your issue or question in detail..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500"
              />
            </div>
            {submitStatus === 'success' && (
              <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-800">
                Your email client should open with your message. If it doesn't, please email us directly at support@route-logistics.com
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full md:w-auto px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Opening Email...' : 'Send Message'}
            </button>
          </form>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
            <QuestionMarkCircleIcon className="h-6 w-6 mr-2 text-green-600" />
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {faqs.map((faq, index) => (
              <div key={index} className="border-b border-gray-200 pb-4 last:border-b-0">
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {faq.question}
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="mt-8 bg-white rounded-lg shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">
            Quick Links
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link 
              to="/login" 
              className="p-4 border border-gray-200 rounded-md hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <h3 className="font-medium text-gray-900 mb-1">Login to Your Account</h3>
              <p className="text-sm text-gray-600">Access your dashboard and manage your business</p>
            </Link>
            <Link 
              to="/signup" 
              className="p-4 border border-gray-200 rounded-md hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <h3 className="font-medium text-gray-900 mb-1">Create an Account</h3>
              <p className="text-sm text-gray-600">Sign up for Route Logistics field service management</p>
            </Link>
            <Link 
              to="/privacy-policy" 
              className="p-4 border border-gray-200 rounded-md hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <h3 className="font-medium text-gray-900 mb-1">Privacy Policy</h3>
              <p className="text-sm text-gray-600">Learn how we protect your data and privacy</p>
            </Link>
            <a 
              href="mailto:support@route-logistics.com" 
              className="p-4 border border-gray-200 rounded-md hover:border-green-500 hover:bg-green-50 transition-colors"
            >
              <h3 className="font-medium text-gray-900 mb-1">Email Support</h3>
              <p className="text-sm text-gray-600">Get help from our support team</p>
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 text-sm">
          <p>© {new Date().getFullYear()} Route Logistics. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

