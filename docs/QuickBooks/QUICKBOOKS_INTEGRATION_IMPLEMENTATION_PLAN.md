# QuickBooks Integration - Technical Implementation Plan

## Executive Summary

This document provides a comprehensive technical review of the QuickBooks Online integration requirements and a detailed implementation plan aligned with the existing Route Logistics codebase (Firebase, React Native, React).

## 1. Document Review Summary

### 1.1 Architecture Document Review
**Key Components Identified:**
- Integration Middleware layer (NEW) - maps Route Logistics data to QuickBooks format
- OAuth 2.0 authentication with refresh token management
- Two-way sync for customers and items/services
- One-way sync for invoices (RL → QBO) and payments (RL → QBO)
- Webhooks listener for QuickBooks change events
- Conflict resolution engine
- Audit logging and reconciliation tools

**Alignment with Current Codebase:**
- ✅ Firebase Cloud Functions already handle invoice creation (`syncInvoiceToCustomerPortal`)
- ✅ Customer data exists in `customers`, `portalCustomers`, `customerProfiles` collections
- ✅ Invoice data structure already includes all required fields
- ✅ Payment tracking exists via Stripe integration (`payments` collection)
- ⚠️ Need to add QuickBooks-specific fields (`accounting_record_id`, `quickbooks_customer_id`, etc.)

### 1.2 Roadmap Document Review
**Phase Breakdown:**
- **Phase 1 (Weeks 1-4)**: Foundation - OAuth, customer sync, service/items sync, middleware, admin UI
- **Phase 2 (Weeks 5-8)**: Invoice & Payment Automation
- **Phase 3 (Weeks 9-12)**: Job Costing & Payroll
- **Phase 4 (Weeks 13-16)**: Inventory, Vendor Bills, Enterprise Support
- **Phase 5 (Weeks 17-18)**: Polishing & Certification

**Recommended Approach:**
- Start with Phase 1 (Foundation) - critical for all subsequent phases
- Phase 2 can begin in parallel once Phase 1 customer sync is stable
- Phases 3-5 are enhancements that can be prioritized based on business needs

### 1.3 Developer Spec Review
**Technical Requirements:**
- OAuth 2.0 Authorization Code Flow with PKCE
- Refresh token rotation and automatic renewal
- Encrypted token storage
- Two-way sync for customers and items
- One-way sync for invoices and payments
- Webhook handling for QBO changes
- Error logging and retry mechanisms
- Conflict resolution (newest wins, manual review flags)

**Current Codebase Gaps:**
- ❌ No OAuth 2.0 implementation for QuickBooks
- ❌ No QuickBooks API client library
- ❌ No sync queue processor
- ❌ No webhook listener for QuickBooks
- ❌ No conflict resolution engine
- ✅ Error logging infrastructure exists (can extend)
- ✅ Admin dashboard exists (can add QuickBooks settings page)

## 2. Technical Architecture

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Route Logistics App                       │
│  (Mobile: React Native | Web: React)                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Cloud Functions                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  QuickBooks Integration Service (NEW)                │  │
│  │  - OAuth Manager                                     │  │
│  │  - Sync Queue Processor                              │  │
│  │  - Mapping Engine                                   │  │
│  │  - Webhook Handler                                  │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              QuickBooks Online API                          │
│  - Customers, Items, Invoices, Payments                     │
│  - Webhooks (customer/item changes)                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

**Invoice Sync Flow:**
1. Job completed in Route Logistics mobile app
2. Invoice created via `InvoiceService.createInvoiceFromJob()`
3. Firestore trigger: `syncInvoiceToCustomerPortal` (existing)
4. **NEW**: Firestore trigger: `syncInvoiceToQuickBooks`
5. QuickBooks Integration Service:
   - Maps invoice to QuickBooks format
   - Validates customer exists in QuickBooks
   - Creates invoice via QuickBooks API
   - Stores `quickbooks_invoice_id` in Firestore
   - Logs sync status

