# Web App Documentation

## Overview

The Route Logistics web app is a React-based administrative dashboard designed for business owners and administrators to manage their field service operations.

## Project Structure

```
routeLogisticsWeb/
├── src/
│   ├── App.jsx              # Main application component
│   ├── main.jsx             # Application entry point
│   ├── index.css            # Global styles and Tailwind imports
│   ├── components/          # Reusable UI components
│   │   ├── Layout.jsx        # Main layout with sidebar navigation
│   │   └── ProtectedRoute.jsx # Route protection wrapper
│   ├── contexts/            # React Context providers
│   │   └── AuthContext.jsx  # Authentication state management
│   ├── pages/               # Application pages
│   │   ├── HomePage.jsx     # Dashboard overview
│   │   ├── LoginPage.jsx    # User authentication
│   │   ├── CompanySetupPage.jsx # Multi-step company setup
│   │   ├── CustomerManagementPage.jsx # Customer CRUD operations
│   │   ├── EstimateTemplatesPage.jsx # Template management
│   │   ├── JobManagementPage.jsx # Job tracking and management
│   │   ├── CalendarPage.jsx # Syncfusion calendar view
│   │   └── ReportsPage.jsx  # Analytics and reporting
│   └── services/            # Business logic and API calls
│       ├── firebase.js      # Firebase configuration
│       ├── companyService.js # Company management
│       ├── customerService.js # Customer operations
│       ├── estimateTemplateService.js # Template operations
│       ├── jobManagementService.js # Job operations
│       └── reportingService.js # Analytics and reporting
├── public/                   # Static assets
├── package.json             # Dependencies and scripts
├── tailwind.config.js       # Tailwind CSS configuration
├── vite.config.js          # Vite build configuration
└── firestore-security-rules.txt # Database security rules
```

## Key Features

### Company Management
- Multi-step company setup wizard
- Business information configuration
- Service category management
- Team member administration
- Branding and logo customization

### Customer Management
- Comprehensive customer database
- Advanced search and filtering
- Customer statistics and analytics
- Bulk operations and CSV export
- Soft delete with restore functionality

### Job Management
- Job tracking and status management
- Team assignment and scheduling
- Financial tracking and reporting
- Job history and audit trail
- Export functionality for reporting

### Estimate Templates
- Pre-defined estimate templates
- Template customization and management
- Usage tracking and analytics
- Template duplication and sharing
- Default template library

### Calendar Integration
- Syncfusion calendar component
- Multiple view options (day, week, month, agenda)
- Job visualization with status colors
- Interactive job details
- Real-time updates

### Reporting & Analytics
- Comprehensive business analytics
- Revenue and performance metrics
- Customer analytics and retention
- Service type breakdown
- Monthly trends and forecasting
- Exportable reports

## Technical Implementation

### Framework & Build System
- **React 19.1.1** with modern hooks and features
- **Vite 7.1.7** for fast development and optimized builds
- **ES6+ JavaScript** with modern syntax
- **Hot Module Replacement** for instant development feedback

### State Management
- **React Context API** for global state (authentication)
- **TanStack Query** for server state management and caching
- **Local state** with useState and useReducer for component state

### Routing & Navigation
- **React Router DOM v6** for client-side routing
- **Protected routes** with authentication guards
- **Nested routing** for complex page structures
- **Programmatic navigation** for dynamic routing

### Styling & UI
- **Tailwind CSS v3.4** for utility-first styling
- **Heroicons** for consistent iconography
- **Framer Motion** for smooth animations
- **Custom CSS** for Syncfusion component styling
- **Responsive design** with mobile-first approach

### Firebase Integration
```javascript
// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAEHhLccanbJalSN0Zbdnvq_CwSSbpllrg",
  authDomain: "mi-factotum-field-service.firebaseapp.com",
  projectId: "mi-factotum-field-service",
  // ... other config
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

### Syncfusion Integration
```javascript
// Syncfusion license registration
import { registerLicense } from '@syncfusion/ej2-base';

registerLicense(
  "ORg4AjUWIQA/Gnt3VVhhQlJDfV5AQmBIYVp/TGpJfl96cVxMZVVBJAtUQF1hTH5bd0diUX1WcnNQT2lVWkd2"
);
```

## Service Layer Architecture

### Service Pattern
Each service follows a consistent pattern:
```javascript
class ServiceName {
  static getCurrentUserId() {
    // Get authenticated user ID
  }
  
  static async createItem(data) {
    // Create new item
  }
  
  static async getItems() {
    // Retrieve items
  }
  
  static async updateItem(id, data) {
    // Update existing item
  }
  
