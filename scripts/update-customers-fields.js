/**
 * Script to update existing customers with missing fields (status, isActive, tracking fields, etc.)
 * Run with: node scripts/update-customers-fields.js
 */

import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  } catch (error) {
    console.error('Error initializing Firebase Admin:', error);
    console.log('\nTo run this script locally, you need:');
    console.log('1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable, OR');
    console.log('2. Run: gcloud auth application-default login');
    process.exit(1);
  }
}

const db = admin.firestore();

async function updateCustomers() {
  try {
    console.log('📋 Fetching all customers...');
    
    const customersSnapshot = await db.collection('customers').get();
    const customers = [];
    
    customersSnapshot.forEach(doc => {
      customers.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Found ${customers.length} customers`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const customer of customers) {
      const updates = {};
      let needsUpdate = false;
      
      // Add status if missing (default to 'approved')
      if (customer.status === undefined || customer.status === null) {
        updates.status = 'approved';
        needsUpdate = true;
      }
      
      // Add isActive if missing (default to true)
      if (customer.isActive === undefined || customer.isActive === null) {
        updates.isActive = true;
        needsUpdate = true;
      }
      
      // Add createdBy if missing (use userId)
      if (!customer.createdBy && customer.userId) {
        updates.createdBy = customer.userId;
        needsUpdate = true;
      }
      
      // Add createdByRole if missing (default to 'field_tech')
      if (!customer.createdByRole) {
        updates.createdByRole = 'field_tech';
        needsUpdate = true;
      }
      
      // Add approval fields if status is approved
      const finalStatus = updates.status || customer.status || 'approved';
      if (finalStatus === 'approved') {
        if (!customer.approvedBy && customer.userId) {
          updates.approvedBy = customer.userId;
          needsUpdate = true;
        }
        if (!customer.approvedAt && customer.createdAt) {
          updates.approvedAt = customer.createdAt;
          needsUpdate = true;
        }
      }
      
      // Add tracking fields if missing
      if (customer.totalJobs === undefined || customer.totalJobs === null) {
        updates.totalJobs = 0;
        needsUpdate = true;
      }
      
      if (customer.totalSpent === undefined || customer.totalSpent === null) {
        updates.totalSpent = 0;
        needsUpdate = true;
      }
      
      if (!customer.lastServiceDate) {
        updates.lastServiceDate = null;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        // Add updatedAt timestamp
        updates.updatedAt = new Date().toISOString();
        
        await db.collection('customers').doc(customer.id).update(updates);
        updatedCount++;
        console.log(`✅ Updated customer: ${customer.name || customer.id} (${Object.keys(updates).join(', ')})`);
      } else {
        skippedCount++;
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updatedCount} customers`);
    console.log(`   ⏭️  Skipped: ${skippedCount} customers (already have all fields)`);
    console.log(`   📋 Total: ${customers.length} customers`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating customers:', error);
    process.exit(1);
  }
}

updateCustomers();