**Customer Sync Flow:**
1. Customer created/updated in Route Logistics
2. Sync queue processor runs every 10 minutes
3. Checks for customers needing sync (`quickbooks_sync_status: 'pending'`)
4. Maps customer data to QuickBooks format
5. Creates/updates customer in QuickBooks
6. Stores `quickbooks_customer_id` in Firestore
7. Updates sync status

**Payment Sync Flow:**
1. Payment processed via Stripe (existing)
2. Stripe webhook updates `payments` collection
3. **NEW**: Firestore trigger: `syncPaymentToQuickBooks`
4. Maps payment to QuickBooks format
5. Creates payment in QuickBooks linked to invoice
6. Updates invoice status in QuickBooks

## 3. Implementation Plan

### 3.1 Phase 1: Foundation (Weeks 1-4)

#### 3.1.1 OAuth 2.0 Implementation

**Files to Create:**
- `functions/services/quickbooksAuthService.js` - OAuth flow management
- `functions/services/quickbooksTokenManager.js` - Token storage and refresh

**Firestore Collections:**
```javascript
quickbooksConnections/{companyId}
├─ companyId (string)
├─ realmId (string) - QuickBooks company ID
├─ accessToken (string) - Encrypted
├─ refreshToken (string) - Encrypted
├─ tokenExpiresAt (timestamp)
├─ connectedAt (timestamp)
├─ lastSyncAt (timestamp)
├─ syncStatus (string) - 'active' | 'error' | 'disconnected'
└─ errorMessage (string) - Last error if syncStatus is 'error'
```

**OAuth Flow:**
1. Admin clicks "Connect QuickBooks" in dashboard
2. Redirects to QuickBooks OAuth authorization URL
3. User authorizes in QuickBooks
4. QuickBooks redirects back with authorization code
5. Cloud Function exchanges code for access/refresh tokens
6. Stores encrypted tokens in Firestore
7. Sets up automatic token refresh

**Code Structure:**
```javascript
// functions/services/quickbooksAuthService.js
class QuickBooksAuthService {
  static getAuthorizationUrl(companyId, redirectUri) {
    // Generate OAuth URL with PKCE
  }
  
  static async exchangeCodeForTokens(code, realmId) {
    // Exchange authorization code for tokens
  }
  
  static async refreshAccessToken(companyId) {
    // Refresh expired access token
  }
  
  static async revokeConnection(companyId) {
    // Revoke tokens and disconnect
  }
}
```

#### 3.1.2 QuickBooks API Client

**Files to Create:**
- `functions/services/quickbooksApiClient.js` - API wrapper

**Dependencies:**
```json
{
  "node-quickbooks": "^2.1.0",
  "crypto": "built-in",
  "axios": "^1.6.0"
}
```

**Code Structure:**
```javascript
// functions/services/quickbooksApiClient.js
class QuickBooksApiClient {
  constructor(companyId) {
    // Initialize with access token from Firestore
  }
  
  async getCustomer(customerId) { }
  async createCustomer(customerData) { }
  async updateCustomer(customerId, customerData) { }
  
  async getItem(itemId) { }
  async createItem(itemData) { }
  async updateItem(itemId, itemData) { }
  
  async createInvoice(invoiceData) { }
  async createPayment(paymentData) { }
  
  async handleWebhook(webhookPayload) { }
}
```

#### 3.1.3 Customer Sync (Two-Way)

**Files to Create:**
- `functions/services/quickbooksCustomerSync.js` - Customer sync logic
- `functions/scheduled/customerSyncScheduler.js` - Scheduled sync function

**Firestore Schema Updates:**
```javascript
customers/{customerId}
├─ ...existing fields...
├─ quickbooks_customer_id (string) - QBO customer ID
├─ quickbooks_sync_status (string) - 'synced' | 'pending' | 'error'
├─ quickbooks_synced_at (timestamp)
└─ quickbooks_sync_error (string) - Last error message
```

**Sync Logic:**
- Every 10 minutes: Check for customers with `quickbooks_sync_status: 'pending'`
- Map Route Logistics customer → QuickBooks Customer format
- Create/update in QuickBooks
- Store `quickbooks_customer_id` in Firestore
- Handle conflicts (email mismatch, duplicate names)

