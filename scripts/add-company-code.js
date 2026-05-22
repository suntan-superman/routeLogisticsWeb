/**
 * Script to add a company code to "Bakersfield Pest" company
 * Run with: node scripts/add-company-code.js
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

/**
 * Generate a random company code (6-8 characters, alphanumeric)
 */
function generateCompanyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar-looking chars (0, O, I, 1)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

async function addCompanyCode() {
  try {
    const companyName = 'Bakersfield Pest';
    
    console.log(`Searching for company: "${companyName}"...`);
    
    // Query companies collection
    const companiesRef = db.collection('companies');
    const snapshot = await companiesRef.where('name', '==', companyName).get();
    
    if (snapshot.empty) {
      console.log(`❌ No company found with name "${companyName}"`);
      process.exit(1);
    }
    
    if (snapshot.size > 1) {
      console.log(`⚠️  Warning: Found ${snapshot.size} companies with name "${companyName}"`);
    }
    
    // Update each matching company (should only be one)
    for (const doc of snapshot.docs) {
      const companyData = doc.data();
      const companyId = doc.id;
      
      // Check if code already exists
      if (companyData.code) {
        console.log(`ℹ️  Company "${companyName}" (ID: ${companyId}) already has code: ${companyData.code}`);
        console.log('   Skipping update...');
        continue;
      }
      
      // Generate new code
      const newCode = generateCompanyCode();
      
      // Update the company document
      await companiesRef.doc(companyId).update({
        code: newCode,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Successfully added code "${newCode}" to company "${companyName}" (ID: ${companyId})`);
    }
    
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
addCompanyCode();

