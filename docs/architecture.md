# Architecture Overview

## System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        MA[Mobile App<br/>React Native + Expo<br/>Field Technicians]
        WA[Web App<br/>React + Vite<br/>Administrators]
    end
    
    subgraph "Firebase Backend"
        FA[Firebase Auth<br/>User Management]
        FS[Firestore Database<br/>Document Storage]
        FST[Firebase Storage<br/>File Storage]
        FF[Firebase Functions<br/>Server Logic]
    end
    
    subgraph "External Services"
        SYNC[Syncfusion<br/>Calendar Components]
        MAPS[Google Maps<br/>Location Services]
        EMAIL[Email Service<br/>Notifications]
    end
    
    MA --> FA
    MA --> FS
    MA --> FST
    WA --> FA
    WA --> FS
    WA --> FST
    WA --> SYNC
    MA --> MAPS
    FF --> EMAIL
```

## Data Flow

```mermaid
sequenceDiagram
    participant MA as Mobile App
    participant WA as Web App
    participant FB as Firebase
    participant DB as Firestore
    
    MA->>FB: Authenticate User
    FB-->>MA: Auth Token
    
    MA->>DB: Create Job
    DB-->>MA: Job Created
    
    WA->>DB: Query Jobs
    DB-->>WA: Job Data
    
    WA->>DB: Update Job Status
    DB-->>MA: Real-time Update
```

## Technology Stack

### Mobile App (routeLogisticsMobile)
- **Framework:** React Native 0.81.5 with Expo SDK 54
- **Language:** JavaScript (ES6+)
- **State Management:** React Context API
- **Navigation:** React Navigation v7
- **Backend Integration:** Firebase SDK v12
- **Local Storage:** AsyncStorage
- **UI Framework:** Custom responsive components
- **Build System:** Expo CLI with EAS Build

### Web App (routeLogisticsWeb)
- **Framework:** React 19.1.1 with Vite 7.1.7
- **Language:** JavaScript (ES6+)
- **State Management:** React Context API + TanStack Query
- **Routing:** React Router DOM v6
- **Styling:** Tailwind CSS v3.4
- **UI Components:** Heroicons + Syncfusion
- **Backend Integration:** Firebase SDK v10
- **Build System:** Vite with modern bundling

### Backend Services
- **Authentication:** Firebase Auth
- **Database:** Firestore (NoSQL document database)
- **Storage:** Firebase Storage
- **Hosting:** Firebase Hosting (web app)
- **Functions:** Firebase Functions (serverless)
- **Security:** Firestore Security Rules

## Data Architecture

### Firestore Collections

```mermaid
erDiagram
    USERS {
        string id PK
        string email
        string name
        string phoneNumber
        string businessName
        string address
        array services
        array serviceCategories
        boolean notificationsEnabled
        boolean emailNotifications
        boolean smsNotifications
        timestamp createdAt
        timestamp updatedAt
        string companyId FK
        string role
    }
    
    CUSTOMERS {
        string id PK
        string userId FK
        string name
        string email
        string phone
        string address
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    
    JOBS {
        string id PK
        string userId FK
        string customerId FK
        string serviceType
        string status
        string priority
        string address
        string notes
        number estimatedDuration
        number actualHours
        number totalCost
        string assignedTo
        timestamp date
        string time
        timestamp createdAt
        timestamp updatedAt
        timestamp completedAt
    }
    
    ESTIMATES {
        string id PK
        string userId FK
        string customerId FK
        string customerName
        string serviceType
        string address
        string notes
        number totalCost
        string status
        string estimateNumber
        timestamp validUntil
        timestamp createdAt
        timestamp updatedAt
    }
    
    COMPANIES {
        string id PK
        string ownerId FK
        string name
        string address
        string phone
        string email
        string website
        array serviceCategories
        object branding
        timestamp createdAt
        timestamp updatedAt
    }
    
    TEAMMEMBERS {
        string id PK
        string companyId FK
        string userId FK
        string name
        string email
        string phone
        string role
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    
    ESTIMATETEMPLATES {
        string id PK
        string userId FK
        string name
        string description
        object templateData
        boolean isActive
        number usageCount
        timestamp createdAt
        timestamp updatedAt
    }
    
    USERS ||--o{ CUSTOMERS : owns
    USERS ||--o{ JOBS : creates
    USERS ||--o{ ESTIMATES : creates
    USERS ||--o{ COMPANIES : owns
    USERS ||--o{ ESTIMATETEMPLATES : creates
    CUSTOMERS ||--o{ JOBS : has
    CUSTOMERS ||--o{ ESTIMATES : receives
    COMPANIES ||--o{ TEAMMEMBERS : employs
```

## Security Architecture

### Authentication Flow
1. User signs up/in via Firebase Auth
2. JWT token issued and stored securely
3. Token validated on each request
4. User-specific data access enforced

### Authorization Rules
- Users can only access their own data
- Company owners can manage team members
- Firestore security rules enforce data isolation
- No cross-user data access permitted

### Data Protection
- All API calls require authentication
- Sensitive data encrypted in transit
- Local storage uses secure mechanisms
- No sensitive data in client-side code

## Performance Considerations

### Mobile App
- **Offline Support:** Local data caching with AsyncStorage
- **Image Optimization:** Responsive image loading
- **Bundle Size:** Code splitting and lazy loading
- **Memory Management:** Proper component cleanup

### Web App
- **Code Splitting:** Route-based lazy loading
- **Caching:** TanStack Query for API caching
- **Bundle Optimization:** Vite's modern bundling
- **CDN:** Firebase Hosting with global CDN

### Database
- **Indexing:** Composite indexes for complex queries
- **Pagination:** Cursor-based pagination for large datasets
- **Real-time Updates:** Firestore listeners for live data
- **Offline Sync:** Automatic conflict resolution

## Scalability Design

### Horizontal Scaling
- Stateless client applications
- Firebase auto-scales backend services
- CDN distribution for static assets
- Load balancing handled by Firebase

### Data Scaling
- Firestore handles automatic sharding
- Collection-based data organization
- Efficient query patterns
- Batch operations for bulk updates

## Monitoring and Analytics

### Application Monitoring
- Firebase Analytics integration
- Error tracking and reporting
- Performance monitoring
- User behavior analytics

### Business Metrics
- Job completion rates
- Revenue tracking
- Customer satisfaction
- Service type performance

## Development Environment

### Local Development
- Hot reloading for both apps
- Firebase emulators for local testing
- Environment-specific configurations
- Debug tools and logging

### Testing Strategy
- Unit tests for business logic
- Integration tests for Firebase services
- E2E tests for critical user flows
- Manual testing for UI/UX validation

## Deployment Architecture

### Mobile App Deployment
- **Development:** Expo development builds
- **Staging:** EAS Build with staging environment
- **Production:** App Store and Google Play Store
- **OTA Updates:** Expo Updates for JavaScript changes

### Web App Deployment
- **Development:** Local Vite dev server
- **Staging:** Firebase Hosting preview channels
- **Production:** Firebase Hosting with custom domain
- **CI/CD:** Automated builds on git push

## Future Architecture Considerations

### Planned Enhancements
- **Microservices:** Break down monolithic Firebase Functions
- **Caching Layer:** Redis for improved performance
- **Message Queue:** For async job processing
- **API Gateway:** Centralized API management

### Technology Upgrades
- **TypeScript Migration:** Add type safety
- **GraphQL:** More efficient data fetching
- **PWA Features:** Enhanced web app capabilities
- **Real-time Collaboration:** Multi-user editing