**Code Structure:**
```javascript
// functions/services/quickbooksCustomerSync.js
class QuickBooksCustomerSync {
  static async syncCustomerToQuickBooks(customerId, companyId) {
    // 1. Get customer from Firestore
    // 2. Get QuickBooks connection for company
    // 3. Map customer data to QBO format
    // 4. Check if customer exists in QBO (by email)
    // 5. Create or update in QBO
    // 6. Store quickbooks_customer_id
    // 7. Update sync status
  }
  
  static async syncQuickBooksToRouteLogistics(qboCustomerId, companyId) {
    // Handle webhook: QBO customer changed
    // 1. Get customer from QBO API
    // 2. Find matching customer in Firestore (by email)
    // 3. Update Firestore customer (if newer)
    // 4. Log conflict if manual review needed
  }
  
  static mapCustomerToQuickBooks(rlCustomer) {
    // Map Route Logistics customer format to QuickBooks format
    return {
      DisplayName: rlCustomer.name,
      PrimaryEmailAddr: { Address: rlCustomer.email },
      PrimaryPhone: { FreeFormNumber: rlCustomer.phone },
      BillAddr: {
        Line1: rlCustomer.address,
        City: rlCustomer.city,
        CountrySubDivisionCode: rlCustomer.state,
        PostalCode: rlCustomer.zipCode
      }
    };
  }
}
```

#### 3.1.4 Service/Item Sync (Two-Way)

**Files to Create:**
- `functions/services/quickbooksItemSync.js` - Item sync logic

**Firestore Schema Updates:**
```javascript
companies/{companyId}
├─ ...existing fields...
├─ services (array)
│  └─ {
│       name: string,
│       quickbooks_item_id: string,
│       quickbooks_sync_status: string
│     }
```

**Sync Logic:**
- Map Route Logistics services → QuickBooks Items
- Services become "Service" type items in QuickBooks
- Materials become "Non-Inventory" or "Inventory" items
- Sync runs when services are added/updated in company settings

**Code Structure:**
```javascript
// functions/services/quickbooksItemSync.js
class QuickBooksItemSync {
  static async syncServiceToQuickBooks(serviceName, companyId) {
    // 1. Get company from Firestore
    // 2. Check if service already synced (has quickbooks_item_id)
    // 3. Map service to QBO Item format
    // 4. Create/update Item in QBO
    // 5. Store quickbooks_item_id in company.services array
  }
  
  static mapServiceToQuickBooks(service) {
    return {
      Name: service.name,
      Type: "Service",
      IncomeAccountRef: {
        // Map to GL account from company settings
      },
      Taxable: true
    };
  }
}
```

#### 3.1.5 Admin UI: QuickBooks Settings

**Files to Create:**
- `miFactotumWeb/src/pages/QuickBooksSettingsPage.jsx` - Settings page
- `miFactotumWeb/src/services/quickbooksService.js` - Frontend service

**Features:**
- "Connect QuickBooks" button (OAuth flow)
- Connection status display
- Sync status dashboard
- Manual sync triggers
- Error log viewer
- Disconnect button

**Code Structure:**
```jsx
// miFactotumWeb/src/pages/QuickBooksSettingsPage.jsx
function QuickBooksSettingsPage() {
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [syncLogs, setSyncLogs] = useState([]);
  
  const handleConnect = async () => {
    // Call Cloud Function to get OAuth URL
    // Redirect to QuickBooks
  };
  
  const handleManualSync = async (type) => {
    // Trigger manual sync for customers/items/invoices
  };
  
  return (
    <div>
      <h1>QuickBooks Integration</h1>
      {connectionStatus === 'connected' ? (
        <ConnectionDashboard />
      ) : (
        <ConnectButton onClick={handleConnect} />
      )}
      <SyncLogs logs={syncLogs} />
    </div>
  );
}
```

### 3.2 Phase 2: Invoice & Payment Automation (Weeks 5-8)

#### 3.2.1 Invoice Sync

**Files to Create:**
- `functions/services/quickbooksInvoiceSync.js` - Invoice sync logic
- Update: `functions/index.js` - Add trigger for invoice sync

