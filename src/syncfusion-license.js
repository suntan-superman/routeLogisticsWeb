// Syncfusion License Registration
import { registerLicense } from '@syncfusion/ej2-base';

// Register the Enterprise license key for all Syncfusion components
registerLicense(
  "Ngo9BigBOggjHTQxAR8/V1JEaF1cWmhIfEx1RHxQdld5ZFRHallYTnNWUj0eQnxTdEBjUHxecXJXR2BUVUV/X0leYw=="
);
// Also register for specific packages being used
try {
  // Register for Schedule components
  registerLicense(
    "Ngo9BigBOggjHTQxAR8/V1JEaF1cWmhIfEx1RHxQdld5ZFRHallYTnNWUj0eQnxTdEBjUHxecXJXR2BUVUV/X0leYw=="
  );
} catch (error) {
  console.warn('Syncfusion license registration warning:', error);
}

const licenseStatus = 'Syncfusion license registered';
export default licenseStatus;
