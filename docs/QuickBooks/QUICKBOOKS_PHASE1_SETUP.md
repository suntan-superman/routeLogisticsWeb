# QuickBooks Integration - Phase 1 Setup Guide

## Overview
This guide walks you through setting up Phase 1 of the QuickBooks integration, including OAuth configuration, secret setup, and initial testing.

## Prerequisites
1. QuickBooks Developer Account (https://developer.intuit.com/)
2. Firebase project with Cloud Functions enabled
3. Admin access to Firebase Console

## Step 1: Create QuickBooks OAuth App

1. Go to https://developer.intuit.com/
2. Sign in or create an account
3. Navigate to "My Apps" → "Create an app"
4. Select "QuickBooks Online" as the product
5. Fill in app details:
   - **App Name**: Route Logistics Integration
   - **App Type**: Web App
   - **Redirect URI**: `https://us-central1-mi-factotum-field-service.cloudfunctions.net/handleQuickBooksOAuthCallback`
   - **Development Redirect URI**: `http://localhost:5001/mi-factotum-field-service/us-central1/handleQuickBooksOAuthCallback` (for local testing)
6. Save and note your **Client ID** and **Client Secret**

## Step 2: Set Up Firebase Secrets

### Option A: Google Cloud Console (Recommended)

The Secrets UI is actually in Google Cloud Console, not Firebase Console:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Navigate to **Security** → **Secret Manager** (or search for "Secret Manager")
4. Click **"CREATE SECRET"** and create these three secrets:
   - **QUICKBOOKS_CLIENT_ID**: Your QuickBooks Client ID
   - **QUICKBOOKS_CLIENT_SECRET**: Your QuickBooks Client Secret
   - **QUICKBOOKS_ENCRYPTION_KEY**: Generate a 64-character hex string for token encryption
     ```bash
     # Generate encryption key (run in terminal)
     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
     ```

### Option B: Firebase CLI with Helper Script (Easiest)

1. Copy the example secrets file:
   ```bash
   cd functions
   cp .secrets.example .secrets
   ```

2. Edit `.secrets` file and fill in your values:
   - `QUICKBOOKS_CLIENT_ID`: Your QuickBooks Client ID
   - `QUICKBOOKS_CLIENT_SECRET`: Your QuickBooks Client Secret
   - `QUICKBOOKS_ENCRYPTION_KEY`: The encryption key (already generated above)

3. Run the helper script:
   ```bash
   node set-quickbooks-secrets.js
   ```

### Option C: Firebase CLI (Manual)

If you prefer to set secrets one at a time:

```bash
# Create a temp file with the secret value
echo "your_client_id_here" > temp_secret.txt

# Set the secret using the file
firebase functions:secrets:set QUICKBOOKS_CLIENT_ID --data-file temp_secret.txt

# Clean up
rm temp_secret.txt

# Repeat for other secrets...
```

## Step 3: Install Dependencies

```bash
cd functions
npm install node-quickbooks axios
```

## Step 4: Deploy Cloud Functions

```bash
# Deploy all QuickBooks functions
firebase deploy --only functions:initiateQuickBooksOAuth,functions:handleQuickBooksOAuthCallback,functions:disconnectQuickBooks,functions:getQuickBooksConnectionStatus,functions:syncCustomerToQuickBooks,functions:syncServicesToQuickBooks,functions:scheduledCustomerSync,functions:quickbooksWebhook
```

## Step 5: Configure Web App

The QuickBooks Settings page is already integrated into the web app:
- Route: `/quickbooks-settings`
- Navigation: Available in sidebar (admin only)
- Service: `miFactotumWeb/src/services/quickbooksService.js`
- Page: `miFactotumWeb/src/pages/QuickBooksSettingsPage.jsx`

## Step 6: Set Up Firestore Security Rules

Add these rules to your Firestore security rules:

```javascript
// QuickBooks Connections
match /quickbooksConnections/{companyId} {
  allow read, write: if request.auth != null && 
    (isSuperAdmin() || 
     (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == companyId &&
      isCompanyAdminOrSupervisor()));
}

// QuickBooks OAuth Sessions (temporary)
match /quickbooksOAuthSessions/{sessionId} {
  allow read, write: if request.auth != null;
}

// Sync Errors
match /syncErrors/{errorId} {
  allow read: if request.auth != null && 
    (isSuperAdmin() || 
     (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == resource.data.companyId &&
      isCompanyAdminOrSupervisor()));
  allow create: if false; // Only Cloud Functions can create
}

// Sync Conflicts
match /syncConflicts/{conflictId} {
  allow read: if request.auth != null && 
    (isSuperAdmin() || 
     (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == resource.data.companyId &&
      isCompanyAdminOrSupervisor()));
  allow create: if false; // Only Cloud Functions can create
}
```

## Step 7: Test the Integration

### 7.1 Connect QuickBooks

1. Log in to the web app as an admin
2. Navigate to "QuickBooks" in the sidebar
3. Click "Connect QuickBooks"
4. Authorize the app in QuickBooks
5. Verify connection status shows "Connected"

### 7.2 Test Customer Sync

1. Create or select a customer in Route Logistics
2. Manually trigger sync (via API or admin UI)
3. Verify customer appears in QuickBooks

### 7.3 Test Service Sync

1. Go to Company Settings → Services
2. Click "Sync Services to QuickBooks"
3. Verify services appear as Items in QuickBooks

## Troubleshooting

### OAuth Flow Fails
- Check redirect URI matches exactly in QuickBooks Developer Portal
- Verify secrets are set correctly in Firebase
- Check Cloud Functions logs: `firebase functions:log`

### Token Refresh Fails
- Verify `QUICKBOOKS_ENCRYPTION_KEY` is set correctly
- Check token expiration in Firestore `quickbooksConnections` collection
- Review Cloud Functions logs for refresh errors

### Sync Errors
- Check `syncErrors` collection in Firestore
- Review Cloud Functions logs
- Verify QuickBooks connection status is "active"

## Next Steps

After Phase 1 is working:
1. **Phase 2**: Implement invoice and payment sync
2. **Phase 3**: Add job costing and payroll sync
3. **Phase 4**: Inventory and vendor bill sync
4. **Phase 5**: Error management dashboard and certification

## Support

For issues or questions:
- Check Cloud Functions logs: `firebase functions:log`
- Review Firestore `syncErrors` collection
- Contact support: support@route-logistics.com

