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

async function addServicesToCompany() {
  try {
    // Find the company by name
    const companiesRef = db.collection('companies');
    const snapshot = await companiesRef.where('name', '==', 'Bakersfield Pest').get();
    
    if (snapshot.empty) {
      console.log('No company found with name "Bakersfield Pest"');
      return;
    }
    
    const companyDoc = snapshot.docs[0];
    const companyId = companyDoc.id;
    
    console.log(`Found company: ${companyDoc.data().name} (ID: ${companyId})`);
    
    // Sample services - you can modify this array
    const services = [
      'General Pest Control',
      'Rodent Control',
      'Termite Treatment',
      'Bed Bug Treatment',
      'Mosquito Control',
      'Cockroach Control',
      'Ant Control',
      'Spider Control'
    ];
    
    // Update the company document
    await companyDoc.ref.update({
      services: services,
      serviceCategories: ['Pest Control', 'Rodent Control', 'Termite Treatment'],
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Successfully added ${services.length} services to company "${companyDoc.data().name}"`);
    console.log('Services:', services);
    
  } catch (error) {
    console.error('Error adding services:', error);
  } finally {
    process.exit(0);
  }
}

addServicesToCompany();