  static async deleteItem(id) {
    // Delete item
  }
}
```

### Service Implementations

#### CustomerService
- CRUD operations for customer management
- Search and filtering capabilities
- Soft delete with restore functionality
- Statistics and analytics
- CSV export functionality

#### JobManagementService
- Job creation and scheduling
- Status tracking and updates
- Team assignment
- Financial tracking
- Export and reporting

#### EstimateTemplateService
- Template CRUD operations
- Usage tracking and analytics
- Default template creation
- Template duplication
- Active/inactive status management

#### ReportingService
- Business analytics calculation
- Revenue and performance metrics
- Customer analytics
- Service breakdown analysis
- Monthly trend analysis
- Report generation and export

## UI Component Library

### Layout Components
- **Layout**: Main application layout with sidebar navigation
- **ProtectedRoute**: Authentication guard for protected pages
- **Modal**: Reusable modal component for forms and details

### Page Components
- **HomePage**: Dashboard with quick actions and overview
- **LoginPage**: Authentication form with error handling
- **CompanySetupPage**: Multi-step wizard for company configuration
- **CustomerManagementPage**: Comprehensive customer management interface
- **JobManagementPage**: Job tracking and management interface
- **CalendarPage**: Syncfusion calendar integration
- **ReportsPage**: Analytics dashboard with export capabilities

### Form Components
- **Input Fields**: Standardized form inputs with validation
- **Dropdowns**: Custom dropdown components with search
- **Date Pickers**: Date and time selection components
- **File Upload**: Drag-and-drop file upload component

## Authentication & Security

### Authentication Flow
1. User login with email/password
2. Firebase Auth token generation
3. User profile retrieval from Firestore
4. Protected route access based on authentication status
5. Automatic token refresh and session management

### Security Implementation
- **Firestore Security Rules**: User-specific data access
- **Route Protection**: Authentication guards on all protected routes
- **Input Validation**: Client and server-side validation
- **Error Handling**: Secure error messages without sensitive data exposure

### User Roles & Permissions
- **Admin**: Full access to all features
- **Manager**: Limited administrative access
- **Technician**: Read-only access to assigned jobs
- **Customer**: Limited portal access (future feature)

## Performance Optimizations

### Code Splitting
- Route-based code splitting with React.lazy()
- Dynamic imports for heavy components
- Bundle analysis and optimization

### Caching Strategy
- TanStack Query for API response caching
- Browser caching for static assets
- Service worker for offline functionality (planned)

### Bundle Optimization
- Tree shaking for unused code removal
- Vite's modern bundling with ES modules
- Image optimization and lazy loading
- CSS purging with Tailwind

## Development Workflow

### Local Development
```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Preview production build
yarn preview
```

### Environment Configuration
- Development: Local Firebase emulators
- Staging: Firebase preview channels
- Production: Firebase production environment

### Code Quality
- ESLint configuration for code consistency
- Prettier for code formatting
- Husky for pre-commit hooks
- Automated testing pipeline (planned)

## Deployment

### Firebase Hosting
```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login to Firebase
firebase login

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### Build Configuration
- Vite configuration for optimized builds
- Environment-specific builds
- CDN integration for static assets
- Custom domain configuration

## Monitoring & Analytics

### Application Monitoring
- Firebase Analytics integration
- Error tracking and reporting
- Performance monitoring
- User behavior analytics

### Business Metrics
- User engagement tracking
- Feature usage analytics
- Performance metrics
- Error rate monitoring

## Known Issues & Limitations

### Current Limitations
- Photo upload functionality placeholder only
- Advanced reporting features in development
- Real-time collaboration not implemented
- Offline functionality limited

### Browser Compatibility
- Modern browsers only (ES6+ support required)
- Mobile responsiveness optimized
- Touch device support
- Accessibility improvements needed

## Future Enhancements

### Planned Features
- [ ] Real-time collaboration
- [ ] Advanced reporting dashboard
- [ ] Photo management system
- [ ] Invoice generation
- [ ] Payment processing integration
- [ ] Customer portal
- [ ] Advanced search and filtering
- [ ] Bulk operations
- [ ] Data import/export
- [ ] API rate limiting

### Technical Improvements
- [ ] TypeScript migration
- [ ] Performance monitoring
- [ ] Automated testing
- [ ] CI/CD pipeline
- [ ] Progressive Web App features
- [ ] Service worker implementation
- [ ] Advanced caching strategies
- [ ] Micro-frontend architecture

## Development Guidelines

### Code Style
- Functional components with hooks
- Consistent naming conventions
- Proper error handling
- Component composition over inheritance

### Git Workflow
- Feature branch development
- Pull request reviews
- Automated testing
- Semantic versioning

### Documentation
- JSDoc comments for complex functions
- Component documentation
- API documentation
- User guide maintenance
