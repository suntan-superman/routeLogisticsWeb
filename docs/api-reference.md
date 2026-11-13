# API Reference

## Firebase Configuration

### Project Details
- **Project ID**: `mi-factotum-field-service`
- **Auth Domain**: `mi-factotum-field-service.firebaseapp.com`
- **Storage Bucket**: `mi-factotum-field-service.firebasestorage.app`

### API Keys
```javascript
// Assumption: These are production keys - verify environment-specific usage
const firebaseConfig = {
  apiKey: "AIzaSyAEHhLccanbJalSN0Zbdnvq_CwSSbpllrg",
  authDomain: "mi-factotum-field-service.firebaseapp.com",
  projectId: "mi-factotum-field-service",
  storageBucket: "mi-factotum-field-service.firebasestorage.app",
  messagingSenderId: "1030013411579",
  appId: "1:1030013411579:web:37cdb1ce1e57c1e75c505e",
  measurementId: "G-VS61WKSG39"
};
```

## Firestore Collections

### Users Collection
**Path**: `/users/{userId}`

```javascript
{
  id: string,                    // User ID (Firebase Auth UID)
  email: string,                 // User email address
  name: string,                  // Full name
  phoneNumber: string,           // Phone number
  businessName: string,          // Business name
  address: string,               // Business address
  services: string[],           // Array of service types
  serviceCategories: string[],   // Array of service categories
  notificationsEnabled: boolean, // Notification preferences
  emailNotifications: boolean,   // Email notification setting
  smsNotifications: boolean,     // SMS notification setting
  createdAt: string,             // ISO timestamp
  updatedAt: string,             // ISO timestamp
  companyId: string,            // Reference to company (nullable)
  role: string                  // User role (admin, manager, technician)
}
```

### Customers Collection
**Path**: `/customers/{customerId}`

```javascript
{
  id: string,           // Customer ID
  userId: string,       // Owner user ID
  name: string,         // Customer name
  email: string,        // Customer email
  phone: string,        // Customer phone
  address: string,      // Customer address
  isActive: boolean,    // Active status
  createdAt: string,    // ISO timestamp
  updatedAt: string     // ISO timestamp
}
```

### Jobs Collection
**Path**: `/jobs/{jobId}`

```javascript
{
  id: string,              // Job ID
  userId: string,          // Owner user ID
  customerId: string,      // Customer reference
  serviceType: string,     // Type of service
  status: string,          // scheduled, in-progress, completed, cancelled
  priority: string,        // low, medium, high
  address: string,         // Job location
  notes: string,          // Job notes
  estimatedDuration: number, // Estimated hours
  actualHours: number,    // Actual hours worked
  totalCost: number,      // Total job cost
  assignedTo: string,     // Assigned team member
  date: string,          // Job date (YYYY-MM-DD)
  time: string,          // Job time (HH:MM)
  createdAt: string,      // ISO timestamp
  updatedAt: string,     // ISO timestamp
  completedAt: string     // ISO timestamp (nullable)
}
```

### Estimates Collection
**Path**: `/estimates/{estimateId}`

```javascript
{
  id: string,              // Estimate ID
  userId: string,          // Owner user ID
  customerId: string,      // Customer reference
  customerName: string,    // Customer name (denormalized)
  serviceType: string,     // Service type
  address: string,         // Service address
  notes: string,          // Estimate notes
  totalCost: number,      // Total estimate cost
  status: string,         // draft, sent, accepted, rejected
  estimateNumber: string,  // Auto-generated estimate number
  validUntil: string,      // ISO timestamp
  createdAt: string,       // ISO timestamp
  updatedAt: string        // ISO timestamp
}
```

### Companies Collection
**Path**: `/companies/{companyId}`

```javascript
{
  id: string,                    // Company ID
  ownerId: string,              // Owner user ID
  name: string,                 // Company name
  address: string,              // Company address
  phone: string,                // Company phone
  email: string,                // Company email
  website: string,              // Company website
  serviceCategories: string[],  // Service categories offered
  branding: {                   // Branding configuration
    primaryColor: string,
    secondaryColor: string,
    logo: string
  },
  createdAt: string,            // ISO timestamp
  updatedAt: string             // ISO timestamp
}
```

### Team Members Collection
**Path**: `/teamMembers/{teamMemberId}`

```javascript
{
  id: string,           // Team member ID
  companyId: string,    // Company reference
  userId: string,       // User reference
  name: string,         // Team member name
  email: string,        // Team member email
  phone: string,        // Team member phone
  role: string,        // Team member role
  isActive: boolean,   // Active status
  createdAt: string,    // ISO timestamp
  updatedAt: string     // ISO timestamp
}
```

### Estimate Templates Collection
**Path**: `/estimateTemplates/{templateId}`

```javascript
{
  id: string,              // Template ID
  userId: string,          // Owner user ID
  name: string,           // Template name
  description: string,    // Template description
  templateData: object,   // Template structure and defaults
  isActive: boolean,      // Active status
  usageCount: number,     // Usage counter
  createdAt: string,       // ISO timestamp
  updatedAt: string        // ISO timestamp
}
```

## Service APIs

### Authentication Service

#### Sign Up
```javascript
AuthService.signUp(email, password, userData)
// Returns: { success: boolean, user?: User, error?: string }
```

#### Sign In
```javascript
AuthService.signIn(email, password)
// Returns: { success: boolean, user?: User, error?: string }
```

#### Sign Out
```javascript
AuthService.signOut()
// Returns: Promise<void>
```

#### Update Profile
```javascript
AuthService.updateProfile(updates)
// Returns: { success: boolean, error?: string }
```

### Customer Service

