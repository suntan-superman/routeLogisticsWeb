import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import ReportingService from '../services/reportingService';
import { 
  ChartBarIcon, 
  DocumentArrowDownIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UsersIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  EyeIcon,
  PrinterIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ReportsPage = () => {
  const [analytics, setAnalytics] = useState(null);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState('month');
  const [selectedReportType, setSelectedReportType] = useState('comprehensive');
  const [showReportModal, setShowReportModal] = useState(false);

  const dateRanges = [
    { value: 'week', label: 'Last 7 Days' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' }
  ];

  const reportTypes = [
    { value: 'comprehensive', label: 'Comprehensive Report', icon: ChartBarIcon },
    { value: 'revenue', label: 'Revenue Analysis', icon: CurrencyDollarIcon },
    { value: 'performance', label: 'Performance Metrics', icon: ClipboardDocumentListIcon },
    { value: 'customers', label: 'Customer Analytics', icon: UsersIcon }
  ];

  useEffect(() => {
    loadAnalytics();
  }, [selectedDateRange]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const result = await ReportingService.getBusinessAnalytics(selectedDateRange);
      if (result.success) {
        setAnalytics(result.analytics);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast.error('Error loading analytics');
    }
    setIsLoading(false);
  };

  const generateReport = async () => {
    setIsLoading(true);
    try {
      const result = await ReportingService.generateReport(selectedReportType, selectedDateRange);
      if (result.success) {
        setReport(result.report);
        setShowReportModal(true);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Error generating report');
    }
    setIsLoading(false);
  };

  const exportReport = () => {
    if (!report) return;

    const reportData = {
      title: report.title,
      generatedAt: report.generatedAt,
      dateRange: report.dateRange,
      summary: report.summary,
      sections: report.sections
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${report.title.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    
    toast.success('Report exported successfully!');
  };

  const printReport = () => {
    if (!report) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>${report.title}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .section { margin-bottom: 25px; }
            .section h3 { color: #10b981; border-bottom: 2px solid #10b981; padding-bottom: 5px; }
            .data-item { display: flex; justify-content: space-between; margin: 8px 0; }
            .summary { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${report.title}</h1>
            <p>Generated: ${new Date(report.generatedAt).toLocaleDateString()}</p>
            <p>Date Range: ${new Date(report.dateRange.startDate).toLocaleDateString()} - ${new Date(report.dateRange.endDate).toLocaleDateString()}</p>
          </div>
          <div class="summary">
            <h3>Summary</h3>
            <p>${report.summary}</p>
          </div>
          ${report.sections.map(section => `
            <div class="section">
              <h3>${section.title}</h3>
              ${section.data.map(item => `
                <div class="data-item">
                  <span>${item.label}:</span>
                  <span>${item.value}</span>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  if (isLoading && !analytics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ChartBarIcon className="h-8 w-8 text-primary-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
              <p className="text-gray-600">Comprehensive business insights and performance metrics</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <select
              value={selectedDateRange}
              onChange={(e) => setSelectedDateRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
            >
              {dateRanges.map(range => (
                <option key={range.value} value={range.value}>{range.label}</option>
              ))}
            </select>
            <button
              onClick={generateReport}
              disabled={isLoading}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {analytics && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <CurrencyDollarIcon className="h-6 w-6 text-green-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Revenue</dt>
                    <dd className="text-lg font-medium text-gray-900">{formatCurrency(analytics.totalRevenue)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ClipboardDocumentListIcon className="h-6 w-6 text-blue-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Jobs</dt>
                    <dd className="text-lg font-medium text-gray-900">{analytics.totalJobs}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <UsersIcon className="h-6 w-6 text-purple-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Customers</dt>
                    <dd className="text-lg font-medium text-gray-900">{analytics.totalCustomers}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <ArrowTrendingUpIcon className="h-6 w-6 text-orange-500" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Completion Rate</dt>
                    <dd className="text-lg font-medium text-gray-900">{formatPercentage(analytics.completionRate)}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Report Type Selection */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Select Report Type</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {reportTypes.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.value}
                onClick={() => setSelectedReportType(type.value)}
                className={`p-4 border rounded-lg text-left transition-colors ${
                  selectedReportType === type.value
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-6 w-6 mb-2" />
                <h4 className="font-medium">{type.label}</h4>
              </button>
            );
          })}
        </div>
      </div>

      {/* Analytics Sections */}
      {analytics && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Revenue Analytics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <CurrencyDollarIcon className="h-5 w-5 mr-2 text-green-500" />
              Revenue Analytics
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Average Job Value</span>
                <span className="text-sm font-medium">{formatCurrency(analytics.averageJobValue)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">This Week</span>
                <span className="text-sm font-medium">{formatCurrency(analytics.revenueThisWeek)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">This Month</span>
                <span className="text-sm font-medium">{formatCurrency(analytics.revenueThisMonth)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Growth Rate</span>
                <span className="text-sm font-medium text-green-600">+{analytics.revenueGrowth.percentage.toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <ClipboardDocumentListIcon className="h-5 w-5 mr-2 text-blue-500" />
              Performance Metrics
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Completed Jobs</span>
                <span className="text-sm font-medium">{analytics.completedJobs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">On-Time Completion</span>
                <span className="text-sm font-medium">{formatPercentage(analytics.onTimeCompletionRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Average Duration</span>
                <span className="text-sm font-medium">{analytics.averageJobDuration.toFixed(1)} hrs</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Customer Satisfaction</span>
                <span className="text-sm font-medium">{analytics.customerSatisfactionScore.toFixed(1)}/5.0</span>
              </div>
            </div>
          </div>

          {/* Customer Analytics */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <UsersIcon className="h-5 w-5 mr-2 text-purple-500" />
              Customer Analytics
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Active Customers</span>
                <span className="text-sm font-medium">{analytics.activeCustomers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">New Customers</span>
                <span className="text-sm font-medium">{analytics.newCustomers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Retention Rate</span>
                <span className="text-sm font-medium">{formatPercentage(analytics.customerRetentionRate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Top Customer Revenue</span>
                <span className="text-sm font-medium">{formatCurrency(analytics.topCustomers[0]?.revenue || 0)}</span>
              </div>
            </div>
          </div>

          {/* Service Breakdown */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <ChartBarIcon className="h-5 w-5 mr-2 text-orange-500" />
              Service Type Breakdown
            </h3>
            <div className="space-y-3">
              {analytics.serviceTypeBreakdown.slice(0, 5).map((service, index) => (
                <div key={index} className="flex justify-between">
                  <span className="text-sm text-gray-600">{service.service}</span>
                  <span className="text-sm font-medium">{service.count} jobs</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Monthly Trends */}
      {analytics && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
            <CalendarIcon className="h-5 w-5 mr-2 text-indigo-500" />
            Monthly Trends
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jobs</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Completed</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {analytics.monthlyTrends.map((trend, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trend.month}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trend.jobs}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{trend.completedJobs}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatCurrency(trend.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && report && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">{report.title}</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={printReport}
                    className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <PrinterIcon className="h-4 w-4 mr-2" />
                    Print
                  </button>
                  <button
                    onClick={exportReport}
                    className="flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
                    Export
                  </button>
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <span className="sr-only">Close</span>
                    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="space-y-6 max-h-96 overflow-y-auto">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Report Summary</h4>
                  <p className="text-sm text-gray-600">{report.summary}</p>
                  <div className="mt-2 text-xs text-gray-500">
                    Generated: {new Date(report.generatedAt).toLocaleString()}
                  </div>
                </div>
                
                {report.sections.map((section, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 text-primary-600">{section.title}</h4>
                    <div className="space-y-2">
                      {section.data.map((item, itemIndex) => (
                        <div key={itemIndex} className="flex justify-between py-1">
                          <span className="text-sm text-gray-600">{item.label}</span>
                          <span className="text-sm font-medium text-gray-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default ReportsPage;
