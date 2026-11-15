# QuickBooks Connection Process

This document explains how companies connect their QuickBooks Online account to Route Logistics for data synchronization.

## Overview

Route Logistics uses **OAuth 2.0 with PKCE** (Proof Key for Code Exchange) to securely connect to QuickBooks Online accounts. Each Route Logistics company can connect to one QuickBooks company, enabling two-way synchronization of customers, services, invoices, and payments.

## Prerequisites

- Company admin account in Route Logistics
- QuickBooks Online account (Sandbox or Production)
- QuickBooks App configured in Intuit Developer Portal
- Required permissions granted to the QuickBooks App

## Step-by-Step Connection Process

### Step 1: Navigate to QuickBooks Settings

1. Log in to Route Logistics web app as a **company admin**
2. Navigate to **QuickBooks Settings** from the main navigation menu
   - This page is only visible to company admins and super admins
3. The page will display "Not Connected" status if no connection exists

### Step 2: Initiate Connection

1. Click the **"Connect QuickBooks"** button
2. The system will:
   - Verify you are a company admin
   - Generate a secure OAuth authorization URL
   - Create a temporary OAuth session (expires in 10 minutes)
   - Open a popup window to QuickBooks authorization page

### Step 3: QuickBooks Authorization

1. **Popup window opens** to QuickBooks Online login page
2. **Log in** to your QuickBooks Online account
3. **Select company** (if you have multiple QuickBooks companies)
4. **Review permissions** requested by Route Logistics:
   - Read/write access to Customers
   - Read/write access to Items (Services)
   - Read/write access to Invoices
   - Read/write access to Payments
5. **Click "Authorize"** to grant permissions

### Step 4: Callback & Token Exchange

1. QuickBooks redirects to the callback URL:
   ```
   https://us-central1-mi-factotum-field-service.cloudfunctions.net/handleQuickBooksOAuthCallback
   ```
2. The callback function:
   - Verifies the OAuth session hasn't expired
   - Exchanges the authorization code for access and refresh tokens
   - Stores the encrypted connection in Firestore
   - Displays a success message
   - Automatically closes the popup window

### Step 5: Connection Complete

1. The QuickBooks Settings page automatically refreshes
2. Status changes to **"QuickBooks Connected"**
3. Displays:
   - Realm ID (QuickBooks company identifier)
   - Last sync timestamp
   - Connection date
4. You can now:
   - Sync customers to QuickBooks
   - Sync services/items to QuickBooks
   - Create invoices in QuickBooks
   - Sync payments from Stripe to QuickBooks

## What Gets Stored

The connection is stored in Firestore under `quickbooksConnections/{companyId}` with the following data:

```javascript
{
  companyId: "route-logistics-company-id",
  realmId: "quickbooks-company-realm-id",
  accessToken: "encrypted-access-token",
  refreshToken: "encrypted-refresh-token",
  tokenExpiresAt: Timestamp,
  syncStatus: "active" | "error",
  connectedAt: Timestamp,
  lastSyncAt: Timestamp,
  errorMessage: string (if syncStatus is "error")
}
```

### Security Features

- **Encrypted Storage**: All tokens are encrypted using AES-256 before storage
- **Company-Scoped**: Each Route Logistics company has its own isolated connection
- **Admin-Only Access**: Only company admins can connect/disconnect QuickBooks
- **Automatic Token Refresh**: Access tokens are refreshed automatically before expiration
- **Session Validation**: OAuth sessions expire after 10 minutes for security

## Connection Management

### Viewing Connection Status

- Navigate to **QuickBooks Settings** page
- Connection status is displayed at the top:
  - ✅ **Connected**: Green checkmark with Realm ID
  - ❌ **Not Connected**: Gray X icon
  - ⚠️ **Error**: Red warning icon with error message

### Disconnecting QuickBooks

1. Navigate to **QuickBooks Settings** page
2. Click **"Disconnect"** button
3. Confirm the disconnection
4. All synchronization will stop
5. Connection data is removed from Firestore
6. You can reconnect at any time

### Reconnecting After Disconnection

1. Follow the same connection process (Steps 1-5)
2. QuickBooks will prompt you to authorize again
3. New tokens will be generated and stored

## Token Refresh Process

Access tokens expire after **1 hour**. The system automatically refreshes tokens:

1. Before making any QuickBooks API call, the system checks token expiration
2. If expired or expiring soon, it uses the refresh token to get a new access token
3. The new access token is encrypted and stored
4. The API call proceeds with the fresh token