#### Create Customer
```javascript
CustomerService.addCustomer(customerData)
// Returns: { success: boolean, customerId?: string, error?: string }
```

#### Get Customers
```javascript
CustomerService.getCustomers()
// Returns: { success: boolean, customers?: Customer[], error?: string }
```

#### Update Customer
```javascript
CustomerService.updateCustomer(customerId, customerData)
// Returns: { success: boolean, error?: string }
```

#### Delete Customer
```javascript
CustomerService.deleteCustomer(customerId)
// Returns: { success: boolean, error?: string }
```

### Job Service

#### Create Job
```javascript
JobService.addJob(jobData)
// Returns: { success: boolean, jobId?: string, error?: string }
```

#### Get Jobs by Date Range
```javascript
JobService.getJobsByDateRange(startDate, endDate)
// Returns: { success: boolean, jobs?: Job[], error?: string }
```

#### Get Today's Jobs
```javascript
JobService.getTodaysJobs()
// Returns: { success: boolean, jobs?: Job[], error?: string }
```

#### Update Job
```javascript
JobService.updateJob(jobId, jobData)
// Returns: { success: boolean, error?: string }
```

#### Delete Job
```javascript
JobService.deleteJob(jobId)
// Returns: { success: boolean, error?: string }
```

### Estimate Service

#### Create Estimate
```javascript
EstimateService.addEstimate(estimateData)
// Returns: { success: boolean, estimateId?: string, error?: string }
```

#### Get Estimates
```javascript
EstimateService.getEstimates()
// Returns: { success: boolean, estimates?: Estimate[], error?: string }
```

#### Update Estimate
```javascript
EstimateService.updateEstimate(estimateId, estimateData)
// Returns: { success: boolean, error?: string }
```

#### Delete Estimate
```javascript
EstimateService.deleteEstimate(estimateId)
// Returns: { success: boolean, error?: string }
```

#### Generate Estimate Number
```javascript
EstimateService.generateEstimateNumber()
// Returns: string (e.g., "EST-2025-001")
```

## Security Rules

### Firestore Security Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Customers - user-specific access
    match /customers/{customerId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
    
    // Jobs - user-specific access
    match /jobs/{jobId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
    
    // Estimates - user-specific access
    match /estimates/{estimateId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
    
    // Companies - owner-specific access
    match /companies/{companyId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.ownerId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.ownerId;
    }
    
    // Team Members - company owner access
    match /teamMembers/{teamMemberId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == get(/databases/$(database)/documents/companies/$(resource.data.companyId)).data.ownerId;
      allow create: if request.auth != null && 
        request.auth.uid == get(/databases/$(database)/documents/companies/$(request.resource.data.companyId)).data.ownerId;
    }
    
    // Estimate Templates - user-specific access
    match /estimateTemplates/{templateId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && 
        request.auth.uid == request.resource.data.userId;
    }
  }
}
```

## Error Handling

### Common Error Codes
- `auth/user-not-found`: User account not found
- `auth/wrong-password`: Incorrect password
- `auth/invalid-credential`: Invalid login credentials
- `auth/email-already-in-use`: Email already registered
- `auth/weak-password`: Password too weak
- `auth/too-many-requests`: Too many failed attempts
- `permission-denied`: Insufficient permissions
- `not-found`: Document not found
- `already-exists`: Document already exists

### Error Response Format
```javascript
{
  success: false,
  error: string,        // Human-readable error message
  code?: string,        // Error code for programmatic handling
  details?: object      // Additional error details
}
```

## Rate Limits

### Firebase Limits
- **Firestore**: 1 million reads/day (free tier)
- **Authentication**: 10,000 users (free tier)
- **Storage**: 1 GB (free tier)
- **Functions**: 125,000 invocations/month (free tier)

### Application Limits
- **API Calls**: No explicit rate limiting implemented
- **File Uploads**: Size limits per Firebase Storage rules
- **Concurrent Users**: Limited by Firebase plan

## Webhooks & Events

### TODO: Implement Webhooks
- Job status change notifications
- Customer creation alerts
- Estimate acceptance notifications
- Payment status updates

### Real-time Updates
- Firestore listeners for real-time data sync
- Authentication state changes
- Document updates and deletions

## External Integrations

### Syncfusion Components
- **License Key**: `ORg4AjUWIQA/Gnt3VVhhQlJDfV5AQmBIYVp/TGpJfl96cVxMZVVBJAtUQF1hTH5bd0diUX1WcnNQT2lVWkd2`
- **Components Used**: Schedule, Calendar, Charts
- **Documentation**: [Syncfusion React Components](https://ej2.syncfusion.com/react/documentation/)

### Google Maps API
- **Usage**: Location services and mapping
- **TODO**: Implement API key configuration
- **Documentation**: [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript)

## Performance Considerations

### Query Optimization
- Use composite indexes for complex queries
- Implement pagination for large datasets
- Cache frequently accessed data
- Use Firestore offline persistence

### Data Modeling
- Denormalize frequently accessed data
- Use subcollections for hierarchical data
- Implement proper indexing strategies
- Consider data archiving for old records

## Monitoring & Analytics

### Firebase Analytics
- User engagement tracking
- Feature usage analytics
- Performance monitoring
- Error tracking and reporting

### Custom Metrics
- Job completion rates
- Customer satisfaction scores
- Revenue tracking
- Service type performance

## Development & Testing

### Local Development
- Firebase emulators for local testing
- Environment-specific configurations
- Mock data for development
- Hot reloading for rapid iteration

### Testing APIs
- Unit tests for service functions
- Integration tests for Firebase operations
- E2E tests for critical user flows
- Performance testing for large datasets
