import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc,
  getDocs, 
  query, 
  where,
  orderBy,
  limit,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from './firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CompanyService from './companyService';
import CustomerService from './customerService';
import JobManagementService from './jobManagementService';

/**
 * Invoice Service for generating and managing invoices
 */
class InvoiceService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  /**
   * Generate invoice number (INV-YYYY-XXX format)
   */
  static generateInvoiceNumber() {
    const year = new Date().getFullYear();
    // For now, use timestamp. In production, you'd want to track sequential numbers
    const sequence = Date.now().toString().slice(-6);
    return `INV-${year}-${sequence}`;
  }

  /**
   * Create invoice from completed job
   * @param {string} jobId - Job ID to create invoice from
   * @param {Object} invoiceData - Additional invoice data (terms, notes, etc.)
   * @returns {Promise<{success: boolean, invoice?: Object, error?: string}>}
   */
  static async createInvoiceFromJob(jobId, invoiceData = {}) {
    try {
      const userId = this.getCurrentUserId();
      
      // Get job details
      const jobResult = await JobManagementService.getJob(jobId);
      if (!jobResult.success || !jobResult.job) {
        return { success: false, error: 'Job not found' };
      }

      const job = jobResult.job;

      // Verify job is completed
      if (job.status !== 'completed') {
        return { success: false, error: 'Can only create invoices for completed jobs' };
      }

      // Get customer details
      let customer = null;
      
      // First try to get customer by ID if available
      if (job.customerId) {
        const customerResult = await CustomerService.getCustomer(job.customerId);
        if (customerResult.success && customerResult.customer) {
          customer = customerResult.customer;
        }
      }
      
      // If no customerId or customer not found, try to find by name
      if (!customer && job.customerName) {
        const customersResult = await CustomerService.getCustomers(100);
        if (customersResult.success && customersResult.customers) {
          // Find customer by name (case-insensitive, exact match preferred)
          customer = customersResult.customers.find(
            c => c.name && c.name.trim().toLowerCase() === job.customerName.trim().toLowerCase()
          );
        }
      }
      
      if (!customer) {
        return { 
          success: false, 
          error: `Customer "${job.customerName || 'Unknown'}" not found. Please ensure the customer exists in your customer list.` 
        };
      }

      // Check customer email consent
      if (!customer.emailConsent) {
        return { success: false, error: 'Customer has not consented to email invoices' };
      }

      // Get company details
      const userProfile = await this.getUserProfile();
      if (!userProfile?.companyId) {
        return { success: false, error: 'Company not found' };
      }

      const companyResult = await CompanyService.getCompany(userProfile.companyId);
      if (!companyResult.success || !companyResult.company) {
        return { success: false, error: 'Company not found' };
      }

      const company = companyResult.company;

      // Create invoice data
      const invoiceNumber = this.generateInvoiceNumber();
      const invoiceDate = new Date().toISOString();
      const dueDate = invoiceData.dueDate || this.calculateDueDate(invoiceDate, invoiceData.paymentTerms || 'net30');
      
      const invoice = {
        invoiceNumber,
        jobId,
        customerId: customer.id,
        customerName: customer.name,
        customerEmail: customer.email || '',
        customerAddress: this.formatCustomerAddress(customer),
        companyId: company.id,
        companyName: company.name,
        companyAddress: this.formatCompanyAddress(company),
        companyPhone: company.phone,
        companyEmail: company.email,
        companyLogo: company.logo || '',
        status: 'drafted', // drafted, sent, viewed, paid, overdue, cancelled
        invoiceDate,
        dueDate,
        paymentTerms: invoiceData.paymentTerms || 'net30',
        items: await this.buildInvoiceItems(job, invoiceData),
        subtotal: invoiceData.subtotal || job.totalCost || 0,
        tax: invoiceData.tax || 0,
        taxRate: invoiceData.taxRate || 0,
        total: this.calculateTotal(invoiceData.subtotal || job.totalCost || 0, invoiceData.tax || 0),
        notes: invoiceData.notes || '',
        terms: invoiceData.terms || this.getDefaultTerms(),
        userId,
        createdAt: invoiceDate,
        updatedAt: invoiceDate,
        sentAt: null,
        viewedAt: null,
        paidAt: null
      };

      // Save to Firestore
      const docRef = await addDoc(collection(db, 'invoices'), invoice);

      return {
        success: true,
        invoice: { id: docRef.id, ...invoice },
        invoiceId: docRef.id
      };
    } catch (error) {
      console.error('Error creating invoice:', error);
      return {
        success: false,
        error: error.message || 'Failed to create invoice'
      };
    }
  }

  /**
   * Build invoice line items from job
   * Includes service charge and materials used
   */
  static async buildInvoiceItems(job, invoiceData) {
    const items = [];

    // Main service item (appears first)
    items.push({
      description: job.serviceType || 'Service',
      quantity: 1,
      unitPrice: invoiceData.subtotal || job.totalCost || 0,
      amount: invoiceData.subtotal || job.totalCost || 0,
      notes: job.actualWorkDone || job.completionNotes || ''
    });

    // Fetch materials used on this job
    try {
      const jobMaterialsQuery = query(
        collection(db, 'jobMaterials'),
        where('jobId', '==', job.id)
      );
      const jobMaterialsSnapshot = await getDocs(jobMaterialsQuery);
      
      // Fetch all materials in parallel
      const materialPromises = [];
      jobMaterialsSnapshot.forEach((doc) => {
        const jobMaterial = doc.data();
        
        if (jobMaterial.materialId) {
          materialPromises.push(
            getDoc(doc(db, 'materials', jobMaterial.materialId))
              .then(materialDoc => ({
                jobMaterial,
                material: materialDoc.exists() ? materialDoc.data() : null
              }))
              .catch(err => {
                console.error('Error fetching material:', err);
                return { jobMaterial, material: null };
              })
          );
        }
      });

      // Wait for all material fetches to complete
      const materialResults = await Promise.all(materialPromises);
      
      // Add materials as line items (after service charge)
      materialResults.forEach(({ jobMaterial, material }) => {
        if (material) {
          items.push({
            description: material.name || 'Material',
            quantity: jobMaterial.quantityUsed || 1,
            unitPrice: jobMaterial.unitPriceAtUse || 0,
            amount: jobMaterial.totalPrice || 0,
            notes: jobMaterial.notes || ''
          });
        } else if (jobMaterial.materialId) {
          // Fallback to materialId if material not found
          items.push({
            description: `Material (${jobMaterial.materialId.substring(0, 8)}...)`,
            quantity: jobMaterial.quantityUsed || 1,
            unitPrice: jobMaterial.unitPriceAtUse || 0,
            amount: jobMaterial.totalPrice || 0,
            notes: jobMaterial.notes || ''
          });
        }
      });
    } catch (error) {
      console.error('Error fetching job materials:', error);
      // Continue without materials if there's an error
    }

    // Add additional items if provided
    if (invoiceData.additionalItems && Array.isArray(invoiceData.additionalItems)) {
      invoiceData.additionalItems.forEach(item => {
        items.push({
          description: item.description || '',
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          amount: (item.quantity || 1) * (item.unitPrice || 0),
          notes: item.notes || ''
        });
      });
    }

    return items;
  }

  /**
   * Calculate due date based on payment terms
   */
  static calculateDueDate(invoiceDate, paymentTerms) {
    const date = new Date(invoiceDate);
    
    if (paymentTerms === 'net15') {
      date.setDate(date.getDate() + 15);
    } else if (paymentTerms === 'net30') {
      date.setDate(date.getDate() + 30);
    } else if (paymentTerms === 'net60') {
      date.setDate(date.getDate() + 60);
    } else if (paymentTerms === 'dueOnReceipt') {
      // Due immediately
      date.setDate(date.getDate());
    } else {
      // Default to 30 days
      date.setDate(date.getDate() + 30);
    }

    return date.toISOString();
  }

  /**
   * Calculate total
   */
  static calculateTotal(subtotal, tax) {
    return subtotal + tax;
  }

  /**
   * Format company address
   */
  static formatCompanyAddress(company) {
    const parts = [];
    if (company.address) parts.push(company.address);
    if (company.city || company.state || company.zipCode) {
      const cityStateZip = [company.city, company.state, company.zipCode]
        .filter(Boolean)
        .join(', ');
      if (cityStateZip) parts.push(cityStateZip);
    }
    return parts.join('\n');
  }

  /**
   * Format customer address
   */
  static formatCustomerAddress(customer) {
    // If customer has a single address field, use it
    if (customer.address) {
      return customer.address;
    }
    
    // Otherwise, build from components
    const parts = [];
    if (customer.street || customer.addressLine1) {
      parts.push(customer.street || customer.addressLine1);
    }
    if (customer.city || customer.state || customer.zipCode) {
      const cityStateZip = [customer.city, customer.state, customer.zipCode]
        .filter(Boolean)
        .join(', ');
      if (cityStateZip) parts.push(cityStateZip);
    }
    
    return parts.length > 0 ? parts.join('\n') : '';
  }

  /**
   * Get default invoice terms
   */
  static getDefaultTerms() {
    return `Payment is due within the terms specified above. Late payments may be subject to a late fee.`;
  }

  /**
   * Get user profile
   */
  static async getUserProfile() {
    try {
      const userId = this.getCurrentUserId();
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  /**
   * Generate PDF invoice
   * @param {Object} invoice - Invoice data
   * @returns {Promise<{success: boolean, pdfBlob?: Blob, error?: string}>}
   */
  static async generatePDF(invoice) {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = margin;

      // Load company logo if available
      let logoImage = null;
      if (invoice.companyLogo) {
        try {
          logoImage = await this.loadImage(invoice.companyLogo);
        } catch (error) {
          console.warn('Could not load logo:', error);
        }
      }

      // Header section
      if (logoImage) {
        doc.addImage(logoImage, 'PNG', margin, yPos, 40, 15);
      }
      
      // Company info (right side if logo exists, left side if not)
      const companyX = logoImage ? pageWidth - margin - 80 : margin;
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(invoice.companyName || 'Company Name', companyX, yPos + 10);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos += 15;
      
      if (invoice.companyAddress) {
        const addressLines = invoice.companyAddress.split('\n');
        addressLines.forEach(line => {
          doc.text(line, companyX, yPos);
          yPos += 5;
        });
      }

      if (invoice.companyPhone) {
        doc.text(`Phone: ${invoice.companyPhone}`, companyX, yPos);
        yPos += 5;
      }

      if (invoice.companyEmail) {
        doc.text(`Email: ${invoice.companyEmail}`, companyX, yPos);
        yPos += 5;
      }

      yPos += 10;

      // Invoice title and number
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('INVOICE', margin, yPos);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos += 10;
      
      doc.text(`Invoice #: ${invoice.invoiceNumber}`, margin, yPos);
      yPos += 5;
      doc.text(`Date: ${this.formatDate(invoice.invoiceDate)}`, margin, yPos);
      yPos += 5;
      doc.text(`Due Date: ${this.formatDate(invoice.dueDate)}`, margin, yPos);
      yPos += 5;
      doc.text(`Payment Terms: ${invoice.paymentTerms || 'Net 30'}`, margin, yPos);

      yPos += 10;

      // Bill To section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', margin, yPos);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos += 7;
      
      doc.text(invoice.customerName || 'Customer', margin, yPos);
      yPos += 5;
      
      if (invoice.customerAddress) {
        const addressLines = invoice.customerAddress.split('\n');
        addressLines.forEach(line => {
          doc.text(line, margin, yPos);
          yPos += 5;
        });
      }

      if (invoice.customerEmail) {
        doc.text(invoice.customerEmail, margin, yPos);
        yPos += 5;
      }

      yPos += 10;

      // Items table
      const tableData = invoice.items.map(item => [
        item.description || '',
        item.quantity || 1,
        this.formatCurrency(item.unitPrice || 0),
        this.formatCurrency(item.amount || 0)
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Description', 'Qty', 'Unit Price', 'Amount']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [16, 185, 129] }, // Primary green color
        styles: { fontSize: 9 },
        columnStyles: {
          1: { halign: 'center' },
          2: { halign: 'right' },
          3: { halign: 'right' }
        }
      });

      yPos = doc.lastAutoTable.finalY + 10;

      // Totals section
      const totalsX = pageWidth - margin - 60;
      doc.setFontSize(10);
      doc.text('Subtotal:', totalsX, yPos);
      doc.text(this.formatCurrency(invoice.subtotal || 0), pageWidth - margin, yPos, { align: 'right' });
      yPos += 7;

      if (invoice.tax && invoice.tax > 0) {
        doc.text(`Tax (${invoice.taxRate || 0}%):`, totalsX, yPos);
        doc.text(this.formatCurrency(invoice.tax || 0), pageWidth - margin, yPos, { align: 'right' });
        yPos += 7;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text('Total:', totalsX, yPos);
      doc.text(this.formatCurrency(invoice.total || 0), pageWidth - margin, yPos, { align: 'right' });

      yPos += 15;

      // Notes and Terms
      if (invoice.notes) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', margin, yPos);
        yPos += 7;
        doc.setFont('helvetica', 'normal');
        const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - 2 * margin);
        notesLines.forEach(line => {
          doc.text(line, margin, yPos);
          yPos += 5;
        });
        yPos += 5;
      }

      if (invoice.terms) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        const termsLines = doc.splitTextToSize(invoice.terms, pageWidth - 2 * margin);
        termsLines.forEach(line => {
          doc.text(line, margin, yPos);
          yPos += 4;
        });
      }

      // Generate blob
      const pdfBlob = doc.output('blob');
      
      return {
        success: true,
        pdfBlob,
        pdfUrl: URL.createObjectURL(pdfBlob)
      };
    } catch (error) {
      console.error('Error generating PDF:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate PDF'
      };
    }
  }

  /**
   * Load image from URL
   */
  static loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  /**
   * Format date for display
   */
  static formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  }

  /**
   * Format currency
   */
  static formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Get invoice by ID
   */
  static async getInvoice(invoiceId) {
    try {
      const invoiceDoc = await getDoc(doc(db, 'invoices', invoiceId));
      if (!invoiceDoc.exists()) {
        return { success: false, error: 'Invoice not found' };
      }

      const invoice = { id: invoiceDoc.id, ...invoiceDoc.data() };
      return { success: true, invoice };
    } catch (error) {
      console.error('Error getting invoice:', error);
      return {
        success: false,
        error: error.message || 'Failed to get invoice'
      };
    }
  }

  /**
   * Get all invoices
   */
  static async getInvoices(limitCount = 50, filters = {}) {
    try {
      const userId = this.getCurrentUserId();
      
      let q = query(
        collection(db, 'invoices'),
        where('userId', '==', userId),
        orderBy('invoiceDate', 'desc'),
        limit(limitCount)
      );

      // Apply filters
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }

      if (filters.customerId) {
        q = query(q, where('customerId', '==', filters.customerId));
      }

      const querySnapshot = await getDocs(q);
      const invoices = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      return {
        success: true,
        invoices
      };
    } catch (error) {
      console.error('Error getting invoices:', error);
      return {
        success: false,
        error: error.message || 'Failed to get invoices'
      };
    }
  }

  /**
   * Update invoice status
   */
  static async updateInvoiceStatus(invoiceId, status, additionalData = {}) {
    try {
      const updates = {
        status,
        updatedAt: new Date().toISOString(),
        ...additionalData
      };

      if (status === 'sent') {
        updates.sentAt = new Date().toISOString();
      }

      if (status === 'viewed') {
        updates.viewedAt = new Date().toISOString();
      }

      if (status === 'paid') {
        updates.paidAt = new Date().toISOString();
      }

      await updateDoc(doc(db, 'invoices', invoiceId), updates);

      return { success: true };
    } catch (error) {
      console.error('Error updating invoice status:', error);
      return {
        success: false,
        error: error.message || 'Failed to update invoice status'
      };
    }
  }

  /**
   * Send invoice via email using Firebase Cloud Functions
   */
  static async sendInvoiceEmail(invoiceId) {
    try {
      // Verify user is authenticated before calling the function
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return {
          success: false,
          error: 'You must be authenticated to send invoices'
        };
      }

      // Get fresh ID token to ensure it's valid
      const idToken = await currentUser.getIdToken(true);
      console.log('Auth check - User ID:', currentUser.uid);
      console.log('Auth check - Token obtained:', !!idToken);
      
      if (!idToken) {
        return {
          success: false,
          error: 'Failed to obtain authentication token'
        };
      }

      // Use HTTP endpoint instead of callable function to work around v2 auth bug
      // This pattern matches the Workside approach - manual token extraction
      const functionUrl = `https://us-central1-mi-factotum-field-service.cloudfunctions.net/sendInvoiceEmail`;
      
      console.log('Calling Cloud Function via HTTP with invoiceId:', invoiceId);
      console.log('Auth state check - currentUser:', auth.currentUser?.uid);
      
      // Make direct HTTP request with Authorization header (like Workside pattern)
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ invoiceId }),
        mode: 'cors'
      });
      
      let responseData;
      try {
        responseData = await response.json();
      } catch (e) {
        const responseText = await response.text();
        console.error('Failed to parse response as JSON:', responseText);
        throw new Error(`Server error: ${response.status} ${response.statusText}`);
      }
      
      if (!response.ok) {
        console.error('Response error:', responseData);
        throw new Error(responseData.error || responseData.message || `HTTP ${response.status}`);
      }
      
      const functionResult = responseData;
      
      if (functionResult && functionResult.success) {
        return {
          success: true,
          message: functionResult.message || 'Invoice sent successfully'
        };
      } else {
        return {
          success: false,
          error: functionResult?.error || 'Failed to send invoice'
        };
      }
    } catch (error) {
      console.error('Error sending invoice email:', error);
      
      // Handle Firebase Functions errors
      let errorMessage = 'Failed to send invoice email';
      if (error.code === 'functions/unauthenticated') {
        errorMessage = 'You must be authenticated to send invoices';
      } else if (error.code === 'functions/permission-denied') {
        errorMessage = 'You do not have permission to send this invoice';
      } else if (error.code === 'functions/invalid-argument') {
        errorMessage = 'Invalid invoice data';
      } else if (error.code === 'functions/not-found') {
        errorMessage = 'Invoice, company, or customer not found';
      } else if (error.code === 'functions/failed-precondition') {
        errorMessage = error.message || 'Customer has not consented to email invoices';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }
}

export default InvoiceService;