### Refresh Token Expiration

- Refresh tokens typically expire after **101 days** of inactivity
- If a refresh token expires, the connection status changes to "error"
- The company admin must reconnect to QuickBooks to generate new tokens

## Troubleshooting

### Connection Fails During OAuth

**Symptoms:**
- Popup window shows error message
- "Connection Failed" message displayed

**Possible Causes:**
1. OAuth session expired (waited more than 10 minutes)
2. QuickBooks app not properly configured
3. Redirect URI mismatch
4. Network connectivity issues

**Solutions:**
1. Try connecting again immediately
2. Verify QuickBooks app configuration in Intuit Developer Portal
3. Check that redirect URI matches exactly
4. Check browser console for errors

### Connection Shows "Error" Status

**Symptoms:**
- Connection status shows red warning icon
- Error message displayed
- Sync operations fail

**Possible Causes:**
1. Refresh token expired
2. QuickBooks company subscription expired
3. Permissions revoked in QuickBooks
4. Network/API issues

**Solutions:**
1. Click **"Disconnect"** and reconnect
2. Verify QuickBooks subscription is active
3. Re-authorize permissions in QuickBooks
4. Check QuickBooks API status

### Popup Window Blocked

**Symptoms:**
- Popup doesn't open
- Browser shows popup blocker warning

**Solutions:**
1. Allow popups for Route Logistics domain
2. Manually open popup if browser prompts
3. Try a different browser if issues persist

## Security Best Practices

1. **Admin Access Only**: Only grant company admin role to trusted users
2. **Regular Audits**: Periodically review connected QuickBooks accounts
3. **Monitor Sync Status**: Check QuickBooks Settings page regularly for errors
4. **Disconnect When Needed**: Disconnect if company no longer uses QuickBooks integration
5. **Token Security**: Tokens are encrypted at rest and transmitted over HTTPS only

## API Endpoints Used

### Frontend → Backend

- `POST /initiateQuickBooksOAuth`
  - Initiates OAuth flow
  - Returns authorization URL
  - Requires: `companyId`, `redirectUri`
  - Requires: Admin authentication

- `GET /getQuickBooksConnectionStatus`
  - Gets current connection status
  - Returns: Connection details, sync status, last sync time
  - Requires: `companyId` query parameter
  - Requires: Admin authentication

- `POST /disconnectQuickBooks`
  - Disconnects QuickBooks account
  - Removes connection from Firestore
  - Requires: `companyId`
  - Requires: Admin authentication

### QuickBooks → Backend

- `GET /handleQuickBooksOAuthCallback`
  - Handles OAuth callback from QuickBooks
  - Exchanges code for tokens
  - Stores connection
  - Returns: Success/error HTML page
  - Requires: `code`, `state`, `realmId` query parameters

## Data Synchronization

Once connected, the following data can be synchronized:

### Customers
- **Route Logistics → QuickBooks**: Automatic sync every 10 minutes
- **QuickBooks → Route Logistics**: Via webhook (when customer updated in QuickBooks)

### Services/Items
- **Route Logistics → QuickBooks**: Manual sync from Company Setup page
- **QuickBooks → Route Logistics**: Via webhook (when item updated in QuickBooks)

### Invoices
- **Route Logistics → QuickBooks**: Automatic when invoice is created and sent
- **QuickBooks → Route Logistics**: Via webhook (when invoice updated in QuickBooks)

### Payments
- **Route Logistics → QuickBooks**: Automatic when payment is processed via Stripe
- **QuickBooks → Route Logistics**: Via webhook (when payment received in QuickBooks)

## Important Notes

1. **One Connection Per Company**: Each Route Logistics company connects to exactly one QuickBooks company
2. **Sandbox vs Production**: The QuickBooks app can be configured for Sandbox (testing) or Production (live)
3. **Permissions**: The app requires read/write access to Customers, Items, Invoices, and Payments
4. **Data Ownership**: All data remains in the company's QuickBooks account
5. **Reversible**: Disconnection is immediate and reversible

## Support

If you encounter issues connecting QuickBooks:

1. Check this documentation for troubleshooting steps
2. Verify QuickBooks app configuration in Intuit Developer Portal
3. Review browser console for errors
4. Contact support with:
   - Company ID
   - Error message
   - Screenshots (if applicable)
   - Browser and version

---

**Last Updated**: 2025-01-XX  
**Version**: 1.0

