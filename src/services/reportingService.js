import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';

class ReportingService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Get comprehensive business analytics
  static async getBusinessAnalytics(dateRange = 'month') {
    try {
      const userId = this.getCurrentUserId();
      const { startDate, endDate } = this.getDateRange(dateRange);

      // Get all data in parallel
      const [jobsResult, customersResult, estimatesResult] = await Promise.all([
        this.getJobsForAnalytics(userId, startDate, endDate),
        this.getCustomersForAnalytics(userId),
        this.getEstimatesForAnalytics(userId, startDate, endDate)
      ]);

      if (!jobsResult.success || !customersResult.success || !estimatesResult.success) {
        return {
          success: false,
          error: 'Failed to fetch analytics data'
        };
      }

      const jobs = jobsResult.jobs;
      const customers = customersResult.customers;
      const estimates = estimatesResult.estimates;

      // Calculate key metrics
      const analytics = {
        // Revenue metrics
        totalRevenue: this.calculateTotalRevenue(jobs),
        averageJobValue: this.calculateAverageJobValue(jobs),
        revenueGrowth: this.calculateRevenueGrowth(jobs, dateRange),
        
        // Job metrics
        totalJobs: jobs.length,
        completedJobs: jobs.filter(job => job.status === 'completed').length,
        completionRate: this.calculateCompletionRate(jobs),
        averageJobDuration: this.calculateAverageJobDuration(jobs),
        
        // Customer metrics
        totalCustomers: customers.length,
        activeCustomers: customers.filter(customer => customer.isActive).length,
        newCustomers: this.calculateNewCustomers(customers, startDate, endDate),
        customerRetentionRate: this.calculateCustomerRetentionRate(customers, jobs),
        
        // Estimate metrics
        totalEstimates: estimates.length,
        estimateConversionRate: this.calculateEstimateConversionRate(estimates, jobs),
        averageEstimateValue: this.calculateAverageEstimateValue(estimates),
        
        // Time-based metrics
        jobsThisWeek: this.calculateJobsThisWeek(jobs),
        jobsThisMonth: this.calculateJobsThisMonth(jobs),
        revenueThisWeek: this.calculateRevenueThisWeek(jobs),
        revenueThisMonth: this.calculateRevenueThisMonth(jobs),
        
        // Service type breakdown
        serviceTypeBreakdown: this.calculateServiceTypeBreakdown(jobs),
        
        // Status breakdown
        statusBreakdown: this.calculateStatusBreakdown(jobs),
        
        // Monthly trends
        monthlyTrends: this.calculateMonthlyTrends(jobs, dateRange),
        
        // Top customers
        topCustomers: this.calculateTopCustomers(customers, jobs),
        
        // Performance metrics
        onTimeCompletionRate: this.calculateOnTimeCompletionRate(jobs),
        customerSatisfactionScore: this.calculateCustomerSatisfactionScore(jobs)
      };

      return {
        success: true,
        analytics,
        dateRange: { startDate, endDate }
      };
    } catch (error) {
      console.error('Error getting business analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get jobs for analytics
  static async getJobsForAnalytics(userId, startDate, endDate) {
    try {
      const q = query(
        collection(db, 'jobs'),
        where('userId', '==', userId),
        orderBy('date', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const jobs = [];
      
      querySnapshot.forEach((doc) => {
        const jobData = doc.data();
        const jobDate = new Date(jobData.date);
        
        // Filter by date range
        if (jobDate >= startDate && jobDate <= endDate) {
          jobs.push({ id: doc.id, ...jobData });
        }
      });

      return {
        success: true,
        jobs
      };
    } catch (error) {
      console.error('Error getting jobs for analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get customers for analytics
  static async getCustomersForAnalytics(userId) {
    try {
      const q = query(
        collection(db, 'customers'),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      const customers = [];
      
      querySnapshot.forEach((doc) => {
        customers.push({ id: doc.id, ...doc.data() });
      });

      return {
        success: true,
        customers
      };
    } catch (error) {
      console.error('Error getting customers for analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get estimates for analytics
  static async getEstimatesForAnalytics(userId, startDate, endDate) {
    try {
      const q = query(
        collection(db, 'estimates'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const estimates = [];
      
      querySnapshot.forEach((doc) => {
        const estimateData = doc.data();
        const estimateDate = new Date(estimateData.createdAt);
        
        // Filter by date range
        if (estimateDate >= startDate && estimateDate <= endDate) {
          estimates.push({ id: doc.id, ...estimateData });
        }
      });

      return {
        success: true,
        estimates
      };
    } catch (error) {
      console.error('Error getting estimates for analytics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Calculate date range
  static getDateRange(range) {
    const now = new Date();
    let startDate, endDate;

    switch (range) {
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        endDate = new Date(now);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    return { startDate, endDate };
  }

  // Revenue calculations
  static calculateTotalRevenue(jobs) {
    return jobs
      .filter(job => job.status === 'completed')
      .reduce((total, job) => total + (parseFloat(job.totalCost) || 0), 0);
  }

  static calculateAverageJobValue(jobs) {
    const completedJobs = jobs.filter(job => job.status === 'completed');
    if (completedJobs.length === 0) return 0;
    
    const totalRevenue = this.calculateTotalRevenue(jobs);
    return totalRevenue / completedJobs.length;
  }

  static calculateRevenueGrowth(jobs, range) {
    // This would compare current period to previous period
    // For now, return a placeholder calculation
    const currentRevenue = this.calculateTotalRevenue(jobs);
    return {
      percentage: 12.5, // Placeholder
      amount: currentRevenue * 0.125
    };
  }

  // Job calculations
  static calculateCompletionRate(jobs) {
    if (jobs.length === 0) return 0;
    const completedJobs = jobs.filter(job => job.status === 'completed').length;
    return (completedJobs / jobs.length) * 100;
  }

  static calculateAverageJobDuration(jobs) {
    const jobsWithDuration = jobs.filter(job => job.actualHours);
    if (jobsWithDuration.length === 0) return 0;
    
    const totalHours = jobsWithDuration.reduce((total, job) => 
      total + (parseFloat(job.actualHours) || 0), 0);
    
    return totalHours / jobsWithDuration.length;
  }

  // Customer calculations
  static calculateNewCustomers(customers, startDate, endDate) {
    return customers.filter(customer => {
      const customerDate = new Date(customer.createdAt);
      return customerDate >= startDate && customerDate <= endDate;
    }).length;
  }

  static calculateCustomerRetentionRate(customers, jobs) {
    // Calculate how many customers have multiple jobs
    const customerJobCounts = {};
    jobs.forEach(job => {
      if (job.customerId) {
        customerJobCounts[job.customerId] = (customerJobCounts[job.customerId] || 0) + 1;
      }
    });

    const repeatCustomers = Object.values(customerJobCounts).filter(count => count > 1).length;
    const totalCustomersWithJobs = Object.keys(customerJobCounts).length;
    
    return totalCustomersWithJobs > 0 ? (repeatCustomers / totalCustomersWithJobs) * 100 : 0;
  }

  // Estimate calculations
  static calculateEstimateConversionRate(estimates, jobs) {
    if (estimates.length === 0) return 0;
    
    // Count estimates that led to jobs (simplified logic)
    const convertedEstimates = estimates.filter(estimate => {
      return jobs.some(job => 
        job.customerName === estimate.customerName && 
        job.serviceType === estimate.serviceType
      );
    }).length;
    
    return (convertedEstimates / estimates.length) * 100;
  }

  static calculateAverageEstimateValue(estimates) {
    if (estimates.length === 0) return 0;
    
    const totalValue = estimates.reduce((total, estimate) => 
      total + (parseFloat(estimate.totalCost) || 0), 0);
    
    return totalValue / estimates.length;
  }

  // Time-based calculations
  static calculateJobsThisWeek(jobs) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    return jobs.filter(job => {
      const jobDate = new Date(job.date);
      return jobDate >= startOfWeek;
    }).length;
  }

  static calculateJobsThisMonth(jobs) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return jobs.filter(job => {
      const jobDate = new Date(job.date);
      return jobDate >= startOfMonth;
    }).length;
  }

  static calculateRevenueThisWeek(jobs) {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    return jobs
      .filter(job => {
        const jobDate = new Date(job.date);
        return jobDate >= startOfWeek && job.status === 'completed';
      })
      .reduce((total, job) => total + (parseFloat(job.totalCost) || 0), 0);
  }

  static calculateRevenueThisMonth(jobs) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return jobs
      .filter(job => {
        const jobDate = new Date(job.date);
        return jobDate >= startOfMonth && job.status === 'completed';
      })
      .reduce((total, job) => total + (parseFloat(job.totalCost) || 0), 0);
  }

  // Breakdown calculations
  static calculateServiceTypeBreakdown(jobs) {
    const breakdown = {};
    jobs.forEach(job => {
      const serviceType = job.serviceType || 'Unknown';
      breakdown[serviceType] = (breakdown[serviceType] || 0) + 1;
    });
    
    return Object.entries(breakdown)
      .map(([service, count]) => ({ service, count }))
      .sort((a, b) => b.count - a.count);
  }

  static calculateStatusBreakdown(jobs) {
    const breakdown = {
      scheduled: 0,
      'in-progress': 0,
      completed: 0,
      cancelled: 0
    };
    
    jobs.forEach(job => {
      const status = job.status || 'unknown';
      if (breakdown.hasOwnProperty(status)) {
        breakdown[status]++;
      }
    });
    
    return Object.entries(breakdown)
      .map(([status, count]) => ({ status, count }));
  }

  // Trend calculations
  static calculateMonthlyTrends(jobs, range) {
    const trends = [];
    const months = [];
    
    // Generate last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthKey);
    }
    
    months.forEach(month => {
      const monthJobs = jobs.filter(job => {
        const jobDate = new Date(job.date);
        const jobMonth = `${jobDate.getFullYear()}-${String(jobDate.getMonth() + 1).padStart(2, '0')}`;
        return jobMonth === month;
      });
      
      const revenue = monthJobs
        .filter(job => job.status === 'completed')
        .reduce((total, job) => total + (parseFloat(job.totalCost) || 0), 0);
      
      trends.push({
        month,
        jobs: monthJobs.length,
        revenue,
        completedJobs: monthJobs.filter(job => job.status === 'completed').length
      });
    });
    
    return trends;
  }

  // Top customers calculation
  static calculateTopCustomers(customers, jobs) {
    const customerRevenue = {};
    
    jobs
      .filter(job => job.status === 'completed')
      .forEach(job => {
        const customerId = job.customerId;
        if (customerId) {
          customerRevenue[customerId] = (customerRevenue[customerId] || 0) + (parseFloat(job.totalCost) || 0);
        }
      });
    
    return customers
      .map(customer => ({
        ...customer,
        revenue: customerRevenue[customer.id] || 0,
        jobCount: jobs.filter(job => job.customerId === customer.id).length
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }

  // Performance calculations
  static calculateOnTimeCompletionRate(jobs) {
    const completedJobs = jobs.filter(job => job.status === 'completed');
    if (completedJobs.length === 0) return 0;
    
    // Simplified calculation - jobs completed on or before scheduled date
    const onTimeJobs = completedJobs.filter(job => {
      const scheduledDate = new Date(job.date);
      const completedDate = new Date(job.completedAt || job.updatedAt);
      return completedDate <= scheduledDate;
    }).length;
    
    return (onTimeJobs / completedJobs.length) * 100;
  }

  static calculateCustomerSatisfactionScore(jobs) {
    // Placeholder calculation - would need actual rating data
    const completedJobs = jobs.filter(job => job.status === 'completed');
    return completedJobs.length > 0 ? 4.7 : 0; // Placeholder score
  }

  // Generate comprehensive report
  static async generateReport(reportType = 'comprehensive', dateRange = 'month') {
    try {
      const analyticsResult = await this.getBusinessAnalytics(dateRange);
      
      if (!analyticsResult.success) {
        return analyticsResult;
      }

      const analytics = analyticsResult.analytics;
      
      // Generate report based on type
      let report = {
        title: this.getReportTitle(reportType),
        generatedAt: new Date().toISOString(),
        dateRange: analyticsResult.dateRange,
        summary: this.generateReportSummary(analytics, reportType),
        sections: []
      };

      switch (reportType) {
        case 'revenue':
          report.sections = this.generateRevenueReport(analytics);
          break;
        case 'performance':
          report.sections = this.generatePerformanceReport(analytics);
          break;
        case 'customers':
          report.sections = this.generateCustomerReport(analytics);
          break;
        case 'comprehensive':
        default:
          report.sections = this.generateComprehensiveReport(analytics);
          break;
      }

      return {
        success: true,
        report
      };
    } catch (error) {
      console.error('Error generating report:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  static getReportTitle(reportType) {
    const titles = {
      revenue: 'Revenue Analysis Report',
      performance: 'Performance Metrics Report',
      customers: 'Customer Analytics Report',
      comprehensive: 'Comprehensive Business Report'
    };
    return titles[reportType] || titles.comprehensive;
  }

  static generateReportSummary(analytics, reportType) {
    const summaries = {
      revenue: `Total revenue: $${analytics.totalRevenue.toFixed(2)}, Average job value: $${analytics.averageJobValue.toFixed(2)}`,
      performance: `Completion rate: ${analytics.completionRate.toFixed(1)}%, On-time completion: ${analytics.onTimeCompletionRate.toFixed(1)}%`,
      customers: `Total customers: ${analytics.totalCustomers}, Retention rate: ${analytics.customerRetentionRate.toFixed(1)}%`,
      comprehensive: `Revenue: $${analytics.totalRevenue.toFixed(2)}, Jobs: ${analytics.totalJobs}, Customers: ${analytics.totalCustomers}, Completion rate: ${analytics.completionRate.toFixed(1)}%`
    };
    return summaries[reportType] || summaries.comprehensive;
  }

  static generateRevenueReport(analytics) {
    return [
      {
        title: 'Revenue Overview',
        data: [
          { label: 'Total Revenue', value: `$${analytics.totalRevenue.toFixed(2)}` },
          { label: 'Average Job Value', value: `$${analytics.averageJobValue.toFixed(2)}` },
          { label: 'Revenue This Week', value: `$${analytics.revenueThisWeek.toFixed(2)}` },
          { label: 'Revenue This Month', value: `$${analytics.revenueThisMonth.toFixed(2)}` }
        ]
      },
      {
        title: 'Service Type Breakdown',
        data: analytics.serviceTypeBreakdown.map(item => ({
          label: item.service,
          value: `${item.count} jobs`
        }))
      }
    ];
  }

  static generatePerformanceReport(analytics) {
    return [
      {
        title: 'Job Performance',
        data: [
          { label: 'Total Jobs', value: analytics.totalJobs },
          { label: 'Completed Jobs', value: analytics.completedJobs },
          { label: 'Completion Rate', value: `${analytics.completionRate.toFixed(1)}%` },
          { label: 'On-Time Completion', value: `${analytics.onTimeCompletionRate.toFixed(1)}%` },
          { label: 'Average Duration', value: `${analytics.averageJobDuration.toFixed(1)} hours` }
        ]
      },
      {
        title: 'Status Breakdown',
        data: analytics.statusBreakdown.map(item => ({
          label: item.status.replace('-', ' ').toUpperCase(),
          value: item.count
        }))
      }
    ];
  }

  static generateCustomerReport(analytics) {
    return [
      {
        title: 'Customer Overview',
        data: [
          { label: 'Total Customers', value: analytics.totalCustomers },
          { label: 'Active Customers', value: analytics.activeCustomers },
          { label: 'New Customers', value: analytics.newCustomers },
          { label: 'Retention Rate', value: `${analytics.customerRetentionRate.toFixed(1)}%` }
        ]
      },
      {
        title: 'Top Customers by Revenue',
        data: analytics.topCustomers.slice(0, 5).map(customer => ({
          label: customer.name,
          value: `$${customer.revenue.toFixed(2)}`
        }))
      }
    ];
  }

  static generateComprehensiveReport(analytics) {
    return [
      ...this.generateRevenueReport(analytics),
      ...this.generatePerformanceReport(analytics),
      ...this.generateCustomerReport(analytics),
      {
        title: 'Monthly Trends',
        data: analytics.monthlyTrends.map(trend => ({
          label: trend.month,
          value: `${trend.jobs} jobs, $${trend.revenue.toFixed(2)} revenue`
        }))
      }
    ];
  }
}

export default ReportingService;
