import React from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-gray-600">
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow-sm p-8 space-y-8">
          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              1. Introduction
            </h2>
            <p className="text-gray-700 leading-relaxed">
              Route Logistics ("we," "our," or "us") is committed to protecting your privacy. 
              This Privacy Policy explains how we collect, use, disclose, and safeguard your 
              information when you use our mobile application and web platform (collectively, 
              the "Service"). Please read this Privacy Policy carefully. If you do not agree 
              with the terms of this Privacy Policy, please do not access the Service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              2. Information We Collect
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  2.1 Personal Information
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  We may collect personal information that you voluntarily provide to us when you:
                </p>
                <ul className="list-disc list-inside text-gray-700 ml-4 mt-2 space-y-1">
                  <li>Register for an account (name, email address, phone number)</li>
                  <li>Create or update your profile</li>
                  <li>Submit service requests or job information</li>
                  <li>Contact us for support</li>
                  <li>Use certain features of the Service</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  2.2 Location Information
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  With your permission, we collect location data to:
                </p>
                <ul className="list-disc list-inside text-gray-700 ml-4 mt-2 space-y-1">
                  <li>Track technician routes and provide proof of service</li>
                  <li>Optimize job routing and scheduling</li>
                  <li>Provide location-based services</li>
                </ul>
                <p className="text-gray-700 leading-relaxed mt-2">
                  Location data is collected only when the app is actively being used for work purposes 
                  and can be disabled in your device settings at any time.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  2.3 Photos and Media
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  We may collect photos and images that you upload through the Service, including:
                </p>
                <ul className="list-disc list-inside text-gray-700 ml-4 mt-2 space-y-1">
                  <li>Job completion photos</li>
                  <li>Customer property photos</li>
                  <li>Service documentation photos</li>
                </ul>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  2.4 Usage Data
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  We automatically collect certain information when you access and use the Service, including:
                </p>
                <ul className="list-disc list-inside text-gray-700 ml-4 mt-2 space-y-1">
                  <li>Device information (device type, operating system, unique device identifiers)</li>
                  <li>Log data (IP address, browser type, access times, pages viewed)</li>
                  <li>App usage statistics</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Process and manage service requests and job assignments</li>
              <li>Send you notifications, updates, and administrative messages</li>
              <li>Respond to your comments, questions, and requests</li>
              <li>Monitor and analyze usage patterns and trends</li>
              <li>Detect, prevent, and address technical issues</li>
              <li>Comply with legal obligations</li>
              <li>Protect the rights, property, and safety of our users and others</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              4. Data Storage and Security
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  4.1 Data Storage
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Your data is stored securely using Firebase, a Google Cloud Platform service. 
                  Data is stored in the United States and is subject to Firebase's security measures 
                  and privacy policies. We implement appropriate technical and organizational measures 
                  to protect your personal information.
                </p>
              </div>

              <div>
                <h3 className="text-xl font-medium text-gray-900 mb-2">
                  4.2 Security Measures
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  We use industry-standard security technologies and procedures to help protect your 
                  personal information from unauthorized access, use, or disclosure. However, no method 
                  of transmission over the Internet or electronic storage is 100% secure, and we cannot 
                  guarantee absolute security.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              5. Third-Party Services
            </h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              We use third-party services that may collect information used to identify you:
            </p>
            <ul className="list-disc list-inside text-gray-700 ml-4 space-y-2">
              <li>
                <strong>Firebase (Google)</strong>: Authentication, database, storage, and analytics services. 
                See Google's Privacy Policy: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700">https://policies.google.com/privacy</a>
              </li>
              <li>
                <strong>Google Maps</strong>: Location services and mapping. See Google Maps Privacy Policy: 
                <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:text-green-700"> https://policies.google.com/privacy</a>
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              6. Data Sharing and Disclosure
            </h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              We do not sell, trade, or rent your personal information to third parties. We may share 
              your information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
              <li>With your consent</li>
              <li>To comply with legal obligations or respond to lawful requests</li>
              <li>To protect our rights, privacy, safety, or property</li>
              <li>In connection with a business transfer (merger, acquisition, etc.)</li>
              <li>With service providers who assist us in operating the Service (under strict confidentiality agreements)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              7. Your Rights and Choices
            </h2>
            <p className="text-gray-700 leading-relaxed mb-2">
              You have the right to:
            </p>
            <ul className="list-disc list-inside text-gray-700 ml-4 space-y-1">
              <li>Access and receive a copy of your personal information</li>
              <li>Correct inaccurate or incomplete information</li>
              <li>Request deletion of your personal information</li>
              <li>Object to or restrict processing of your information</li>
              <li>Withdraw consent at any time (where processing is based on consent)</li>
              <li>Disable location tracking through your device settings</li>
              <li>Opt out of certain communications</li>
            </ul>
            <p className="text-gray-700 leading-relaxed mt-4">
              To exercise these rights, please contact us at the email address provided below.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              8. Children's Privacy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              The Service is not intended for individuals under the age of 18. We do not knowingly 
              collect personal information from children. If you become aware that a child has provided 
              us with personal information, please contact us, and we will take steps to delete such 
              information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              9. Changes to This Privacy Policy
            </h2>
            <p className="text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes 
              by posting the new Privacy Policy on this page and updating the "Last updated" date. 
              You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">
              10. Contact Us
            </h2>
            <p className="text-gray-700 leading-relaxed">
              If you have any questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-gray-700">
                <strong>Email:</strong> <a href="mailto:support@route-logistics.com" className="text-green-600 hover:text-green-700">support@route-logistics.com</a>
              </p>
              <p className="text-gray-700">
                <strong>Service:</strong> Route Logistics Field Service Management Platform
              </p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-600 text-sm">
          <p>© {new Date().getFullYear()} Route Logistics. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