**Firestore Schema Updates:**
```javascript
invoices/{invoiceId}
├─ ...existing fields...
├─ quickbooks_invoice_id (string)
├─ quickbooks_sync_status (string)
├─ quickbooks_synced_at (timestamp)
└─ quickbooks_sync_error (string)
```

**Sync Trigger:**
```javascript
// functions/index.js
exports.syncInvoiceToQuickBooks = onDocumentWritten(
  'invoices/{invoiceId}',
  async (event) => {
    const invoice = event.data.after.data();
    
    // Only sync if:
    // 1. Invoice status is 'sent' or 'paid'
    // 2. Company has QuickBooks connected
    // 3. Invoice not already synced
    
    if (invoice.status === 'sent' || invoice.status === 'paid') {
      await QuickBooksInvoiceSync.syncInvoice(invoice.id, invoice.companyId);
    }
  }
);
```

**Invoice Mapping:**
```javascript
static mapInvoiceToQuickBooks(rlInvoice, qboCustomerId) {
  return {
    CustomerRef: { value: qboCustomerId },
    TxnDate: rlInvoice.invoiceDate,
    DueDate: rlInvoice.dueDate,
    Line: rlInvoice.items.map(item => ({
      Amount: item.amount,
      DetailType: "SalesItemLineDetail",
      SalesItemLineDetail: {
        ItemRef: { value: item.quickbooks_item_id },
        Qty: item.quantity,
        UnitPrice: item.unitPrice
      }
    })),
    // Add job photos as attachments
    // Add notes/terms
  };
}
```

#### 3.2.2 Payment Sync

**Files to Create:**
- `functions/services/quickbooksPaymentSync.js` - Payment sync logic
- Update: `functions/index.js` - Add trigger for payment sync

**Sync Trigger:**
```javascript
// functions/index.js
exports.syncPaymentToQuickBooks = onDocumentWritten(
  'payments/{paymentId}',
  async (event) => {
    const payment = event.data.after.data();
    
    // Only sync if payment status is 'succeeded'
    if (payment.status === 'succeeded' && !payment.quickbooks_synced) {
      await QuickBooksPaymentSync.syncPayment(payment.id, payment.companyId);
    }
  }
);
```

**Payment Mapping:**
```javascript
static mapPaymentToQuickBooks(rlPayment, qboInvoiceId) {
  return {
    CustomerRef: { value: rlPayment.quickbooks_customer_id },
    TotalAmt: rlPayment.amount,
    PaymentRefNum: rlPayment.paymentIntentId,
    TxnDate: rlPayment.createdAt,
    Line: [{
      Amount: rlPayment.amount,
      LinkedTxn: [{
        TxnId: qboInvoiceId,
        TxnType: "Invoice"
      }]
    }]
  };
}
```

### 3.3 Phase 3-5: Future Enhancements

**Phase 3: Job Costing & Payroll**
- Time tracking sync → QBO Timesheets
- Material usage → Item adjustments
- Job cost calculation engine

**Phase 4: Inventory & Vendor Bills**
- Inventory depletion tracking
- Vendor bill sync
- Multi-location support

**Phase 4: Polishing & Certification**
- Error management dashboard
- Stress testing
- Intuit partner certification

## 4. Security Considerations

### 4.1 Token Storage
- Encrypt refresh tokens at rest using Firebase Secrets
- Use `crypto` module for encryption/decryption
- Never log tokens in Cloud Functions logs
- Implement token rotation on refresh

### 4.2 OAuth Flow Security
- Use PKCE (Proof Key for Code Exchange) for OAuth
- Validate redirect URIs
- Implement CSRF protection
- Set appropriate token expiration times

### 4.3 API Security
- Validate company ownership before syncing
- Rate limit API calls to QuickBooks
- Implement retry logic with exponential backoff
- Handle API errors gracefully

### 4.4 Firestore Security Rules
```javascript
match /quickbooksConnections/{companyId} {
  allow read, write: if request.auth != null && 
    (isSuperAdmin() || 
     (exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
      get(/databases/$(database)/documents/users/$(request.auth.uid)).data.companyId == companyId &&
      isCompanyAdminOrSupervisor()));
}
```

