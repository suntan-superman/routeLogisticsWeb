import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  getDocs, 
  query, 
  where,
  addDoc,
  deleteDoc,
  orderBy,
  limit,
  startAfter,
  serverTimestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import CompanyService from './companyService';

class EstimateService {
  // Get current user ID
  static getCurrentUserId() {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No user is currently signed in');
    }
    return user.uid;
  }

  // Get user profile
  static async getCurrentUserProfile() {
    try {
      const userId = this.getCurrentUserId();
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        return userDoc.data();
      }
      return null;
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Generate estimate number
  static async generateEstimateNumber() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `EST-${timestamp}-${random}`;
  }

  // Calculate valid until date (30 days from now)
  static calculateValidUntil() {
    const date = new Date();
    date.setDate(date.getDate() + 30);
    return date.toISOString().split('T')[0];
  }

  // Get all estimates for company
  static async getEstimates(limitCount = 1000, lastDoc = null, filters = {}, userProfile = null, companyId = null) {
    try {
      const userId = this.getCurrentUserId();
      const effectiveCompanyId = companyId || userProfile?.companyId;
      let q;

      if (userProfile?.role === 'super_admin') {
        if (effectiveCompanyId) {
          q = query(
            collection(db, 'estimates'),
            where('companyId', '==', effectiveCompanyId),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
        } else {
          q = query(
            collection(db, 'estimates'),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
          );
        }
      } else if (effectiveCompanyId) {
        q = query(
          collection(db, 'estimates'),
          where('companyId', '==', effectiveCompanyId),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      } else {
        q = query(
          collection(db, 'estimates'),
          where('userId', '==', userId),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(q);
      const estimates = [];

      snapshot.forEach((doc) => {
        estimates.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        estimates
      };
    } catch (error) {
      console.error('Error getting estimates:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get estimate by ID
  static async getEstimate(estimateId) {
    try {
      const estimateDoc = await getDoc(doc(db, 'estimates', estimateId));
      
      if (!estimateDoc.exists()) {
        return {
          success: false,
          error: 'Estimate not found'
        };
      }

      return {
        success: true,
        estimate: {
          id: estimateDoc.id,
          ...estimateDoc.data()
        }
      };
    } catch (error) {
      console.error('Error getting estimate:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create estimate
  static async createEstimate(estimateData) {
    try {
      const userId = this.getCurrentUserId();
      const userProfile = await this.getCurrentUserProfile();
      const estimateNumber = await this.generateEstimateNumber();
      const nowIso = new Date().toISOString();

      const estimate = {
        userId,
        companyId: estimateData.companyId || userProfile?.companyId || null,
        customerId: estimateData.customerId || null,
        customerName: (estimateData.customerName || '').trim(),
        serviceType: (estimateData.serviceType || '').trim(),
        scopeOfWork: estimateData.scopeOfWork || '',
        laborHours: estimateData.laborHours || 0,
        laborRate: estimateData.laborRate || 0,
        materialCost: estimateData.materialCost || 0,
        totalCost: estimateData.totalCost || 0,
        notes: estimateData.notes || '',
        estimateNumber: estimateNumber,
        status: 'draft',
        validUntil: estimateData.validUntil || this.calculateValidUntil(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const docRef = await addDoc(collection(db, 'estimates'), estimate);

      return {
        success: true,
        estimate: { id: docRef.id, ...estimate }
      };
    } catch (error) {
      console.error('Error creating estimate:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Update estimate
  static async updateEstimate(estimateId, updates) {
    try {
      const userId = this.getCurrentUserId();
      const nowIso = new Date().toISOString();

      await updateDoc(doc(db, 'estimates', estimateId), {
        ...updates,
        updatedAt: nowIso
      });

      return {
        success: true
      };
    } catch (error) {
      console.error('Error updating estimate:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete estimate
  static async deleteEstimate(estimateId) {
    try {
      await deleteDoc(doc(db, 'estimates', estimateId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting estimate:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get estimate materials
  static async getEstimateMaterials(estimateId) {
    try {
      const q = query(
        collection(db, 'estimateMaterials'),
        where('estimateId', '==', estimateId),
        orderBy('createdAt', 'asc')
      );

      const snapshot = await getDocs(q);
      const materials = [];

      snapshot.forEach((doc) => {
        materials.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        materials
      };
    } catch (error) {
      console.error('Error getting estimate materials:', error);
      return {
        success: false,
        error: error.message,
        materials: []
      };
    }
  }

  // Create estimate material
  static async createEstimateMaterial(materialData) {
    try {
      const userId = this.getCurrentUserId();
      const nowIso = new Date().toISOString();

      const estimateMaterial = {
        ...materialData,
        createdBy: userId,
        createdAt: nowIso,
        updatedAt: nowIso
      };

      const docRef = await addDoc(collection(db, 'estimateMaterials'), estimateMaterial);

      return {
        success: true,
        material: { id: docRef.id, ...estimateMaterial }
      };
    } catch (error) {
      console.error('Error creating estimate material:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Delete estimate material
  static async deleteEstimateMaterial(materialId) {
    try {
      await deleteDoc(doc(db, 'estimateMaterials', materialId));

      return {
        success: true
      };
    } catch (error) {
      console.error('Error deleting estimate material:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get estimate stats
  static async getEstimateStats(companyId = null) {
    try {
      const userId = this.getCurrentUserId();
      const userProfile = await this.getCurrentUserProfile();
      const effectiveCompanyId = companyId || userProfile?.companyId;

      let q;
      if (userProfile?.role === 'super_admin' && !effectiveCompanyId) {
        q = query(collection(db, 'estimates'));
      } else if (effectiveCompanyId) {
        q = query(
          collection(db, 'estimates'),
          where('companyId', '==', effectiveCompanyId)
        );
      } else {
        q = query(
          collection(db, 'estimates'),
          where('userId', '==', userId)
        );
      }

      const snapshot = await getDocs(q);
      const estimates = [];

      snapshot.forEach((doc) => {
        estimates.push(doc.data());
      });

      const stats = {
        total: estimates.length,
        draft: estimates.filter(e => e.status === 'draft').length,
        sent: estimates.filter(e => e.status === 'sent').length,
        accepted: estimates.filter(e => e.status === 'accepted').length,
        rejected: estimates.filter(e => e.status === 'rejected').length,
        totalValue: estimates.reduce((sum, e) => sum + (parseFloat(e.totalCost) || 0), 0)
      };

      return {
        success: true,
        stats
      };
    } catch (error) {
      console.error('Error getting estimate stats:', error);
      return {
        success: false,
        error: error.message,
        stats: {
          total: 0,
          draft: 0,
          sent: 0,
          accepted: 0,
          rejected: 0,
          totalValue: 0
        }
      };
    }
  }

  // Helper function to load image
  static loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  }

  // Format currency
  static formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  }

  // Format date
  static formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString + 'T12:00:00');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  // Generate PDF for estimate
  static async generatePDF(estimate, materials = []) {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 20;
      let yPos = margin;

      // Get company details
      let company = null;
      if (estimate.companyId) {
        const companyResult = await CompanyService.getCompany(estimate.companyId);
        if (companyResult.success) {
          company = companyResult.company;
        }
      }

      // Header section with company info
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text(company?.name || 'Company Name', margin, yPos);
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      yPos += 7;
      
      if (company?.address) {
        doc.text(company.address, margin, yPos);
        yPos += 5;
      }
      
      if (company?.city && company?.state && company?.zipCode) {
        doc.text(`${company.city}, ${company.state} ${company.zipCode}`, margin, yPos);
        yPos += 5;
      }

      if (company?.phone) {
        doc.text(`Phone: ${company.phone}`, margin, yPos);
        yPos += 5;
      }

      if (company?.email) {
        doc.text(`Email: ${company.email}`, margin, yPos);
        yPos += 5;
      }

      yPos += 10;

      // Estimate title and number
      doc.setFontSize(20);
      doc.setFont('helvetica', 'bold');
      doc.text('ESTIMATE', margin, yPos);
      yPos += 10;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Estimate #: ${estimate.estimateNumber || 'N/A'}`, margin, yPos);
      yPos += 6;
      
      doc.text(`Date: ${this.formatDate(estimate.createdAt?.split('T')[0])}`, margin, yPos);
      yPos += 6;

      doc.text(`Valid Until: ${this.formatDate(estimate.validUntil)}`, margin, yPos);
      yPos += 6;

      // Status badge
      doc.setFillColor(estimate.status === 'accepted' ? 34 : estimate.status === 'sent' ? 59 : 107, 
                       estimate.status === 'accepted' ? 197 : estimate.status === 'sent' ? 130 : 114, 
                       estimate.status === 'accepted' ? 94 : estimate.status === 'sent' ? 246 : 128);
      doc.roundedRect(margin, yPos - 3, 25, 6, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(estimate.status.toUpperCase(), margin + 2, yPos + 1);
      doc.setTextColor(0, 0, 0);
      
      yPos += 10;

      // Customer section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Customer:', margin, yPos);
      yPos += 7;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(estimate.customerName || 'N/A', margin, yPos);
      yPos += 15;

      // Service section
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Service Type:', margin, yPos);
      yPos += 7;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(estimate.serviceType || 'N/A', margin, yPos);
      yPos += 10;

      // Scope of Work section
      if (estimate.scopeOfWork) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Scope of Work:', margin, yPos);
        yPos += 7;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const scopeLines = doc.splitTextToSize(estimate.scopeOfWork, pageWidth - 2 * margin);
        scopeLines.forEach(line => {
          if (yPos > 270) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(line, margin, yPos);
          yPos += 5;
        });
        
        yPos += 5;
      }

      // Materials table (if any)
      if (materials && materials.length > 0) {
        if (yPos > 200) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Materials:', margin, yPos);
        yPos += 7;

        const materialTableData = materials.map(m => [
          m.materialName || 'N/A',
          `${m.quantity || 0} ${m.unit || ''}`,
          this.formatCurrency(m.unitPrice),
          this.formatCurrency(m.totalPrice)
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [['Material', 'Quantity', 'Unit Price', 'Total']],
          body: materialTableData,
          theme: 'grid',
          headStyles: {
            fillColor: [59, 130, 246],
            textColor: [255, 255, 255],
            fontStyle: 'bold'
          },
          styles: {
            fontSize: 10,
            cellPadding: 5
          },
          columnStyles: {
            0: { cellWidth: 'auto' },
            1: { cellWidth: 40, halign: 'center' },
            2: { cellWidth: 40, halign: 'right' },
            3: { cellWidth: 40, halign: 'right' }
          }
        });

        yPos = doc.lastAutoTable.finalY + 10;
      }

      // Cost breakdown
      if (yPos > 220) {
        doc.addPage();
        yPos = margin;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Cost Breakdown:', margin, yPos);
      yPos += 10;

      const laborCost = (estimate.laborHours || 0) * (estimate.laborRate || 0);
      const materialCost = estimate.materialCost || 0;
      const totalCost = estimate.totalCost || 0;

      // Create cost table
      const costTableData = [
        ['Labor', `${estimate.laborHours || 0} hours @ ${this.formatCurrency(estimate.laborRate || 0)}/hr`, this.formatCurrency(laborCost)],
        ['Materials', '', this.formatCurrency(materialCost)],
        ['', 'Total', this.formatCurrency(totalCost)]
      ];

      autoTable(doc, {
        startY: yPos,
        body: costTableData,
        theme: 'plain',
        styles: {
          fontSize: 11,
          cellPadding: 3
        },
        columnStyles: {
          0: { cellWidth: 60, fontStyle: 'bold' },
          1: { cellWidth: 80, halign: 'right' },
          2: { cellWidth: 40, halign: 'right' }
        },
        didParseCell: function(data) {
          // Make the total row bold and larger
          if (data.row.index === 2) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fontSize = 13;
            data.cell.styles.textColor = [37, 99, 235];
          }
        }
      });

      yPos = doc.lastAutoTable.finalY + 15;

      // Notes section
      if (estimate.notes) {
        if (yPos > 240) {
          doc.addPage();
          yPos = margin;
        }

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Notes:', margin, yPos);
        yPos += 7;

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const notesLines = doc.splitTextToSize(estimate.notes, pageWidth - 2 * margin);
        notesLines.forEach(line => {
          if (yPos > 280) {
            doc.addPage();
            yPos = margin;
          }
          doc.text(line, margin, yPos);
          yPos += 5;
        });
      }

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(128, 128, 128);
        doc.text(
          `Page ${i} of ${pageCount}`,
          pageWidth / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'center' }
        );
        doc.text(
          `Generated on ${new Date().toLocaleDateString('en-US')}`,
          pageWidth - margin,
          doc.internal.pageSize.getHeight() - 10,
          { align: 'right' }
        );
      }

      // Save PDF
      const fileName = `Estimate-${estimate.estimateNumber || 'draft'}.pdf`;
      doc.save(fileName);

      return {
        success: true,
        message: 'PDF generated successfully'
      };
    } catch (error) {
      console.error('Error generating PDF:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default EstimateService;