## 5. Error Handling & Logging

### 5.1 Sync Error Collection
```javascript
syncErrors/{errorId}
├─ companyId (string)
├─ syncType (string) - 'customer' | 'invoice' | 'payment' | 'item'
├─ entityId (string) - ID of entity that failed to sync
├─ errorMessage (string)
├─ errorCode (string)
├─ retryCount (number)
├─ createdAt (timestamp)
└─ resolvedAt (timestamp)
```

### 5.2 Retry Logic
- Automatic retry for transient errors (network, rate limits)
- Exponential backoff (1min, 5min, 15min, 1hr)
- Max 3 automatic retries
- Manual retry button in admin dashboard
- Alert admin after 3 failed retries

### 5.3 Conflict Resolution
- Track last modified timestamps
- "Newest wins" for automatic resolution
- Flag conflicts for manual review:
  - Customer email mismatch
  - Invoice amount mismatch
  - Duplicate customer names

## 6. Testing Strategy

### 6.1 Unit Tests
- OAuth flow simulation
- Data mapping functions
- Error handling logic
- Token refresh logic

### 6.2 Integration Tests
- Full OAuth cycle (with test QuickBooks account)
- Customer sync (create, update, conflict)
- Invoice sync (with multiple line items)
- Payment sync (linked to invoice)
- Webhook handling

### 6.3 Test Requirements (from spec)
- ✅ Test full OAuth cycle including token expiry
- ✅ Validate invoice sync with multiple line items
- ✅ Validate customer merge scenarios
- ✅ Test sync interruption & recovery
- ✅ Confirm tax calculations match QBO rules

## 7. Dependencies

### 7.1 New NPM Packages
```json
{
  "node-quickbooks": "^2.1.0",
  "axios": "^1.6.0",
  "crypto": "built-in"
}
```

### 7.2 Firebase Services
- Cloud Functions (existing)
- Firestore (existing)
- Secrets Manager (for token encryption keys)

## 8. Implementation Checklist

### Phase 1: Foundation
- [ ] Set up QuickBooks Developer account
- [ ] Create OAuth app in QuickBooks Developer Portal
- [ ] Implement OAuth 2.0 flow
- [ ] Create token storage and refresh logic
- [ ] Build QuickBooks API client wrapper
- [ ] Implement customer sync (two-way)
- [ ] Implement service/item sync (two-way)
- [ ] Create admin UI for QuickBooks settings
- [ ] Add Firestore security rules
- [ ] Set up error logging

### Phase 2: Invoice & Payment
- [ ] Implement invoice sync trigger
- [ ] Map invoice data to QuickBooks format
- [ ] Handle invoice attachments (job photos)
- [ ] Implement payment sync trigger
- [ ] Link payments to invoices in QuickBooks
- [ ] Add sync status tracking
- [ ] Create sync error dashboard

### Phase 3-5: Future
- [ ] Time tracking sync
- [ ] Material usage tracking
- [ ] Inventory management
- [ ] Vendor bill sync
- [ ] Multi-location support
- [ ] Stress testing
- [ ] Intuit certification

## 9. Next Steps

1. **Review this plan** with the team
2. **Set up QuickBooks Developer account** and create OAuth app
3. **Start Phase 1 implementation** - OAuth and customer sync
4. **Test with sandbox QuickBooks account** before production
5. **Iterate based on feedback** from initial testing

## 10. Questions & Considerations

1. **GL Account Mapping**: How should services map to QuickBooks GL accounts? (Company-level settings?)
2. **Tax Handling**: Should tax be calculated in Route Logistics or QuickBooks? (Currently calculated in RL)
3. **Multi-Company**: Does one Route Logistics company = one QuickBooks company? (Yes, based on spec)
4. **Webhook Endpoint**: Where should QuickBooks webhooks be received? (Cloud Function HTTP endpoint)
5. **Sync Frequency**: Is 10 minutes acceptable for customer sync? (Can be adjusted)

---

**Document Version**: 1.0  
**Last Updated**: 2025-01-19  
**Author**: AI Assistant  
**Status**: Ready for Review

